import type { DealFacts } from '../search/facts';
import type { Comparison } from '../search/compare';

/**
 * The assistant may only state prices, percentages and store names that appear in what its tools returned (or that the
 * shopper themselves said). This checks the finished reply against those facts. A reply that fails is replaced by a
 * plain summary built from the same facts, so an invented price can never reach a shopper.
 */
export type DealRef = { title: string; brand: string | null; tokens: string[]; stores: Set<string> };
export type FactSet = { amounts: number[]; percents: number[]; stores: Set<string>; deals: DealRef[] };

const money = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
const percent = /(\d{1,3}(?:\.\d+)?)\s?%/g;
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;

export const amountsIn = (text: string) => [...text.matchAll(money)].map((m) => Number(m[1].replace(/,/g, '')));
export const percentsIn = (text: string) => [...text.matchAll(percent)].map((m) => Number(m[1]));

export function emptyFacts(): FactSet {
  return { amounts: [], percents: [], stores: new Set(), deals: [] };
}

const GENERIC = new Set(['with', 'that', 'this', 'your', 'from', 'only', 'wireless', 'running', 'shoes', 'laptop', 'headphones', 'inch', 'cream', 'night', 'nights']);
const wordsOf = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC.has(w));
const hasWord = (text: string, w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i').test(text);

/** Adds one search result's facts, including savings and price gaps the reply may legitimately quote. */
export function addDeal(f: FactSet, d: DealFacts) {
  const prices = d.stores.map((s) => s.price);
  f.amounts.push(d.bestPrice, ...prices);
  if (d.storeStatedListPrice != null) f.amounts.push(d.storeStatedListPrice, d.storeStatedListPrice - d.bestPrice);
  for (const a of prices) for (const b of prices) if (a > b) f.amounts.push(a - b);
  if (d.statedDiscountPercent != null) f.percents.push(d.statedDiscountPercent);
  d.stores.forEach((s) => f.stores.add(s.store));
  if (!f.deals.some((x) => x.title === d.title)) f.deals.push({ title: d.title, brand: d.brand, tokens: wordsOf(d.title), stores: new Set(d.stores.map((s) => s.store)) });
}

export function addComparison(f: FactSet, c: Comparison) {
  for (const r of c.items) {
    f.amounts.push(r.bestPrice);
    if (r.statedListPrice != null) f.amounts.push(r.statedListPrice, r.statedListPrice - r.bestPrice);
    if (r.statedDiscountPercent != null) f.percents.push(r.statedDiscountPercent);
    f.stores.add(r.cheapestStore);
    if (r.priceHistory) {
      f.amounts.push(r.priceHistory.low, r.priceHistory.high, r.priceHistory.average);
      f.percents.push(Math.abs(r.priceHistory.currentVsAveragePercent));
    }
  }
  const prices = c.items.map((r) => r.bestPrice);
  for (const a of prices) for (const b of prices) if (a > b) f.amounts.push(a - b);
}

export function checkReply(reply: string, facts: FactSet, knownStores: string[], userText: string): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const userAmounts = amountsIn(userText);
  const userPercents = percentsIn(userText);

  for (const a of amountsIn(reply)) {
    if (![...facts.amounts, ...userAmounts].some((k) => near(k, a))) problems.push(`The price $${a} isn't in the search results.`);
  }
  for (const p of percentsIn(reply)) {
    if (![...facts.percents, ...userPercents].some((k) => Math.abs(k - p) <= 1)) problems.push(`${p}% isn't in the search results.`);
  }
  const storesIn = (text: string) => knownStores.filter((s) => new RegExp(`(^|[^A-Za-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`).test(text));
  for (const s of storesIn(reply)) {
    if (!facts.stores.has(s) && !userText.includes(s)) problems.push(`${s} isn't one of the stores in the search results.`);
  }

  // A store named in the same sentence as a product must actually list that product.
  for (const sentence of reply.split(/(?<=[.!?])\s+/)) {
    const stores = storesIn(sentence).filter((s) => facts.stores.has(s));
    if (!stores.length) continue;
    const named = facts.deals.filter((d) => (d.brand && d.brand.length >= 3 && hasWord(sentence, d.brand.toLowerCase())) || uniqueTokens(d, facts.deals).some((t) => hasWord(sentence, t)));
    if (!named.length) continue;
    for (const s of stores) {
      if (!named.some((d) => d.stores.has(s))) problems.push(`${s} doesn't list ${named.map((d) => d.title).join(' or ')} in the search results.`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Title words that identify one deal among the ones returned (shared words like "wireless" can't). */
function uniqueTokens(d: DealRef, all: DealRef[]) {
  return d.tokens.filter((t) => all.filter((o) => o.tokens.includes(t)).length === 1);
}

/** A plain, fully verified answer built only from the facts. */
export function plainReply(deals: DealFacts[]): string {
  if (!deals.length) return "I couldn't find a trusted deal for that yet. Want me to alert you when one shows up?";
  const top = deals[0];
  const unit = top.priceUnit ? ` ${top.priceUnit}` : '';
  const more = deals.length > 1 ? ` I also found ${deals.length - 1} more below.` : '';
  return `The best match I found is ${top.title} at $${top.bestPrice}${unit}, lowest at ${top.stores[0].store}.${more} Prices can change at the store.`;
}
