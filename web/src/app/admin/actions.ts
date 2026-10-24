"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { adminApi, endSession, passwordMatches, requireAdmin, startSession } from "@/lib/admin";

export type ActionState = { ok?: string; error?: string; n?: number } | null;

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const opt = (f: FormData, k: string) => str(f, k) || undefined;

async function run(fn: () => Promise<unknown>, ok?: string): Promise<ActionState> {
  await requireAdmin();
  try {
    await fn();
  } catch (e) {
    return { error: (e as Error).message || "Something went wrong" };
  }
  refresh();
  return ok ? { ok, n: Date.now() } : null;
}

// ---------- session ----------

export async function login(_: ActionState, f: FormData): Promise<ActionState> {
  if (!passwordMatches(str(f, "password"))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { error: "That password isn't right." };
  }
  await startSession();
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

// ---------- partners ----------

const partnerFields = (f: FormData) => ({
  name: str(f, "name"),
  website: opt(f, "website"),
  category: opt(f, "category"),
  network: opt(f, "network"),
  contactName: opt(f, "contactName"),
  email: opt(f, "email"),
  sourceUrl: opt(f, "sourceUrl"),
  notes: opt(f, "notes"),
});

export async function addPartner(_: ActionState, f: FormData) {
  return run(() => adminApi("/partners", { method: "POST", body: partnerFields(f) }), "Partner added.");
}

/** Pasted rows: name, email, website, network, contact name, category, source URL (comma or tab separated). */
export async function importPartners(_: ActionState, f: FormData): Promise<ActionState> {
  const rows = str(f, "rows")
    .split(/\r?\n/)
    .map((l) => l.split(l.includes("\t") ? "\t" : ",").map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((c) => c[0] && !/^name$/i.test(c[0]))
    .map(([name, email, website, network, contactName, category, sourceUrl]) => ({
      name, email: email || undefined, website: website || undefined, network: network || undefined,
      contactName: contactName || undefined, category: category || undefined, sourceUrl: sourceUrl || undefined,
    }));
  if (!rows.length) return { error: "Paste at least one row." };
  let result: { added: number; skipped: number } = { added: 0, skipped: 0 };
  const state = await run(async () => {
    result = await adminApi("/partners/import", { method: "POST", body: { rows } });
  });
  return state?.error ? state : { ok: `Added ${result.added}. Skipped ${result.skipped} already in your list.` };
}

export async function updatePartner(id: string, _: ActionState, f: FormData) {
  return run(() => adminApi(`/partners/${id}`, { method: "PATCH", body: { ...partnerFields(f), email: str(f, "email"), status: opt(f, "status") } }), "Saved.");
}

export async function deletePartner(id: string) {
  await requireAdmin();
  await adminApi(`/partners/${id}`, { method: "DELETE" });
  redirect("/admin/partners");
}

export async function draftFirstEmail(partnerId: string) {
  return run(() => adminApi("/queue/draft", { method: "POST", body: { partnerIds: [partnerId] } }));
}

// ---------- queue ----------

export async function prepareQueue(): Promise<ActionState> {
  let r = { followUps: 0, firstEmails: 0 };
  const state = await run(async () => {
    r = await adminApi("/queue/prepare", { method: "POST" });
  });
  if (state?.error) return state;
  const total = r.followUps + r.firstEmails;
  return { ok: total ? `Prepared ${r.firstEmails} first email${r.firstEmails === 1 ? "" : "s"} and ${r.followUps} follow-up${r.followUps === 1 ? "" : "s"}.` : "Nothing new to prepare right now." };
}

export async function approveAll() {
  return run(() => adminApi("/queue/approve-all", { method: "POST" }));
}

export async function saveEmail(id: string, _: ActionState, f: FormData) {
  return run(() => adminApi(`/emails/${id}`, { method: "PATCH", body: { subject: str(f, "subject"), body: str(f, "body") } }), "Saved.");
}

export async function setEmail(id: string, action: "approve" | "unapprove" | "skip") {
  return run(() => adminApi(`/emails/${id}/${action}`, { method: "POST" }));
}

// ---------- inbox ----------

export async function checkInbox(): Promise<ActionState> {
  let r = { added: 0 };
  const state = await run(async () => {
    r = await adminApi("/inbox/check", { method: "POST" });
  });
  return state?.error ? state : { ok: r.added ? `${r.added} new message${r.added === 1 ? "" : "s"}.` : "No new messages." };
}

export async function markRead(id: string, read: boolean) {
  return run(() => adminApi(`/inbox/${id}/read?read=${read}`, { method: "POST" }));
}

// ---------- templates ----------

const templateFields = (f: FormData) => ({ name: str(f, "name"), step: Number(str(f, "step") || 0), subject: str(f, "subject"), body: str(f, "body") });

export async function saveTemplate(id: string, _: ActionState, f: FormData) {
  return run(() => adminApi(`/templates/${id}`, { method: "PATCH", body: templateFields(f) }), "Saved.");
}

export async function createTemplate(_: ActionState, f: FormData) {
  return run(() => adminApi("/templates", { method: "POST", body: templateFields(f) }), "Template added.");
}

export async function deleteTemplate(id: string) {
  return run(() => adminApi(`/templates/${id}`, { method: "DELETE" }));
}

// ---------- settings ----------

export async function saveSettings(_: ActionState, f: FormData) {
  const keys = ["dailyLimit", "sendStartHour", "sendEndHour", "followUp1Days", "followUp2Days", "fromName", "postalAddress", "signature"];
  const body: Record<string, string> = Object.fromEntries(keys.map((k) => [k, str(f, k)]).filter(([, v]) => v !== ""));
  body.postalAddress = str(f, "postalAddress");
  body.autoPrepare = f.get("autoPrepare") ? "true" : "false";
  return run(() => adminApi("/settings", { method: "PATCH", body }), "Settings saved.");
}

export async function setPaused(paused: boolean) {
  return run(() => adminApi("/settings", { method: "PATCH", body: { paused: String(paused) } }));
}

export async function testTelegram(): Promise<ActionState> {
  await requireAdmin();
  try {
    const r = await adminApi<{ ok: boolean }>("/telegram/test", { method: "POST" });
    return r.ok ? { ok: "Sent. Check Telegram on your phone." } : { error: "Telegram isn't set up yet, or the bot token or chat ID is wrong." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
