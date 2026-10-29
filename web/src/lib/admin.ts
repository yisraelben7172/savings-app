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
export async function adminApi<T>(path: string, init: { method?: string; body?: unknown; csv?: string } = {}): Promise<T> {
  await requireAdmin();
  const contentType = init.csv !== undefined ? "text/csv" : init.body !== undefined ? "application/json" : undefined;
  const res = await fetch(`${API_URL}/api/admin${path}`, {
    method: init.method ?? "GET",
    headers: { "x-admin-key": process.env.ADMIN_API_KEY!, ...(contentType ? { "content-type": contentType } : {}) },
    body: init.csv ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
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

// ---------- catalog ----------

export type Health = "UNKNOWN" | "HEALTHY" | "DEGRADED" | "FAILING";
export type SourceStatus = "AWAITING_APPROVAL" | "ACTIVE" | "PAUSED" | "DISABLED";
export type SourceKind = "DEMO" | "CSV_FEED" | "XML_FEED" | "RETAILER_API" | "NETWORK_API" | "MANUAL";

export type Retailer = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  network: string;
  trustScore: number;
  approved: boolean;
  active: boolean;
  integrationType: "NONE" | "FEED" | "RETAILER_API" | "NETWORK_API" | "MANUAL";
  affiliateStatus: "NOT_APPLIED" | "APPLIED" | "APPROVED" | "REJECTED";
  supportedCategories: string[];
  linkCapability: string | null;
  complianceNotes: string | null;
  lastSyncAt: string | null;
  health: Health;
  healthNote: string | null;
  offerCount: number;
  shownOffers: number;
  sourceCount: number;
};

export type RowError = { row: number; code: string; message: string };

export type IngestionRun = {
  id: string;
  status: "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED";
  trigger: string;
  rowsRead: number;
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  markedOut: number;
  errors: RowError[] | null;
  startedAt: string;
  finishedAt: string | null;
};

export type Source = {
  id: string;
  name: string;
  kind: SourceKind;
  status: SourceStatus;
  merchantId: string | null;
  merchant: { id: string; name: string; domain: string } | null;
  accessMethod: string | null;
  agreementUrl: string | null;
  permissionNotes: string | null;
  allowedFields: string[];
  aiUseAllowed: boolean;
  attributionText: string | null;
  priceFreshnessHours: number;
  retentionDays: number | null;
  fullSnapshot: boolean;
  config: { columns?: Record<string, string>; categoryMap?: Record<string, string> } | null;
  approvedAt: string | null;
  approvedBy: string | null;
  lastRunAt: string | null;
  health: Health;
  healthNote: string | null;
  importable: boolean;
  offerCount?: number;
  staleOffers?: number;
  runs?: IngestionRun[];
  permittableFields?: string[];
};

export type CatalogHealth = {
  products: number;
  productsWithoutIdentifiers: number;
  legacyDemoDeals: number;
  offers: number;
  shownOffers: number;
  staleOffers: number;
  outOfStock: number;
  duplicateCandidates: { brand: string | null; ids: string[]; titles: string[] }[];
  invalidLinks: { id: string; store: string; url: string }[];
};

// ---------- AI usage ----------

export type AiWindow = {
  runs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  avgLatencyMs: number;
  p95LatencyMs: number | null;
  outcomes: Record<string, number>;
};

export type AiUsage = { budgetUsd: number; spentLast24hUsd: number; remainingUsd: number; priceNote: string; last24h: AiWindow; last7d: AiWindow; last30d: AiWindow };

export const AI_OUTCOME_LABEL: Record<string, string> = {
  ok: "Answered by the AI",
  fallback_nokey: "AI not set up (plain search)",
  fallback_budget: "Daily budget reached (plain search)",
  fallback_error: "AI call failed (plain search)",
  blocked_claim: "Unverified claim blocked (plain answer)",
  refusal: "AI declined (plain search)",
  limit: "Hit a limit (plain answer)",
};

// ---------- affiliate ----------

export type ProgramStatus = "NOT_APPLIED" | "APPLIED" | "APPROVED" | "REJECTED" | "PAUSED";
export type LinkMethod = "NONE" | "AMAZON_TAG" | "DEEPLINK_TEMPLATE";
export type CommissionStatus = "PENDING" | "APPROVED" | "REVERSED" | "PAID";

export type CommissionRow = {
  id: string;
  externalId: string;
  clickId: string | null;
  status: CommissionStatus;
  saleAmount: string | null;
  amount: string;
  occurredAt: string;
};

export type CommissionImportRun = {
  id: string;
  createdAt: string;
  rowsRead: number;
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  matched: number;
  errors: { row: number; code: string; message: string }[] | null;
};

export type Program = {
  id: string;
  merchantId: string;
  merchant: { id: string; name: string; domain: string };
  network: string;
  name: string;
  status: ProgramStatus;
  linkMethod: LinkMethod;
  accountTag: string | null;
  linkTemplate: string | null;
  allowedTrackingHosts: string[];
  disclosureText: string | null;
  bookingLinkTemplate: string | null;
  bookingLinkDocUrl: string | null;
  commissionNotes: string | null;
  applicationUrl: string | null;
  appliedAt: string | null;
  approvedAt: string | null;
  notes: string | null;
  reportConfig: { columns?: Record<string, string>; statusMap?: Record<string, string> } | null;
  imports?: CommissionImportRun[];
  commissions?: CommissionRow[];
};

export type AffiliateSummary = {
  plainClicks: number;
  programs: {
    id: string;
    name: string;
    network: string;
    status: ProgramStatus;
    linkMethod: LinkMethod;
    merchant: { name: string; domain: string };
    clicks30: { tracked: number; fallback: number; plain: number };
    commissions: Partial<Record<CommissionStatus, { count: number; amount: number; sales: number }>>;
  }[];
};

export const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = {
  NOT_APPLIED: "Not applied",
  APPLIED: "Applied, waiting",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAUSED: "Paused",
};

export const LINK_METHOD_LABEL: Record<LinkMethod, string> = {
  NONE: "None yet (plain links)",
  AMAZON_TAG: "Amazon tracking ID",
  DEEPLINK_TEMPLATE: "Network link template",
};

export const COMMISSION_LABEL: Record<CommissionStatus, string> = { PENDING: "Pending", APPROVED: "Approved", REVERSED: "Reversed", PAID: "Paid" };

export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  AWAITING_APPROVAL: "Awaiting approval",
  ACTIVE: "Active",
  PAUSED: "Paused",
  DISABLED: "Disabled",
};

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  DEMO: "Sample data",
  CSV_FEED: "CSV feed",
  XML_FEED: "XML feed",
  RETAILER_API: "Store API",
  NETWORK_API: "Affiliate network API",
  MANUAL: "Manual entry",
};

export const FIELD_LABEL: Record<string, string> = {
  title: "Product title",
  price: "Price",
  url: "Product link",
  list_price: "Was / list price",
  brand: "Brand",
  identifiers: "GTIN / UPC / MPN",
  description: "Description",
  image: "Images",
  delivery: "Delivery info",
  attributes: "Color / size",
};

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

/** Date only (US Eastern), for records like commissions where the day matters more than the time. */
export function day(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

export function when(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}
