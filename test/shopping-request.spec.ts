import { parseShoppingRequest, queryTerms, queryWords, requestFromText, requiredMatches, stem } from '../src/search/shopping-request';

const ok = (raw: unknown) => {
  const r = parseShoppingRequest(raw);
  if (!r.ok) throw new Error(r.errors.join(' '));
  return r.value;
};
const errors = (raw: unknown) => {
  const r = parseShoppingRequest(raw);
  return r.ok ? [] : r.errors;
};

describe('typed shopping request', () => {
  it('accepts the AI tool input (snake_case) and fills defaults', () => {
    const v = ok({
      query: ' Running   shoes ', category: 'clothing', max_price: 80, min_price: 30, brands: ['Nike', 'nike', 'Brooks'],
      excluded_terms: ['Leather'], required_features: ['Waterproof'], preferred_stores: ['Zappos'], use_case: 'marathon training', sort: 'lowest_price', limit: 3,
    });
    expect(v).toEqual({
      query: 'Running shoes', category: 'clothing', maxPrice: 80, minPrice: 30, brands: ['nike', 'brooks'], excludedTerms: ['leather'],
      requiredFeatures: ['waterproof'], preferredRetailers: ['zappos'], useCase: 'marathon training', sort: 'lowest_price', limit: 3,
    });
    expect(ok({ query: 'lamp' })).toMatchObject({ sort: 'best_match', limit: 5, brands: [], requiredFeatures: [], excludedTerms: [] });
  });

  it('also accepts camelCase from our own API', () => {
    expect(ok({ query: 'lamp', maxPrice: 40, requiredFeatures: ['dimmable'] })).toMatchObject({ maxPrice: 40, requiredFeatures: ['dimmable'] });
  });

  it('refuses invalid values instead of guessing', () => {
    expect(errors({ query: 'x', category: 'toys' })[0]).toMatch(/category must be one of/);
    expect(errors({ query: 'x', max_price: '80' })[0]).toMatch(/positive number/);
    expect(errors({ query: 'x', max_price: -5 })[0]).toMatch(/positive number/);
    expect(errors({ query: 'x', max_price: 1e9 })[0]).toMatch(/positive number/);
    expect(errors({ query: 'x', min_price: 90, max_price: 50 })).toContain('min_price is higher than max_price.');
    expect(errors({ query: 'x', sort: 'cheapest' })[0]).toMatch(/sort must be one of/);
    expect(errors({ query: 'x', limit: 0 })[0]).toMatch(/limit/);
    expect(errors({ query: 'x', brands: 'nike' })[0]).toMatch(/brands must be a list/);
    expect(errors({})[0]).toMatch(/Provide a query/);
    expect(errors(null)).toEqual(['The request must be an object.']);
    expect(errors([])).toEqual(['The request must be an object.']);
    expect(errors('lamp')).toEqual(['The request must be an object.']);
  });

  it('bounds sizes and strips control characters', () => {
    const v = ok({ query: 'lamp\u0000\nwith\tdimmer ' + 'x'.repeat(500), brands: Array.from({ length: 50 }, (_, i) => `brand${i}`), limit: 99 });
    expect(v.query.length).toBeLessThanOrEqual(120);
    expect(v.query).not.toMatch(/[\u0000-\u001f]/);
    expect(v.brands).toHaveLength(10);
    expect(v.limit).toBe(8);
  });

  it('accepts a brand-only or category-only request', () => {
    expect(ok({ query: '', brands: ['sony'] })).toMatchObject({ brands: ['sony'] });
    expect(ok({ category: 'beauty' })).toMatchObject({ category: 'beauty', query: '' });
  });
});

describe('plain-language fallback', () => {
  it('pulls a budget out of the text', () => {
    expect(requestFromText('running shoes under $80')).toMatchObject({ query: 'running shoes under $80', maxPrice: 80, limit: 3, sort: 'best_match' });
    expect(requestFromText('headphones').maxPrice).toBeUndefined();
    expect(requestFromText('lamp less than 45.50').maxPrice).toBe(45.5);
  });

  it('keeps only meaningful query words, as stems', () => {
    expect(queryWords('Find me the best running shoes under $80, please')).toEqual(['runn', 'shoe']);
    expect(queryWords('a to z')).toEqual([]);
    expect(queryWords("men's moisturizing cream")).toEqual(['men', 'moisturiz', 'cream']);
  });

  it('keeps the numbers that belong to a spec and drops budgets', () => {
    expect(queryWords('4K monitor')).toEqual(['4k', 'monitor']);
    expect(queryWords('laptop 16GB under $600')).toEqual(['laptop', '16gb']);
    expect(queryWords('iPhone 15 case less than 25')).toEqual(['iphone', 'case']);
    expect(queryWords('55 inch TV over $300')).toEqual(['inch', 'tv']);
    expect(queryWords('gifts under 50')).toEqual(['gift']);
  });

  it('stems conservatively and expands a few synonyms', () => {
    expect(stem('moisturizer')).toBe('moisturiz');
    expect(stem('shoes')).toBe('shoe');
    expect(stem('headphones')).toBe('headphon');
    expect(stem('fryer')).toBe('fryer'); // would leave fewer than 4 letters
    expect(stem('air')).toBe('air');
    expect(queryTerms('concert tickets')[1]).toEqual({ word: 'ticket', alts: ['seat', 'show', 'event'] });
  });

  it('requires enough of the query to match: both words of a short query', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(requiredMatches)).toEqual([0, 1, 2, 2, 3, 4, 4]);
  });
});
