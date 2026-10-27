/**
 * Labeled shopping questions with known correct answers over the synthetic catalog in catalog.ts.
 * `request` is what the AI would send to the search tool for the shopper's words; the expectations are what a correct,
 * honest search must do. Hard limits (budget, brand, category, exclusions) must hold for EVERY result returned.
 */
export type EvalCase = {
  id: string;
  ask: string; // the shopper's words
  request: Record<string, unknown>; // the structured request for search_deals
  tier?: 'free' | 'gold';
  aiOnly?: boolean;
  include?: string[]; // must appear
  exclude?: string[]; // must not appear
  exact?: string[]; // the result set must be exactly these (any order)
  top?: string; // expected first result
  before?: [string, string][]; // the first must rank above the second
  empty?: boolean; // nothing trusted matches: the right answer is no results
};

export const CASES: EvalCase[] = [
  { id: 'headphones-budget', ask: 'noise-cancelling headphones under $400', request: { query: 'noise-cancelling headphones', max_price: 400 }, include: ['sony-wh1000xm5', 'bose-qc-ultra'], exclude: ['airpods-pro', 'anker-p20i', 'gold-headphones', 'jbl-tune-520'], top: 'sony-wh1000xm5' }, // JBL is headphones but not noise-cancelling
  { id: 'headphones-cheap', ask: 'headphones under $50', request: { query: 'headphones', max_price: 50 }, exact: ['jbl-tune-520'] },
  { id: 'earbuds-cheapest', ask: 'cheapest wireless earbuds', request: { query: 'wireless earbuds', sort: 'lowest_price' }, include: ['airpods-pro', 'anker-p20i'], top: 'anker-p20i', before: [['anker-p20i', 'airpods-pro']] },
  { id: 'laptop-budget', ask: 'a laptop under $600', request: { query: 'laptop', max_price: 600 }, exact: ['lenovo-ideapad', 'hp-pavilion'], exclude: ['macbook-air', 'dell-inspiron', 'shady-laptop'] },
  { id: 'laptop-16gb', ask: 'a laptop with 16GB of RAM', request: { query: 'laptop', required_features: ['16gb'] }, include: ['lenovo-ideapad', 'macbook-air', 'dell-inspiron', 'hp-pavilion'], exclude: ['shady-laptop'], before: [['lenovo-ideapad', 'hp-pavilion'], ['macbook-air', 'hp-pavilion']] },
  { id: 'laptop-boundary', ask: 'a laptop for $429 or less', request: { query: 'laptop', max_price: 429 }, exact: ['hp-pavilion'] },
  { id: 'electronics-premium', ask: 'electronics over $700', request: { category: 'electronics', min_price: 700 }, exact: ['dell-inspiron', 'macbook-air'] },
  { id: 'laptop-16gb-in-query', ask: 'a 16GB laptop', request: { query: '16gb laptop' }, exact: ['lenovo-ideapad', 'macbook-air', 'dell-inspiron'], exclude: ['hp-pavilion'] },
  { id: 'shoes-no-nike', ask: 'running shoes under $110, not Nike', request: { query: 'running shoes', max_price: 110, excluded_terms: ['nike'] }, exact: ['adidas-duramo'], exclude: ['nike-pegasus'] },
  { id: 'shoes-waterproof', ask: 'waterproof running shoes', request: { query: 'running shoes', required_features: ['waterproof'] }, include: ['salomon-speedcross', 'brooks-ghost'], top: 'salomon-speedcross' },
  { id: 'shoes-preferred-store', ask: 'running shoes, I like REI', request: { query: 'running shoes', preferred_stores: ['rei'] }, include: ['hoka-clifton', 'brooks-ghost'] },
  { id: 'brand-brooks', ask: 'anything from Brooks', request: { brands: ['brooks'] }, exact: ['brooks-ghost'] },
  { id: 'brand-apple', ask: 'Apple products', request: { brands: ['apple'] }, exact: ['airpods-pro', 'macbook-air'] },
  { id: 'rain-jacket', ask: 'a rain jacket', request: { query: 'rain jacket' }, include: ['patagonia-rain-jacket'], top: 'patagonia-rain-jacket' },
  { id: 'moisturizer-dry', ask: 'moisturizer for dry skin under $20', request: { query: 'moisturizer dry skin', max_price: 20, category: 'beauty' }, include: ['cerave-cream'], exclude: ['fenty-foundation', 'vitamin-c-serum'] },
  { id: 'serum', ask: 'a brightening serum', request: { query: 'brightening serum' }, include: ['vitamin-c-serum'], top: 'vitamin-c-serum' },
  { id: 'sunscreen-budget', ask: 'sunscreen under $12', request: { query: 'sunscreen', max_price: 12 }, exact: ['neutrogena-spf50'] },
  { id: 'dutch-oven', ask: 'a dutch oven under $50', request: { query: 'dutch oven', max_price: 50 }, exact: ['lodge-dutch-oven'] },
  { id: 'standing-desk', ask: 'a standing desk', request: { query: 'standing desk' }, exact: ['standing-desk'] }, // a desk lamp is not a standing desk
  { id: 'office-chair', ask: 'an ergonomic office chair under $260', request: { query: 'ergonomic office chair', max_price: 260 }, include: ['office-chair'], top: 'office-chair' },
  { id: 'hotel-lisbon', ask: 'a hotel in Lisbon', request: { query: 'hotel lisbon' }, exact: ['lisbon-hotel'] }, // a Miami hotel is not an answer
  { id: 'hotels-budget', ask: 'hotels under $300', request: { category: 'hotels', max_price: 300 }, exact: ['miami-hotel'] },
  { id: 'suv-rental', ask: 'an SUV rental', request: { query: 'suv rental' }, exact: ['suv-rental'] },
  { id: 'cheapest-rental', ask: 'the cheapest car rental', request: { category: 'car-rentals', sort: 'lowest_price' }, top: 'compact-rental' },
  { id: 'concert', ask: 'concert tickets this weekend', request: { query: 'concert tickets' }, include: ['arena-floor-seats'] },
  { id: 'monitor-4k', ask: 'a 4K monitor', request: { query: '4k monitor' }, exact: ['lg-monitor-27'] }, // the 4K TV is not a monitor
  { id: 'tv-4k', ask: 'a 4K TV', request: { query: '4k tv' }, exact: ['samsung-tv-55'] },
  { id: 'word-not-substring', ask: 'an air fryer, with a chair, an airport and AirPods in the catalog', request: { query: 'air fryer' }, empty: true },
  { id: 'biggest-discount', ask: 'headphones with the biggest discount', request: { query: 'headphones', sort: 'biggest_discount' }, top: 'jbl-tune-520' },
  // things that must never reach a shopper
  { id: 'trap-stale', ask: 'a blender', request: { query: 'blender' }, empty: true },
  { id: 'trap-out-of-stock', ask: 'an air fryer', request: { query: 'air fryer' }, empty: true },
  { id: 'trap-disabled-source', ask: 'a bluetooth speaker', request: { query: 'bluetooth speaker' }, empty: true },
  { id: 'trap-gold-free', ask: 'cheap noise-cancelling headphones (free member)', request: { query: 'noise-cancelling headphones', max_price: 100 }, exclude: ['gold-headphones'] },
  { id: 'gold-member', ask: 'cheap noise-cancelling headphones (Gold member)', request: { query: 'noise-cancelling headphones', max_price: 100 }, tier: 'gold', include: ['gold-headphones'] },
  { id: 'restricted-site-search', ask: 'an espresso machine (website search)', request: { query: 'espresso machine' }, include: ['noai-espresso'] },
  { id: 'restricted-for-ai', ask: 'an espresso machine (through the AI assistant)', request: { query: 'espresso machine' }, aiOnly: true, empty: true },
  { id: 'nothing-relevant', ask: 'gifts for dad', request: { query: 'gifts for dad' }, empty: true },
  { id: 'unmatched-product', ask: 'a snowboard', request: { query: 'snowboard', max_price: 300 }, empty: true },
];

/** Slugs that must never be returned to the given audience, whatever is asked. */
export const NEVER = {
  everyone: ['stale-blender', 'oos-air-fryer', 'shady-laptop', 'off-speaker'],
  freeTier: ['gold-headphones'],
  ai: ['noai-espresso'],
};
