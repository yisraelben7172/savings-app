"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { adminApi, requireAdmin, type CommissionImportRun } from "@/lib/admin";
import type { ActionState } from "./actions";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};

function pairs(text: string, keyLower = false) {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && v) out[keyLower ? k.toLowerCase() : k] = v;
  }
  return out;
}

export async function createProgram(_: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  let id = "";
  try {
    const p = await adminApi<{ id: string }>("/programs", {
      method: "POST",
      body: { merchantId: str(f, "merchantId"), network: str(f, "network").toLowerCase(), name: str(f, "name") },
    });
    id = p.id;
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/admin/affiliate/${id}`);
}

export async function saveProgram(id: string, _: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    await adminApi(`/programs/${id}`, {
      method: "PATCH",
      body: {
        name: str(f, "name") || undefined,
        status: str(f, "status") || undefined,
        linkMethod: str(f, "linkMethod") || undefined,
        accountTag: str(f, "accountTag"),
        linkTemplate: str(f, "linkTemplate"),
        allowedTrackingHosts: str(f, "allowedTrackingHosts").split(/[\s,]+/).filter(Boolean),
        disclosureText: str(f, "disclosureText") || undefined,
        bookingLinkTemplate: str(f, "bookingLinkTemplate"),
        bookingLinkDocUrl: str(f, "bookingLinkDocUrl"),
        commissionNotes: str(f, "commissionNotes") || undefined,
        applicationUrl: str(f, "applicationUrl") || undefined,
        notes: str(f, "notes") || undefined,
        reportConfig: { columns: pairs(str(f, "columns")), statusMap: pairs(str(f, "statusMap"), true) },
      },
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  return { ok: "Saved.", n: Date.now() };
}

export async function testLink(id: string, _: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const r = await adminApi<{ ok: boolean; url?: string; reason?: string }>(`/programs/${id}/test-link`, { method: "POST", body: { url: str(f, "url") } });
    return r.ok ? { ok: `A shopper would be sent to: ${r.url}`, n: Date.now() } : { error: r.reason ?? "Could not build a link." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const MAX_UPLOAD = 4 * 1024 * 1024;

export async function importCommissions(id: string, _: ActionState, f: FormData): Promise<ActionState> {
  await requireAdmin();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV report first." };
  if (file.size > MAX_UPLOAD) return { error: "That file is over 4 MB. Export a shorter date range." };
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) return { error: "Upload the report as a .csv file." };
  let r: CommissionImportRun;
  try {
    r = await adminApi<CommissionImportRun>(`/programs/${id}/commissions/import`, { method: "POST", csv: await file.text() });
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  return {
    ok: `Read ${r.rowsRead} rows: ${r.created} new, ${r.updated} updated, ${r.unchanged} unchanged, ${r.matched} matched to a click${r.rejected ? `. ${r.rejected} rejected; see the details below.` : "."}`,
    n: Date.now(),
  };
}
