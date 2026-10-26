import { buildComparison, type CompareItem } from '../src/search/compare';
import type { CandidateOffer } from '../src/search/ranking';

const NOW = new Date('2026-11-01T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 864e5);
const offer = (store: string, price: number, over: Partial<CandidateOffer> = {}): CandidateOffer => ({
  store, storeSlug: store.toLowerCase(), price, listPrice: null, deliveryNote: null, lastCheckedAt: new Date(NOW.getTime() - 5 * 3600_000), staleAfter: null, ...over,
});
const item = (slug: string, over: Partial<CompareItem> = {}): CompareItem => ({
  slug, title: slug.toUpperCase(), categorySlug: 'electronics', categoryName: 'Electronics', brand: null, attributes: {}, priceUnit: null,
  offers: [offer('Amazon', 100), offer('Target', 110)], history: [], ...over,
});

describe('comparison', () => {
  it('computes prices, stated discounts and store counts', () => {
    const c = buildComparison([
      item('a', { offers: [offer('Amazon', 80, { listPrice: 100, deliveryNote: 'Free delivery Tue' }), offer('Target', 85)] }),
      item('b', { offers: [offer('Walmart', 90)] }),
    ], NOW);
    expect(c.items[0]).toMatchObject({ bestPrice: 80, cheapestStore: 'Amazon', storeCount: 2, statedListPrice: 100, statedDiscountPercent: 20, fastestDelivery: { store: 'Amazon', note: 'Free delivery Tue' }, oldestPriceCheckHoursAgo: 5 });
    expect(c.items[1]).toMatchObject({ bestPrice: 90, statedListPrice: null, statedDiscountPercent: null });
    expect(c.highlights).toEqual({ lowestPrice: ['a'], biggestStatedDiscount: ['a'], mostStores: ['a'], atLowestPriceInHistory: [] });
  });

  it('lists every item that ties instead of inventing a winner', () => {
    const c = buildComparison([item('a', { offers: [offer('X', 50)] }), item('b', { offers: [offer('Y', 50)] }), item('c', { offers: [offer('Z', 70)] })], NOW);
    expect(c.highlights.lowestPrice.sort()).toEqual(['a', 'b']);
  });

  it('adds price-history facts and flags items at their lowest price', () => {
    const history = [100, 120, 110, 90].map((price, i) => ({ price, date: day(30 - i * 10) }));
    const c = buildComparison([item('a', { offers: [offer('X', 90)], history }), item('b', { offers: [offer('Y', 90)], history: [] })], NOW);
    expect(c.items[0].priceHistory).toEqual({ days: 30, low: 90, high: 120, average: 105, currentVsAveragePercent: -14, atLowest: true });
    expect(c.items[1].priceHistory).toBeNull();
    expect(c.highlights.atLowestPriceInHistory).toEqual(['a']);
    expect(c.warnings.join(' ')).toMatch(/B has no price history yet/);
  });

  it('warns about what cannot be compared', () => {
    const c = buildComparison([
      item('hotel', { categorySlug: 'hotels', categoryName: 'Hotels', priceUnit: 'per night', offers: [offer('Booking', 120)] }),
      item('car', { categorySlug: 'car-rentals', categoryName: 'Car rentals', priceUnit: 'per day', offers: [offer('Expedia', 40)] }),
    ], NOW);
    expect(c.highlights.lowestPrice).toEqual([]); // different units: no "lowest"
    const w = c.warnings.join(' ');
    expect(w).toMatch(/different kinds of products/);
    expect(w).toMatch(/different units/);
    expect(w).toMatch(/HOTEL is listed by only one store/);
    expect(w).toMatch(/hasn't stated a regular price/);
  });

  it('lines up attributes from real feeds', () => {
    const c = buildComparison([item('a', { attributes: { color: 'Black' } }), item('b', { attributes: { size: '10', color: 'Red' } })], NOW);
    expect(c.attributeKeys).toEqual(['color', 'size']);
  });
});
