import { applyCurrentPrices, buildPlan, selectOption, summarize, type ItemSearch } from '../src/plans/planner';
import { parsePlanInput, type PlanInput } from '../src/plans/plan-input';
import { rankCandidates, type Candidate, type CandidateOffer } from '../src/search/ranking';

const NOW = new Date('2026-11-01T12:00:00Z');
const offer = (store: string, price: number, listPrice: number | null = null): CandidateOffer => ({
  store, storeSlug: store.toLowerCase(), price, listPrice, deliveryNote: null, lastCheckedAt: new Date(NOW.getTime() - 3600_000), staleAfter: new Date(NOW.getTime() + 86_400_000),
});
const deal = (slug: string, title: string, cat: string, price: number, over: Partial<Candidate> = {}): Candidate => ({
  slug, title, categorySlug: cat, categoryName: cat[0].toUpperCase() + cat.slice(1), brand: null, description: null, attributesText: '', priceUnit: null, offers: [offer('Target', price)], ...over,
});

const DEALS = [
  deal('sony-headphones', 'Sony wireless bluetooth noise cancelling headphones', 'electronics', 330, { offers: [offer('Best Buy', 330, 400)] }),
  deal('jbl-headphones', 'JBL wireless headphones', 'electronics', 40),
  deal('mid-headphones', 'Mid wireless headphones', 'electronics', 120),
  deal('lenovo-laptop', 'Lenovo laptop', 'electronics', 550),
  deal('hp-laptop', 'HP laptop', 'electronics', 430),
  deal('desk-lamp', 'LED desk lamp', 'home', 25),
  deal('lisbon-hotel', 'Hotel in Lisbon', 'hotels', 300, { priceUnit: 'per night' }),
];

function plan(raw: object, deals = DEALS) {
  const parsed = parsePlanInput(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join(' '));
  const input: PlanInput = parsed.value;
  const searches: ItemSearch[] = input.items.map((item) => ({ item, ranked: rankCandidates(deals, item.request, NOW) }));
  return { input, result: buildPlan(searches, input, NOW) };
}
const pick = (r: ReturnType<typeof plan>['result'], i: number) => (r.items[i].chosen == null ? null : r.items[i].options[r.items[i].chosen!].slug);

describe('buildPlan', () => {
  it('keeps each item\'s best fit when there is no budget, and totals exactly', () => {
    const { result } = plan({ items: [{ query: 'wireless headphones', category: 'electronics' }, { query: 'desk lamp' }] });
    expect(result.items.map((i) => i.status)).toEqual(['matched', 'matched']);
    expect(result.swaps).toEqual([]);
    expect(result.totals.total).toBe(result.items.reduce((s, i) => s + i.options[i.chosen!].price * i.quantity, 0));
    expect(result.totals.totalBudget).toBeNull();
    expect(result.totals.withinBudget).toBe(true);
  });

  it('multiplies by quantity and keeps cents exact', () => {
    const { result } = plan({ items: [{ query: 'desk lamp', quantity: 3 }] }, [deal('lamp', 'LED desk lamp', 'home', 19.99)]);
    expect(result.totals.total).toBe(59.97);
  });

  it('swaps to cheaper options only while over budget, taking the cheapest loss of fit first', () => {
    // Asking for features only Sony's listing confirms makes it the best fit, though it is not the cheapest.
    const items = [{ query: 'wireless headphones', requiredFeatures: ['noise cancelling', 'bluetooth'] }, { query: 'laptop' }];
    const first = plan({ items }).result;
    expect(pick(first, 0)).toBe('sony-headphones');
    const base = first.totals.total;
    const { result, input } = plan({ items, totalBudget: base - 1 });
    expect(result.swaps.length).toBeGreaterThan(0);
    expect(result.totals.total).toBeLessThanOrEqual(base - 1);
    expect(result.totals.withinBudget).toBe(true);
    expect(summarize(result.items, input).total).toBe(result.totals.total);
    expect(result.notes.join(' ')).toMatch(/switched/);
    expect(plan({ items, totalBudget: base }).result.swaps).toEqual([]); // exactly on budget: nothing changes
  });

  it('never uses a product that is not one of the item\'s own ranked options', () => {
    const { result } = plan({ items: [{ query: 'wireless headphones', maxPrice: 150 }], totalBudget: 10 });
    for (const o of result.items[0].options) expect(['jbl-headphones', 'mid-headphones']).toContain(o.slug);
    expect(result.totals.withinBudget).toBe(false); // honest: 10 dollars is not enough
    expect(result.notes.join(' ')).toMatch(/could not get under/);
  });

  it('respects category budgets separately from the total', () => {
    const { result } = plan({ items: [{ query: 'wireless headphones', category: 'electronics' }, { query: 'desk lamp', category: 'home' }], categoryBudgets: { electronics: 60 } });
    expect(result.totals.byCategory.electronics).toBeLessThanOrEqual(60);
    expect(pick(result, 1)).toBe('desk-lamp'); // home was not over, so it is untouched
    expect(result.totals.categoryBudgets.electronics.over).toBe(0);
  });

  it('reports items with no match and leaves them out of the total', () => {
    const { result } = plan({ items: [{ query: 'desk lamp' }, { query: 'submarine' }] });
    expect(result.items[1]).toMatchObject({ status: 'no_match', chosen: null, options: [] });
    expect(result.items[1].note).toMatch(/Nothing currently matches/);
    expect(result.totals.total).toBe(25);
    expect(result.notes.join(' ')).toMatch(/no match/);
  });

  it('shows per-night prices but does not add them to the total or swap them', () => {
    const { result } = plan({ items: [{ query: 'hotel Lisbon' }, { query: 'desk lamp' }], totalBudget: 20 });
    expect(result.totals.uncounted).toEqual([{ index: 0, label: 'hotel Lisbon', price: 300, priceUnit: 'per night' }]);
    expect(result.totals.total).toBe(25);
    expect(pick(result, 0)).toBe('lisbon-hotel');
  });

  it('is deterministic', () => {
    const a = plan({ items: [{ query: 'wireless headphones' }, { query: 'laptop' }], totalBudget: 700 }).result;
    const b = plan({ items: [{ query: 'wireless headphones' }, { query: 'laptop' }], totalBudget: 700 }).result;
    expect(b).toEqual(a);
  });
});

describe('selectOption', () => {
  it('lets the shopper pick another listed option, even over budget, and recomputes', () => {
    const { result, input } = plan({ items: [{ query: 'wireless headphones' }], totalBudget: 100 });
    const next = selectOption(result, 0, 'sony-headphones', input)!;
    expect(pick(next, 0)).toBe('sony-headphones');
    expect(next.totals.total).toBe(330);
    expect(next.totals.withinBudget).toBe(false);
    expect(next.notes.join(' ')).toMatch(/over a budget you set/);
  });

  it('refuses a product that is not one of the item\'s options or an item that does not exist', () => {
    const { result, input } = plan({ items: [{ query: 'wireless headphones' }] });
    expect(selectOption(result, 0, 'hp-laptop', input)).toBeNull();
    expect(selectOption(result, 5, 'sony-headphones', input)).toBeNull();
  });
});

describe('applyCurrentPrices', () => {
  it('reports changed and vanished prices and removes unavailable picks', () => {
    const { result, input } = plan({ items: [{ query: 'wireless headphones', maxPrice: 150 }, { query: 'desk lamp' }] });
    const chosenHeadphones = pick(result, 0)!;
    const current = new Map<string, number>([[chosenHeadphones, 45]]); // lamp is gone
    const { result: next, changes } = applyCurrentPrices(result, current, input);
    expect(changes).toHaveLength(2);
    expect(changes.find((c) => c.slug === 'desk-lamp')).toMatchObject({ now: null });
    expect(changes.find((c) => c.slug === chosenHeadphones)).toMatchObject({ now: 45 });
    expect(next.items[1]).toMatchObject({ chosen: null, status: 'no_match' });
    expect(next.totals.total).toBe(45);
  });

  it('reports nothing when prices are unchanged', () => {
    const { result, input } = plan({ items: [{ query: 'desk lamp' }] });
    const { changes } = applyCurrentPrices(result, new Map([['desk-lamp', 25]]), input);
    expect(changes).toEqual([]);
  });
});

describe('commission blindness', () => {
  it('plan code never reads affiliate, program, click or commission data', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['planner.ts', 'plan-input.ts']) {
      const src = readFileSync(`${__dirname}/../src/plans/${f}`, 'utf8');
      expect(src).not.toMatch(/affiliate|commission|click|program/i);
    }
  });
});
