import { addComparison, addDeal, amountsIn, checkReply, emptyFacts, percentsIn, plainReply } from '../src/ai/claim-check';
import { buildComparison } from '../src/search/compare';
import type { DealFacts } from '../src/search/facts';

const deal = (over: Partial<DealFacts> = {}): DealFacts => ({
  slug: 'shoes', title: 'Road running shoes', category: 'Clothing', brand: 'Brooks', bestPrice: 58, priceUnit: null, storeStatedListPrice: 112, statedDiscountPercent: 48,
  stores: [{ store: 'Zappos', price: 58, delivery: null, priceCheckedHoursAgo: 2 }, { store: 'Amazon', price: 64, delivery: null, priceCheckedHoursAgo: 2 }],
  whyItFits: [], notConfirmed: [], ...over,
});
const facts = (...ds: DealFacts[]) => {
  const f = emptyFacts();
  ds.forEach((d) => addDeal(f, d));
  return f;
};
const STORES = ['Amazon', 'Zappos', 'Target', 'Walmart', 'Best Buy'];

describe('claim checker', () => {
  it('extracts amounts and percentages', () => {
    expect(amountsIn('It costs $1,299.50 or $58 or $ 7')).toEqual([1299.5, 58, 7]);
    expect(percentsIn('48% off, maybe 12.5 %')).toEqual([48, 12.5]);
    expect(amountsIn('about 20 dollars or 15 bucks')).toEqual([20, 15]);
  });

  it('lets the reply repeat a limit the shopper gave in words, but not invent one', () => {
    const f = facts(deal());
    const reply = 'Nothing is under $20 right now, but shoes are $58 at Zappos.';
    expect(checkReply(reply, f, STORES, 'best shoes under 20 dollars').ok).toBe(true);
    expect(checkReply(reply, f, STORES, 'best shoes under 20').ok).toBe(true);
    expect(checkReply('They cost $20 at Zappos.', f, STORES, 'shoes please').ok).toBe(false);
    expect(checkReply('They cost 25 dollars at Zappos.', f, STORES, 'shoes please').ok).toBe(false); // spelled-out amounts are checked too
  });

  it('accepts a reply that only uses verified prices, savings, gaps and percentages', () => {
    const f = facts(deal());
    const reply = 'The Road running shoes are $58 at Zappos, $6 less than Amazon ($64). The store lists them at $112, so you save $54, about 48% off.';
    expect(checkReply(reply, f, STORES, 'running shoes under $80')).toEqual({ ok: true, problems: [] });
  });

  it('rejects an invented price, percentage or store', () => {
    const f = facts(deal());
    expect(checkReply('They are $49 right now.', f, STORES, '').problems[0]).toMatch(/\$49 isn't in the search results/);
    expect(checkReply('That is 65% off.', f, STORES, '').problems[0]).toMatch(/65%/);
    expect(checkReply('Target has them too.', f, STORES, '').problems[0]).toMatch(/Target isn't one of the stores/);
    expect(checkReply('Walmart also stocks them.', f, STORES, 'I like Walmart').ok).toBe(true); // the shopper named it
  });

  it('rejects pairing a product with a store that does not list it, even if that store appears elsewhere in the results', () => {
    const bose = deal({ slug: 'bose', title: 'Bose QuietComfort Ultra headphones', brand: 'Bose', bestPrice: 379, storeStatedListPrice: null, statedDiscountPercent: null, stores: [{ store: 'Target', price: 379, delivery: null, priceCheckedHoursAgo: 1 }] });
    const f = facts(deal(), bose); // Zappos + Amazon sell the Brooks; Target sells the Bose
    expect(checkReply('The Brooks Ghost shoes are $58 at Target.', f, STORES, '').problems[0]).toMatch(/Target doesn't list Road running shoes/);
    expect(checkReply('The Bose headphones are $379 at Target, and the Brooks are $58 at Zappos.', f, STORES, '').ok).toBe(true);
    expect(checkReply('Target has the Bose headphones for $379.', f, STORES, '').ok).toBe(true);
    expect(checkReply('The Bose headphones are $379 at Zappos.', f, STORES, '').ok).toBe(false);
    // no product named in the sentence: only the set-level check applies
    expect(checkReply('It is $58 at Zappos. Target has the other one.', f, STORES, '').ok).toBe(true);
  });

  it("allows echoing the shopper's own numbers", () => {
    expect(checkReply('Everything here is under your $80 budget.', facts(deal()), STORES, 'running shoes under $80').ok).toBe(true);
  });

  it('allows the figures from a comparison', () => {
    const f = emptyFacts();
    const offer = (store: string, price: number, listPrice: number | null = null) => ({ store, storeSlug: store.toLowerCase(), price, listPrice, deliveryNote: null, lastCheckedAt: new Date(), staleAfter: null });
    const base = { categorySlug: 'electronics', categoryName: 'Electronics', brand: null, attributes: {}, priceUnit: null };
    addComparison(f, buildComparison([
      { ...base, slug: 'a', title: 'A', offers: [offer('Amazon', 200, 250)], history: [{ price: 260, date: new Date('2026-09-01') }, { price: 200, date: new Date('2026-10-30') }] },
      { ...base, slug: 'b', title: 'B', offers: [offer('Target', 230)], history: [] },
    ]));
    expect(checkReply('A is $200 at Amazon, $30 cheaper than B at $230, and $50 below its list price of $250 (20% off).', f, STORES, '').ok).toBe(true);
    expect(checkReply('B is $199.', f, STORES, '').ok).toBe(false);
  });

  it('builds a plain verified reply from the facts', () => {
    expect(plainReply([])).toMatch(/couldn't find a trusted deal/);
    const r = plainReply([deal(), deal({ slug: 'x' })]);
    expect(r).toContain('Road running shoes at $58');
    expect(r).toContain('lowest at Zappos');
    expect(r).toContain('1 more');
    expect(checkReply(r, facts(deal()), STORES, '').ok).toBe(true);
  });
});
