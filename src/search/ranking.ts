import { queryWords, type ShoppingRequest } from './shopping-request';

/**
 * Transparent ranking. The input type below deliberately has no affiliate program, commission, click or revenue
 * fields: ranking can only use what is true about the product and its prices, so it cannot be influenced by what a
 * store would pay us. A test also checks that results don't change when programs and commissions exist.
 */
export type CandidateOffer = {
  store: string;
  storeSlug: string;
  price: number;
  listPrice: number | null; // the store's own stated regular price, if it gave one
  deliveryNote: string | null;
  lastCheckedAt: Date;
  staleAfter: Date | null;
};

export type Candidate = {
  slug: string;
  title: string;
  categorySlug: string;
  categoryName: string;
  brand: string | null;
  description: string | null;
  attributesText: string; // flattened specs ("color: black size: 10"), empty if none
  priceUnit: string | null;
  offers: CandidateOffer[]; // only offers currently shown (fresh, trusted, in stock)
};

export type Components = { relevance: number; features: number; discount: number; price: number; freshness: number; confidence: number; preferred: number };

export type Ranked = {
  candidate: Candidate;
  bestPrice: number;
  cheapest: CandidateOffer;
  statedDiscountPct: number | null;
  score: number;
  components: Components;
  why: string[]; // verified reasons it fits
  unknowns: string[]; // what we could not confirm (never counted against it)
};

/** Weights sum to 1. Fit to the request dominates; value signals are secondary; nothing here is commercial. */
export const WEIGHTS: Components = { relevance: 0.4, features: 0.15, discount: 0.15, price: 0.15, freshness: 0.05, confidence: 0.05, preferred: 0.05 };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text: string, term: string) => new RegExp(`(^|[^a-z0-9])${esc(term)}`, 'i').test(text);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number, p = 4) => Math.round(n * 10 ** p) / 10 ** p;
const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

const text = {
  all: (c: Candidate) => `${c.title} ${c.brand ?? ''} ${c.categoryName} ${c.description ?? ''} ${c.attributesText}`.toLowerCase(),
  facts: (c: Candidate) => `${c.title} ${c.brand ?? ''} ${c.description ?? ''} ${c.attributesText}`.toLowerCase(),
};

const cheapestOffer = (c: Candidate) => c.offers.reduce((a, o) => (o.price < a.price ? o : a));

export function statedDiscount(c: Candidate): number | null {
  const o = cheapestOffer(c);
  if (o.listPrice == null || o.listPrice <= o.price) return null;
  return Math.round(((o.listPrice - o.price) / o.listPrice) * 100);
}

/** Hard constraints: deterministic yes/no filters. A constraint that can't be verified from the listing fails. */
export function passesHardConstraints(c: Candidate, req: ShoppingRequest): boolean {
  if (!c.offers.length) return false;
  if (req.category && c.categorySlug !== req.category) return false;
  const price = cheapestOffer(c).price;
  if (req.maxPrice !== undefined && price > req.maxPrice) return false;
  if (req.minPrice !== undefined && price < req.minPrice) return false;

  const facts = text.facts(c);
  if (req.excludedTerms.some((t) => hasWord(facts, t))) return false;

  if (req.brands.length) {
    const brand = (c.brand ?? '').toLowerCase();
    const ok = req.brands.some((b) => (brand && (brand === b || hasWord(brand, b))) || hasWord(c.title.toLowerCase(), b));
    if (!ok) return false;
  }

  const words = queryWords(req.query);
  if (words.length) {
    const all = text.all(c);
    if (!words.some((w) => all.includes(w))) return false;
  }
  return true;
}

function relevance(c: Candidate, req: ShoppingRequest): number {
  const words = queryWords(req.query);
  if (!words.length) return 1;
  const title = c.title.toLowerCase();
  const brandCat = `${c.brand ?? ''} ${c.categoryName}`.toLowerCase();
  const desc = `${c.description ?? ''} ${c.attributesText}`.toLowerCase();
  const sum = words.reduce((s, w) => s + (title.includes(w) ? 1 : brandCat.includes(w) ? 0.6 : desc.includes(w) ? 0.3 : 0), 0);
  return clamp01(sum / words.length);
}

function hoursAgo(d: Date, now: Date) {
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / 3600_000));
}

/** Filters by the hard constraints, then orders by the request's sort. Same input always gives the same order. */
export function rankCandidates(all: Candidate[], req: ShoppingRequest, now: Date = new Date()): Ranked[] {
  const pool = all.filter((c) => passesHardConstraints(c, req));
  if (!pool.length) return [];
  const prices = pool.map((c) => cheapestOffer(c).price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const facts = req.requiredFeatures;
  const preferred = req.preferredRetailers.map((p) => p.toLowerCase());

  const ranked = pool.map((c): Ranked => {
    const cheapest = cheapestOffer(c);
    const bestPrice = cheapest.price;
    const discountPct = statedDiscount(c);
    const factText = text.facts(c);
    const verified = facts.filter((f) => f.split(' ').every((w) => factText.includes(w)));
    const unverified = facts.filter((f) => !verified.includes(f));

    const window = cheapest.staleAfter ? cheapest.staleAfter.getTime() - cheapest.lastCheckedAt.getTime() : 0;
    const comps: Components = {
      relevance: relevance(c, req),
      features: facts.length ? verified.length / facts.length : 1,
      discount: discountPct === null ? 0 : clamp01(discountPct / 100),
      price: hi > lo ? (hi - bestPrice) / (hi - lo) : 0.5,
      freshness: window > 0 ? clamp01(1 - (now.getTime() - cheapest.lastCheckedAt.getTime()) / window) : 0.5,
      confidence: Math.min(1, c.offers.length / 3),
      preferred: c.offers.some((o) => preferred.some((p) => o.storeSlug.toLowerCase() === p || o.store.toLowerCase().includes(p))) ? 1 : 0,
    };
    const score = round((Object.keys(WEIGHTS) as (keyof Components)[]).reduce((s, k) => s + WEIGHTS[k] * comps[k], 0));

    const why: string[] = [];
    const words = queryWords(req.query);
    if (words.length && comps.relevance > 0) why.push(`Matches "${req.query}"${c.title.toLowerCase().includes(words[0]) ? ' in the title' : ''}.`);
    if (req.maxPrice !== undefined) why.push(`${usd(bestPrice)} is within your ${usd(req.maxPrice)} budget.`);
    if (verified.length) why.push(`The listing mentions: ${verified.join(', ')}.`);
    if (discountPct !== null) why.push(`${usd(bestPrice)} is ${discountPct}% below the store's own list price of ${usd(cheapest.listPrice!)}.`);
    if (c.offers.length > 1) why.push(`Sold by ${c.offers.length} verified stores; lowest is ${cheapest.store}.`);
    if (comps.preferred) why.push('Sold by one of your preferred stores.');
    why.push(`Price confirmed ${hoursAgo(cheapest.lastCheckedAt, now)} hours ago.`);

    const unknowns: string[] = [];
    if (discountPct === null) unknowns.push("The store hasn't stated a regular price, so no discount is claimed.");
    if (c.offers.length === 1) unknowns.push('Only one store lists it, so there is nothing to compare against.');
    for (const f of unverified) unknowns.push(`Could not confirm "${f}" from the listing.`);
    if (!c.brand) unknowns.push("The brand isn't stated in the listing.");

    return { candidate: c, bestPrice, cheapest, statedDiscountPct: discountPct, score, components: comps, why, unknowns };
  });

  const bySlug = (a: Ranked, b: Ranked) => a.candidate.slug.localeCompare(b.candidate.slug);
  const sorters: Record<ShoppingRequest['sort'], (a: Ranked, b: Ranked) => number> = {
    best_match: (a, b) => b.score - a.score || a.bestPrice - b.bestPrice || bySlug(a, b),
    lowest_price: (a, b) => a.bestPrice - b.bestPrice || b.score - a.score || bySlug(a, b),
    biggest_discount: (a, b) => (b.statedDiscountPct ?? -1) - (a.statedDiscountPct ?? -1) || b.score - a.score || bySlug(a, b),
  };
  return ranked.sort(sorters[req.sort]).slice(0, req.limit);
}
