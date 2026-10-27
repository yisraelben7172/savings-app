export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type Pastel = "sky" | "mint" | "blush" | "peach" | "teal" | "rose" | "butter" | "lilac";

export type Category = { slug: string; name: string; color: Pastel; dealCount: number };

export type Deal = {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  category: { slug: string; name: string; color: Pastel };
  originalPrice: number;
  bestPrice: number;
  priceUnit: string | null;
  discountPct: number;
  saved: number;
  isHot: boolean;
  goldOnly: boolean;
  goldEarlyAccess: boolean;
  storeCount: number;
  expiresAt: string | null;
};

export type Offer = {
  id: string;
  store: string;
  storeSlug: string;
  storeColor: Pastel;
  rating: number | null;
  verified: boolean;
  price: number;
  deliveryNote: string | null;
  speedRank: number;
  bestPrice: boolean;
  lastCheckedAt: string;
  attribution: string | null; // required by the data source's agreement, shown with the price
  disclosure: string | null; // wording an approved affiliate program requires next to its links
  goUrl: string;
};

export type DealDetail = Deal & {
  description: string | null;
  offers: Offer[];
  priceHistory: { price: number; date: string }[];
};

export type ChatReply = { reply: string; deals: Deal[]; compareSlugs?: string[] };

export type CompareItem = {
  slug: string;
  title: string;
  category: string;
  brand: string | null;
  priceUnit: string | null;
  bestPrice: number;
  cheapestStore: string;
  storeCount: number;
  statedListPrice: number | null;
  statedDiscountPercent: number | null;
  fastestDelivery: { store: string; note: string | null } | null;
  priceHistory: { days: number; low: number; high: number; average: number; currentVsAveragePercent: number; atLowest: boolean } | null;
  oldestPriceCheckHoursAgo: number;
  attributes: Record<string, string>;
};

export type Comparison = {
  items: CompareItem[];
  attributeKeys: string[];
  highlights: { lowestPrice: string[]; biggestStatedDiscount: string[]; mostStores: string[]; atLowestPriceInHistory: string[] };
  warnings: string[];
  unavailable: string[];
};

export type DealQuery = { category?: string; q?: string; maxPrice?: number; sort?: string; limit?: number };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export function getMeta() {
  return get<{ demoData: boolean }>("/meta");
}

export function getCategories() {
  return get<Category[]>("/categories");
}

export function getDeals(query: DealQuery = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") params.set(k, String(v));
  const qs = params.toString();
  return get<Deal[]>(`/deals${qs ? `?${qs}` : ""}`);
}

/** Returns null when the deal does not exist (or is hidden by the trust gate). */
export async function getDeal(slug: string): Promise<DealDetail | null> {
  const res = await fetch(`${API_URL}/api/deals/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} on /deals/${slug}`);
  return res.json();
}

/** Returns the comparison, or a plain-language reason it can't be made (not enough available deals, bad request). */
export async function getComparison(slugs: string[]): Promise<{ ok: true; data: Comparison } | { ok: false; message: string }> {
  const res = await fetch(`${API_URL}/api/compare?slugs=${encodeURIComponent(slugs.join(","))}`, { headers: { accept: "application/json" } });
  if (res.ok) return { ok: true, data: await res.json() };
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    return { ok: false, message: (Array.isArray(body?.message) ? body.message.join(" ") : body?.message) ?? "Those deals can't be compared." };
  }
  throw new Error(`API ${res.status} on /compare`);
}

export async function sendChat(message: string, history: { role: "user" | "assistant"; content: string }[]) {
  const res = await fetch(`${API_URL}/api/assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw new Error(`API ${res.status} on /assistant/chat`);
  return (await res.json()) as ChatReply;
}

/** Outbound store links always go through the API so clicks are logged and tagged. */
export function goHref(offer: Pick<Offer, "goUrl">, placement?: string) {
  return `${API_URL}${offer.goUrl}${placement ? `?src=${encodeURIComponent(placement)}` : ""}`;
}

export function money(v: number) {
  return `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

// ---------- Shopping plans ----------
export type PlanOption = {
  slug: string; title: string; brand: string | null; category: string; categorySlug: string; store: string; price: number; priceUnit: string | null;
  statedDiscountPercent: number | null; score: number; whyItFits: string[]; notConfirmed: string[]; priceCheckedHoursAgo: number;
};
export type PlanItemResult = {
  index: number; label: string; quantity: number; categorySlug: string | null; status: "matched" | "no_match"; chosen: number | null; options: PlanOption[]; note: string | null;
};
export type BudgetLine = { limit: number; spent: number; remaining: number; over: number };
export type PlanTotals = {
  total: number; byCategory: Record<string, number>; uncounted: { index: number; label: string; price: number; priceUnit: string }[];
  totalBudget: BudgetLine | null; categoryBudgets: Record<string, BudgetLine>; withinBudget: boolean;
};
export type Plan = {
  id: string; status: "RUNNING" | "READY" | "APPROVED" | "CANCELLED" | "FAILED"; version: number; error: string | null; approvedAt: string | null; expiresAt: string;
  input: { items: { label: string; quantity: number }[]; totalBudget?: number; categoryBudgets: Record<string, number> };
  result: { items: PlanItemResult[]; totals: PlanTotals; swaps: { index: number; from: string; to: string; saves: number }[]; notes: string[] } | null;
  steps: { kind: string; outcome: string; summary: string; durationMs: number }[];
};
export type PlanCall = { ok: true; plan: Plan } | { ok: false; message: string; changes?: { label: string; was: number; now: number | null }[]; plan?: Plan };

async function planCall(path: string, body?: unknown): Promise<PlanCall> {
  try {
    const res = await fetch(`${API_URL}/api/plans${path}`, {
      method: body === undefined && !path.endsWith("/cancel") ? "GET" : "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as (Plan & { message?: string | string[]; changes?: never; plan?: Plan }) | null;
    if (res.ok && json) return { ok: true, plan: json };
    const msg = Array.isArray(json?.message) ? json.message.join(" ") : json?.message;
    return { ok: false, message: msg ?? (res.status === 429 ? "Too many plans just now. Please wait a minute." : "Something went wrong. Please try again."), changes: (json as { changes?: never } | null)?.changes, plan: json?.plan };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Please try again." };
  }
}
export const createPlan = (body: unknown) => planCall("", body);
export const getPlan = (id: string) => planCall(`/${id}`);
export const cancelPlan = (id: string) => planCall(`/${id}/cancel`, {});
export const selectPlanOption = (id: string, index: number, slug: string, version: number) => planCall(`/${id}/select`, { index, slug, version });
export const approvePlan = (id: string, version: number) => planCall(`/${id}/approve`, { version });
