/**
 * The structured form of a shopping request. Hard constraints (category, budget, brands, excluded terms) become
 * deterministic filters; everything else only affects ranking. The AI proposes one of these; Vault validates it
 * before running it, because model output is untrusted input.
 */
export const CATEGORY_SLUGS = ['electronics', 'clothing', 'beauty', 'hotels', 'car-rentals', 'concerts', 'home', 'flights'] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export const SORTS = ['best_match', 'lowest_price', 'biggest_discount'] as const;
export type SearchSort = (typeof SORTS)[number];

export type ShoppingRequest = {
  query: string; // what the shopper wants, in a few words ("running shoes")
  category?: CategorySlug;
  minPrice?: number; // USD
  maxPrice?: number; // USD, a hard limit
  requiredFeatures: string[]; // ranked higher when the listing verifies them; never silently assumed
  excludedTerms: string[]; // hard exclusion if the listing mentions them
  brands: string[]; // hard limit: the listing must show the brand
  preferredRetailers: string[]; // soft: small ranking boost
  useCase?: string; // context for the explanation only
  sort: SearchSort;
  limit: number; // 1..8
};

export type ParseResult = { ok: true; value: ShoppingRequest } | { ok: false; errors: string[] };

const MAX_TEXT = 120;
const MAX_ITEMS = 10;
const MAX_PRICE = 1_000_000;

const clean = (v: unknown, max = MAX_TEXT): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

function list(v: unknown, field: string, errors: string[]): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    errors.push(`${field} must be a list of short phrases.`);
    return [];
  }
  const out = [...new Set(v.map((x) => clean(x, 60).toLowerCase()).filter(Boolean))];
  return out.slice(0, MAX_ITEMS);
}

function money(v: unknown, field: string, errors: string[]): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PRICE) {
    errors.push(`${field} must be a positive number of US dollars (got ${JSON.stringify(v)}).`);
    return undefined;
  }
  return Math.round(n * 100) / 100;
}

/** Accepts the AI tool's snake_case input (or camelCase) and returns a clean, bounded request or the reasons it was refused. */
export function parseShoppingRequest(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['The request must be an object.'] };
  const r = raw as Record<string, unknown>;
  const pick = (snake: string, camel: string) => r[snake] ?? r[camel];

  const query = clean(r.query);
  let category: CategorySlug | undefined;
  if (r.category !== undefined && r.category !== null && r.category !== '') {
    if ((CATEGORY_SLUGS as readonly string[]).includes(String(r.category))) category = r.category as CategorySlug;
    else errors.push(`category must be one of: ${CATEGORY_SLUGS.join(', ')}.`);
  }

  const minPrice = money(pick('min_price', 'minPrice'), 'min_price', errors);
  const maxPrice = money(pick('max_price', 'maxPrice'), 'max_price', errors);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) errors.push('min_price is higher than max_price.');

  let sort: SearchSort = 'best_match';
  if (r.sort !== undefined && r.sort !== null && r.sort !== '') {
    if ((SORTS as readonly string[]).includes(String(r.sort))) sort = r.sort as SearchSort;
    else errors.push(`sort must be one of: ${SORTS.join(', ')}.`);
  }

  let limit = 5;
  if (r.limit !== undefined && r.limit !== null) {
    const n = typeof r.limit === 'number' ? Math.floor(r.limit) : Number.NaN;
    if (!Number.isFinite(n) || n < 1) errors.push('limit must be a whole number from 1 to 8.');
    else limit = Math.min(8, n);
  }

  const value: ShoppingRequest = {
    query,
    category,
    minPrice,
    maxPrice,
    requiredFeatures: list(pick('required_features', 'requiredFeatures'), 'required_features', errors),
    excludedTerms: list(pick('excluded_terms', 'excludedTerms'), 'excluded_terms', errors),
    brands: list(r.brands, 'brands', errors),
    preferredRetailers: list(pick('preferred_stores', 'preferredRetailers'), 'preferred_stores', errors),
    useCase: clean(pick('use_case', 'useCase'), 160) || undefined,
    sort,
    limit,
  };

  if (!query && !category && !value.brands.length) errors.push('Provide a query, a category or a brand.');
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

const STOP = new Set([
  'under', 'over', 'above', 'below', 'for', 'the', 'and', 'with', 'without', 'a', 'an', 'deal', 'deals', 'best', 'cheap', 'cheapest', 'find', 'me', 'my', 'this', 'that', 'than',
  'less', 'more', 'around', 'some', 'good', 'great', 'want', 'need', 'looking', 'please', 'any', 'new', 'latest', 'top', 'buy', 'get', 'weekend', 'today', 'tonight', 'tomorrow', 'from', 'near', 'one',
]);
const SHORT_WORDS = new Set(['tv', 'pc', 'vr']); // two-letter words that mean something
const SYNONYMS: Record<string, string[]> = {
  ticket: ['seat', 'show', 'event'],
  tv: ['televis'],
  televis: ['tv'],
  laptop: ['notebook'],
  sofa: ['couch'],
  couch: ['sofa'],
  sneaker: ['shoe'],
  earphone: ['earbud', 'headphon'],
};

/** Cuts a common ending so "moisturizer" finds "moisturizing" and "shoes" finds "shoe". Always leaves 4+ letters. */
export function stem(w: string): string {
  for (const suf of ['ing', 'ers', 'er', 'ed', 'es', 's']) if (w.length - suf.length >= 4 && w.endsWith(suf)) return w.slice(0, -suf.length);
  return w;
}

export type QueryTerm = { word: string; alts: string[] };

/**
 * The meaningful parts of a query as stems, each with any synonyms. Budget phrases ("under $80") are removed, but
 * numbers that belong to a spec ("4K", "16GB", "iPhone 15") are kept as part of their word.
 */
export function queryTerms(text: string): QueryTerm[] {
  const noBudget = text
    .toLowerCase()
    .replace(/(?:under|below|less than|max|over|above|at least|more than|<|>)\s*\$?\s*\d+(?:[.,]\d+)?/g, ' ')
    .replace(/\$\s*\d+(?:[.,]\d+)?/g, ' ')
    .replace(/'s\b/g, '');
  const seen = new Set<string>();
  const out: QueryTerm[] = [];
  for (const raw of noBudget.split(/[^a-z0-9]+/)) {
    if (!raw || STOP.has(raw) || /^\d+$/.test(raw)) continue;
    const mixed = /[a-z]/.test(raw) && /\d/.test(raw);
    if (raw.length < 3 && !mixed && !SHORT_WORDS.has(raw)) continue;
    const word = mixed ? raw : stem(raw);
    if (seen.has(word)) continue;
    seen.add(word);
    out.push({ word, alts: SYNONYMS[word] ?? [] });
  }
  return out;
}

/** The stems only (kept for callers that don't need synonyms). */
export const queryWords = (text: string): string[] => queryTerms(text).map((t) => t.word);

/**
 * How many of a query's terms a listing must contain to count as relevant. One word: that word. Two: both ("air fryer"
 * must not match an office chair). Longer queries may miss about a third. This favors showing nothing over showing the wrong thing.
 */
export const requiredMatches = (terms: number): number => (terms <= 2 ? terms : Math.ceil((terms * 2) / 3));

/** Plain-language fallback (no AI): pulls a budget out of the text and keeps the rest as the query. */
export function requestFromText(text: string, limit = 3): ShoppingRequest {
  const m = text.match(/(?:under|below|less than|max|<)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  const maxPrice = m ? Number(m[1]) : undefined;
  return {
    query: clean(text, 200),
    maxPrice: maxPrice && maxPrice > 0 && maxPrice <= MAX_PRICE ? maxPrice : undefined,
    requiredFeatures: [],
    excludedTerms: [],
    brands: [],
    preferredRetailers: [],
    sort: 'best_match',
    limit,
  };
}
