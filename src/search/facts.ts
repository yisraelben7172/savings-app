import type { Ranked } from './ranking';

/** Store-supplied text is data, never instructions: strip control characters and angle brackets, and cap the length. */
export const safeText = (s: string | null | undefined, max = 160): string =>
  (s ?? '').replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const hoursAgo = (d: Date, now: Date) => Math.max(0, Math.round((now.getTime() - d.getTime()) / 3600_000));

/**
 * What the AI (and the public search API) is told about a result: verified facts only. No links, no descriptions
 * (the part of a feed most likely to contain injected instructions) and nothing commercial.
 */
export function dealFacts(r: Ranked, now: Date = new Date()) {
  const c = r.candidate;
  return {
    slug: c.slug,
    title: safeText(c.title, 200),
    category: safeText(c.categoryName, 40),
    brand: c.brand ? safeText(c.brand, 60) : null,
    bestPrice: r.bestPrice,
    priceUnit: c.priceUnit,
    storeStatedListPrice: r.cheapest.listPrice,
    statedDiscountPercent: r.statedDiscountPct,
    stores: [...c.offers]
      .sort((a, b) => a.price - b.price || a.store.localeCompare(b.store))
      .map((o) => ({ store: safeText(o.store, 60), price: o.price, delivery: o.deliveryNote ? safeText(o.deliveryNote, 120) : null, priceCheckedHoursAgo: hoursAgo(o.lastCheckedAt, now) })),
    whyItFits: r.why.map((w) => safeText(w, 240)),
    notConfirmed: r.unknowns.map((u) => safeText(u, 240)),
  };
}

export type DealFacts = ReturnType<typeof dealFacts>;
