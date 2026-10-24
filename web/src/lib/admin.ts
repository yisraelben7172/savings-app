import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { API_URL } from "./api";

// Admin access: the owner signs in with ADMIN_PASSWORD; the website's server then calls the API with
// ADMIN_API_KEY. Neither value is ever sent to the browser.

const COOKIE = "vault_admin";
const WEEK = 7 * 24 * 3600;

export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_API_KEY);

const sign = (exp: string) =>
  createHmac("sha256", `${process.env.ADMIN_API_KEY}:${process.env.ADMIN_PASSWORD}`).update(`admin:${exp}`).digest("base64url");

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function passwordMatches(input: string) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const h = (s: string) => createHmac("sha256", "pw").update(s).digest();
  return expected.length > 0 && timingSafeEqual(h(input), h(expected));
}

export async function startSession() {
  const exp = String(Math.floor(Date.now() / 1000) + WEEK);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: WEEK,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  if (!adminConfigured()) return false;
  const v = (await cookies()).get(COOKIE)?.value ?? "";
  const [exp, sig] = v.split(".");
  if (!exp || !sig) return false;
  await connection(); // the expiry check reads the clock, so it must run per request
  if (Number(exp) * 1000 < Date.now()) return false;
  return same(sig, sign(exp));
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Calls the API's /api/admin/* routes. Checks the session first, so every admin read is protected. */
export async function adminApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  await requireAdmin();
  const res = await fetch(`${API_URL}/api/admin${path}`, {
    method: init.method ?? "GET",
    headers: { "x-admin-key": process.env.ADMIN_API_KEY!, ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = Array.isArray(j.message) ? j.message.join(", ") : (j.message ?? msg);
    } catch {}
    throw new Error(msg);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ---------- types (mirror the API responses) ----------

export type PartnerStatus = "NEW" | "CONTACTED" | "REPLIED" | "PARTNERED" | "DECLINED" | "OPTED_OUT" | "BOUNCED";
export type EmailStatus = "DRAFT" | "APPROVED" | "SENT" | "SKIPPED" | "FAILED";

export type Partner = {
  id: string;
  name: string;
  website: string | null;
  category: string | null;
  network: string | null;
  contactName: string | null;
  email: string | null;
  sourceUrl: string | null;
  status: PartnerStatus;
  notes: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OutreachEmail = {
  id: string;
  partnerId: string;
  step: number;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailStatus;
  approvedAt: string | null;
  sentAt: string | null;
  threadId: string | null;
  error: string | null;
  createdAt: string;
  partner?: { id: string; name: string; network?: string | null; status?: PartnerStatus };
};

export type InboundEmail = {
  id: string;
  gmailId: string;
  threadId: string | null;
  partnerId: string | null;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  body: string;
  kind: "reply" | "bounce" | "optout" | "other";
  read: boolean;
  receivedAt: string;
  partner?: { id: string; name: string; status: PartnerStatus } | null;
};

export type Template = { id: string; name: string; step: number; subject: string; body: string };

export type OutreachSummary = {
  partners: Partial<Record<PartnerStatus, number>>;
  drafts: number;
  approved: number;
  sent24h: number;
  unread: number;
  lastInboxCheck: string | null;
  sendingStatus: string;
  gmailConnected: boolean;
  gmailSender: string | null;
  telegramConnected: boolean;
};

export type Stats = {
  deals: { active: number; merchants: number };
  clicks: { today: number; week: number; month: number; days: { day: string; clicks: number }[]; top: { title: string; slug: string; n: number }[] };
  outreach: OutreachSummary;
};

export type Settings = Record<
  "paused" | "dailyLimit" | "sendStartHour" | "sendEndHour" | "followUp1Days" | "followUp2Days" | "autoPrepare" | "fromName" | "postalAddress" | "signature" | "pauseReason",
  string
>;

export const STATUS_LABEL: Record<PartnerStatus, string> = {
  NEW: "Not contacted",
  CONTACTED: "Waiting for reply",
  REPLIED: "Replied",
  PARTNERED: "Partner",
  DECLINED: "Declined",
  OPTED_OUT: "Opted out",
  BOUNCED: "Bad address",
};

export const STEP_LABEL = ["First email", "Follow-up 1", "Follow-up 2"];

export function when(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}
