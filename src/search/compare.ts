import type { CandidateOffer } from './ranking';

export type CompareItem = {
  slug: string;
  title: string;
  categorySlug: string;
  categoryName: string;
  brand: string | null;
  attributes: Record<string, string>;
  priceUnit: string | null;
  offers: CandidateOffer[]; // currently shown offers only
  history: { price: number; date: Date }[]; // oldest first
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const cheapest = (o: CandidateOffer[]) => o.reduce((a, b) => (b.price < a.price ? b : a));

/**
 * A side-by-side comparison computed entirely in code: prices, stated discounts, store counts and price-history facts.
 * It says what is true and what is missing; it never picks a "winner" on taste (the AI or the shopper does that).
 * Highlights list every item that ties.
 */
export function buildComparison(items: CompareItem[], now: Date = new Date()) {
  const rows = items.map((it) => {
    const best = cheapest(it.offers);
    const listPrice = best.listPrice != null && best.listPrice > best.price ? best.listPrice : null;
    const fastest = it.offers.filter((o) => o.deliveryNote).sort((a, b) => a.price - b.price)[0] ?? null;

    const prices = it.history.map((h) => h.price);
    let history: null | { days: number; low: number; high: number; average: number; currentVsAveragePercent: number; atLowest: boolean } = null;
    if (prices.length >= 2) {
      const first = it.history[0].date.getTime();
      const last = it.history[it.history.length - 1].date.getTime();
      const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
      const low = Math.min(...prices);
      history = {
        days: Math.round((last - first) / 864e5),
        low: round2(low),
        high: round2(Math.max(...prices)),
        average: round2(avg),
        currentVsAveragePercent: Math.round(((best.price - avg) / avg) * 100),
        atLowest: best.price <= low,
      };
    }
    const oldest = Math.min(...it.offers.map((o) => o.lastCheckedAt.getTime()));
    return {
      slug: it.slug,
      title: it.title,
      category: it.categoryName,
      brand: it.brand,
      priceUnit: it.priceUnit,
      bestPrice: best.price,
      cheapestStore: best.store,
      storeCount: it.offers.length,
      statedListPrice: listPrice,
      statedDiscountPercent: listPrice ? Math.round(((listPrice - best.price) / listPrice) * 100) : null,
      fastestDelivery: fastest ? { store: fastest.store, note: fastest.deliveryNote } : null,
      priceHistory: history,
      oldestPriceCheckHoursAgo: Math.max(0, Math.round((now.getTime() - oldest) / 3600_000)),
      attributes: it.attributes,
    };
  });

  const warnings: string[] = [];
  const sameUnit = new Set(rows.map((r) => r.priceUnit ?? '')).size === 1;
  const sameKind = new Set(items.map((i) => i.categorySlug)).size === 1;
  if (!sameKind) warnings.push("These are different kinds of products, so their prices aren't directly comparable and no lowest price is highlighted.");
  if (!sameUnit) warnings.push('Prices are quoted per different units (for example per day and per night), so the lowest price is not highlighted.');
  for (const r of rows) {
    if (r.storeCount === 1) warnings.push(`${r.title} is listed by only one store.`);
    if (!r.priceHistory) warnings.push(`${r.title} has no price history yet.`);
    if (r.statedDiscountPercent === null) warnings.push(`${r.title}: the store hasn't stated a regular price, so no discount is claimed.`);
  }

  const ties = <T>(pick: (r: (typeof rows)[number]) => T | null, better: (a: T, b: T) => boolean): string[] => {
    const have = rows.filter((r) => pick(r) !== null);
    if (!have.length) return [];
    const top = have.reduce((a, r) => (better(pick(r) as T, pick(a) as T) ? r : a));
    return have.filter((r) => pick(r) === pick(top)).map((r) => r.slug);
  };

  const attributeKeys = [...new Set(rows.flatMap((r) => Object.keys(r.attributes)))].sort();
  return {
    items: rows,
    attributeKeys,
    highlights: {
      lowestPrice: sameUnit && sameKind ? ties((r) => r.bestPrice, (a, b) => a < b) : [],
      biggestStatedDiscount: ties((r) => r.statedDiscountPercent, (a, b) => a > b),
      mostStores: ties((r) => r.storeCount, (a, b) => a > b),
      atLowestPriceInHistory: rows.filter((r) => r.priceHistory?.atLowest).map((r) => r.slug),
    },
    warnings,
  };
}

export type Comparison = ReturnType<typeof buildComparison>;
