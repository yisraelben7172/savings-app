import { passesHardConstraints, rankCandidates, statedDiscount, WEIGHTS, type Candidate, type CandidateOffer } from '../src/search/ranking';
import { requestFromText, type ShoppingRequest } from '../src/search/shopping-request';

const NOW = new Date('2026-11-01T12:00:00Z');
const hours = (h: number) => new Date(NOW.getTime() - h * 3600_000);

const offer = (store: string, price: number, over: Partial<CandidateOffer> = {}): CandidateOffer => ({
  store, storeSlug: store.toLowerCase(), price, listPrice: null, deliveryNote: null, lastCheckedAt: hours(2), staleAfter: new Date(hours(2).getTime() + 24 * 3600_000), ...over,
});
const deal = (slug: string, title: string, over: Partial<Candidate> = {}): Candidate => ({
  slug, title, categorySlug: 'clothing', categoryName: 'Clothing', brand: null, description: null, attributesText: '', priceUnit: null, offers: [offer('Zappos', 60)], ...over,
});
const req = (over: Partial<ShoppingRequest> = {}): ShoppingRequest => ({ ...requestFromText(''), query: '', limit: 8, ...over });
const slugs = (c: Candidate[], r: ShoppingRequest) => rankCandidates(c, r, NOW).map((x) => x.candidate.slug);

describe('hard constraints', () => {
  const shoes = deal('road-shoes', "Men's road running shoes", { brand: 'Brooks', offers: [offer('Zappos', 70), offer('Amazon', 64)] });
  const trail = deal('trail-shoes', 'Waterproof trail runners', { brand: 'Salomon', offers: [offer('REI', 120)] });
  const boots = deal('boots', 'Leather hiking boots', { brand: 'Danner', offers: [offer('REI', 90)] });
  const lamp = deal('lamp', 'Desk lamp', { categorySlug: 'home', categoryName: 'Home', offers: [offer('Target', 25)] });
  const all = [shoes, trail, boots, lamp];

  it('budget uses the cheapest currently shown offer and is exact', () => {
    expect(slugs(all, req({ query: 'shoes', maxPrice: 64 }))).toEqual(['road-shoes']);
    expect(slugs(all, req({ query: 'shoes', maxPrice: 63.99 }))).toEqual([]);
    expect(slugs(all, req({ category: 'clothing', minPrice: 100 }))).toEqual(['trail-shoes']);
  });

  it('category is exact', () => {
    expect(slugs(all, req({ category: 'home' }))).toEqual(['lamp']);
  });

  it('excluded terms remove anything whose listing mentions them, matched from the start of a word', () => {
    expect(slugs(all, req({ category: 'clothing', excludedTerms: ['leather'] }))).not.toContain('boots');
    expect(slugs(all, req({ category: 'clothing', excludedTerms: ['boot'] }))).not.toContain('boots'); // plural still matches
    expect(slugs(all, req({ category: 'clothing', excludedTerms: ['ather'] }))).toContain('boots'); // mid-word fragments don't
  });

  it('a brand limit needs evidence: a known brand or the brand in the title', () => {
    expect(slugs(all, req({ category: 'clothing', brands: ['brooks'] }))).toEqual(['road-shoes']);
    const noBrand = deal('x', 'Nike air shoes', { brand: null });
    expect(slugs([noBrand, deal('y', 'Plain shoes', { brand: null })], req({ query: 'shoes', brands: ['nike'] }))).toEqual(['x']);
  });

  it('a query that matches nothing returns nothing, never something unrelated', () => {
    expect(slugs(all, req({ query: 'espresso machine' }))).toEqual([]);
  });

  it('deals with no currently shown offers are never returned', () => {
    expect(slugs([deal('none', 'Shoes', { offers: [] })], req({ query: 'shoes' }))).toEqual([]);
  });

  it('passesHardConstraints is the same decision the ranker uses', () => {
    expect(passesHardConstraints(shoes, req({ query: 'running', maxPrice: 100 }))).toBe(true);
    expect(passesHardConstraints(shoes, req({ query: 'running', maxPrice: 10 }))).toBe(false);
  });
});

describe('ranking is transparent and fair about what it does not know', () => {
  it('a missing regular price is unknown, not a penalty or an invented discount', () => {
    const withList = deal('a', 'Running shoes', { offers: [offer('Zappos', 60, { listPrice: 100 })] });
    const without = deal('b', 'Running shoes', { offers: [offer('Zappos', 60)] });
    const [first, second] = rankCandidates([without, withList], req({ query: 'running shoes' }), NOW);
    expect(first.candidate.slug).toBe('a');
    expect(first.statedDiscountPct).toBe(40);
    expect(second.statedDiscountPct).toBeNull();
    expect(second.unknowns.join(' ')).toMatch(/hasn't stated a regular price/);
    expect(statedDiscount(without)).toBeNull();
    expect(statedDiscount(deal('c', 'x', { offers: [offer('Z', 60, { listPrice: 55 })] }))).toBeNull(); // list <= price: no claim
  });

  it('unverified features are not excluded; verified ones rank higher, and the gap is stated', () => {
    const confirmed = deal('w', 'Waterproof running shoes');
    const unclear = deal('u', 'Running shoes');
    const ranked = rankCandidates([unclear, confirmed], req({ query: 'running shoes', requiredFeatures: ['waterproof'] }), NOW);
    expect(ranked.map((r) => r.candidate.slug)).toEqual(['w', 'u']);
    expect(ranked[0].why.join(' ')).toMatch(/waterproof/);
    expect(ranked[1].unknowns.join(' ')).toMatch(/Could not confirm "waterproof"/);
  });

  it('explains itself with verified reasons', () => {
    const [r] = rankCandidates([deal('a', 'Running shoes', { brand: 'Brooks', offers: [offer('Zappos', 60, { listPrice: 100 }), offer('Amazon', 70)] })], req({ query: 'running shoes', maxPrice: 80 }), NOW);
    expect(r.why).toEqual(expect.arrayContaining([
      '$60 is within your $80 budget.',
      "$60 is 40% below the store's own list price of $100.",
      'Sold by 2 verified stores; lowest is Zappos.',
      'Price confirmed 2 hours ago.',
    ]));
  });

  it('weights sum to one and none of them is commercial', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(Object.keys(WEIGHTS).sort()).toEqual(['confidence', 'discount', 'features', 'freshness', 'preferred', 'price', 'relevance']);
  });

  it('is deterministic and breaks ties by price, then slug', () => {
    const c = [deal('b', 'Shoes', { offers: [offer('Z', 50)] }), deal('a', 'Shoes', { offers: [offer('Z', 50)] }), deal('c', 'Shoes', { offers: [offer('Z', 40)] })];
    const first = slugs(c, req({ query: 'shoes' }));
    expect(first).toEqual(slugs([...c].reverse(), req({ query: 'shoes' })));
    expect(first[0]).toBe('c'); // cheapest wins the tie on score
    expect(first.slice(1)).toEqual(['a', 'b']);
  });

  it('sort modes change the order but never the set of allowed results', () => {
    const c = [
      deal('cheap', 'Running shoes', { offers: [offer('Z', 30)] }),
      deal('deal', 'Running shoes', { offers: [offer('Z', 50, { listPrice: 100 })] }),
      deal('dear', 'Running shoes', { offers: [offer('Z', 90)] }),
    ];
    expect(slugs(c, req({ query: 'shoes', sort: 'lowest_price' }))).toEqual(['cheap', 'deal', 'dear']);
    expect(slugs(c, req({ query: 'shoes', sort: 'biggest_discount' }))[0]).toBe('deal');
    expect([...slugs(c, req({ query: 'shoes', sort: 'lowest_price' }))].sort()).toEqual([...slugs(c, req({ query: 'shoes' }))].sort());
  });

  it('preferred stores give a small boost, not a takeover', () => {
    const c = [deal('a', 'Running shoes', { offers: [offer('Zappos', 60)] }), deal('b', 'Running shoes', { offers: [offer('REI', 60)] })];
    expect(slugs(c, req({ query: 'shoes', preferredRetailers: ['rei'] }))[0]).toBe('b');
    const strong = deal('best', 'Running shoes', { offers: [offer('Zappos', 20, { listPrice: 100 })] });
    expect(slugs([strong, deal('pref', 'Running shoes', { offers: [offer('REI', 60)] })], req({ query: 'shoes', preferredRetailers: ['rei'] }))[0]).toBe('best');
  });

  it('respects the limit', () => {
    const c = Array.from({ length: 10 }, (_, i) => deal(`d${i}`, 'Running shoes'));
    expect(rankCandidates(c, req({ query: 'shoes', limit: 3 }), NOW)).toHaveLength(3);
  });
});
