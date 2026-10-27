import { parsePlanInput, splitPlanText } from '../src/plans/plan-input';

const ok = (raw: unknown) => {
  const r = parsePlanInput(raw);
  if (!r.ok) throw new Error(r.errors.join(' | '));
  return r.value;
};
const errors = (raw: unknown) => {
  const r = parsePlanInput(raw);
  return r.ok ? [] : r.errors;
};

describe('plan input', () => {
  it('accepts structured items with budgets and keeps room for alternatives', () => {
    const p = ok({
      items: [{ query: 'wireless headphones', category: 'electronics', maxPrice: 100, quantity: 2, label: 'Headphones' }, { query: 'desk lamp' }],
      totalBudget: 250,
      categoryBudgets: { electronics: 150 },
    });
    expect(p.items).toHaveLength(2);
    expect(p.items[0]).toMatchObject({ label: 'Headphones', quantity: 2 });
    expect(p.items[0].request).toMatchObject({ maxPrice: 100, category: 'electronics', limit: 5 });
    expect(p.items[1]).toMatchObject({ label: 'desk lamp', quantity: 1 });
    expect(p.totalBudget).toBe(250);
    expect(p.categoryBudgets).toEqual({ electronics: 150 });
  });

  it('turns plain text into one item per line, keeping $1,200 whole and never splitting on "and"', () => {
    expect(splitPlanText('laptop under $1,200, desk lamp under $40\nsalt and pepper grinder; office chair')).toEqual([
      'laptop under $1,200',
      'desk lamp under $40',
      'salt and pepper grinder',
      'office chair',
    ]);
    const p = ok({ text: 'headphones under $80\ndesk lamp under $30' });
    expect(p.items.map((i) => i.request.maxPrice)).toEqual([80, 30]);
  });

  it('refuses bad shapes with plain reasons', () => {
    expect(errors(null)[0]).toMatch(/object/);
    expect(errors({})[0]).toMatch(/list of items/);
    expect(errors({ items: [] })[0]).toMatch(/at least one/i);
    expect(errors({ items: Array.from({ length: 9 }, () => ({ query: 'x item' })) })[0]).toMatch(/at most 8/);
    expect(errors({ items: ['nope'] })[0]).toMatch(/Item 1 must be an object/);
    expect(errors({ items: [{}] }).join(' ')).toMatch(/Item 1: Provide a query/);
  });

  it('bounds quantity and budgets and rejects unknown categories', () => {
    expect(errors({ items: [{ query: 'lamp', quantity: 0 }] }).join(' ')).toMatch(/quantity/);
    expect(errors({ items: [{ query: 'lamp', quantity: 11 }] }).join(' ')).toMatch(/quantity/);
    expect(errors({ items: [{ query: 'lamp', quantity: 1.5 }] }).join(' ')).toMatch(/quantity/);
    expect(errors({ items: [{ query: 'lamp' }], totalBudget: -5 }).join(' ')).toMatch(/totalBudget/);
    expect(errors({ items: [{ query: 'lamp' }], totalBudget: '100' }).join(' ')).toMatch(/totalBudget/);
    expect(errors({ items: [{ query: 'lamp' }], categoryBudgets: { gadgets: 50 } }).join(' ')).toMatch(/Unknown category/);
    expect(errors({ items: [{ query: 'lamp' }], categoryBudgets: [] }).join(' ')).toMatch(/categoryBudgets/);
  });

  it('cleans labels', () => {
    const p = ok({ items: [{ query: 'lamp', label: '  <b>Reading\nlamp</b>  ' }] });
    expect(p.items[0].label).toBe('b Reading lamp /b');
  });
});
