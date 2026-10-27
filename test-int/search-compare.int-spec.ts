import { BadRequestException } from '@nestjs/common';
import { DealsService } from '../src/deals/deals.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchController } from '../src/search/search.controller';
import { SearchService } from '../src/search/search.service';
import { parseShoppingRequest } from '../src/search/shopping-request';
import { seedCatalog } from './eval/catalog';

const prisma = new PrismaService();
const search = new SearchService(prisma, new DealsService(prisma));
const controller = new SearchController(search);
const NOW = new Date();

describe('comparison and search endpoints (real database)', () => {
  beforeAll(() => seedCatalog(prisma, NOW));
  afterAll(() => prisma.$disconnect());

  it('compares deals side by side from the stored data', async () => {
    const c = await search.compare(['sony-wh1000xm5', 'bose-qc-ultra'], { now: NOW });
    expect(c.unavailable).toEqual([]);
    expect(c.items.map((i) => i.slug)).toEqual(['sony-wh1000xm5', 'bose-qc-ultra']); // in the order asked
    expect(c.items[0]).toMatchObject({ bestPrice: 329, cheapestStore: 'Best Buy', storeCount: 3, statedListPrice: 399, statedDiscountPercent: 18 });
    expect(c.highlights.lowestPrice).toEqual(['sony-wh1000xm5']);
    expect(c.highlights.mostStores).toEqual(['sony-wh1000xm5']);
    expect(c.items[0].priceHistory).toMatchObject({ atLowest: true });
    expect(c.warnings.join(' ')).not.toMatch(/different kinds/);
  });

  it('warns when products are not comparable', async () => {
    const c = await search.compare(['suv-rental', 'miami-hotel'], { now: NOW });
    expect(c.warnings.join(' ')).toMatch(/different kinds of products/);
    expect(c.highlights.lowestPrice).toEqual([]); // per day vs total: no "lowest"
  });

  it('reports deals that are not available instead of guessing, and needs two to compare', async () => {
    const c = await search.compare(['sony-wh1000xm5', 'bose-qc-ultra', 'no-such-deal', 'stale-blender'], { now: NOW });
    expect(c.unavailable.sort()).toEqual(['no-such-deal', 'stale-blender']);
    await expect(search.compare(['sony-wh1000xm5', 'stale-blender'], { now: NOW })).rejects.toThrow(/At least two/);
    await expect(search.compare(['sony-wh1000xm5'], { now: NOW })).rejects.toBeInstanceOf(BadRequestException);
    await expect(search.compare(['a', 'b', 'c', 'd', 'e', 'f'], { now: NOW })).rejects.toThrow(/between 2 and 5/);
  });

  it('applies the same visibility rules as browsing: Gold-only deals need Gold', async () => {
    await expect(search.compare(['sony-wh1000xm5', 'gold-headphones'], { now: NOW })).rejects.toThrow(/At least two/);
    const gold = await search.compare(['sony-wh1000xm5', 'gold-headphones'], { now: NOW, tier: 'gold' });
    expect(gold.items).toHaveLength(2);
  });

  it('keeps AI-restricted data out of AI comparisons only', async () => {
    await expect(search.compare(['lodge-dutch-oven', 'noai-espresso'], { now: NOW, aiOnly: true })).rejects.toThrow(/At least two/);
    expect((await search.compare(['lodge-dutch-oven', 'noai-espresso'], { now: NOW })).items).toHaveLength(2);
  });

  it('search cards and ranked facts agree on the price shoppers see', async () => {
    const parsed = parseShoppingRequest({ query: 'running shoes', limit: 8 });
    if (!parsed.ok) throw new Error('bad request');
    const results = await search.search(parsed.value, { now: NOW });
    expect(results.length).toBeGreaterThan(3);
    for (const r of results) {
      expect(r.card.bestPrice).toBe(r.ranked.bestPrice);
      expect(r.card.storeCount).toBe(r.ranked.candidate.offers.length);
    }
  });

  it('the public search endpoint validates input and returns reasons with every result', async () => {
    await expect(controller.find('shoes', 'toys')).rejects.toThrow(/category must be one of/);
    await expect(controller.find('shoes', undefined, undefined, 'abc')).rejects.toThrow(/positive number/);
    await expect(controller.find()).rejects.toThrow(/Provide a query/);
    const out = await controller.find('running shoes', 'clothing', undefined, '110', undefined, 'nike', undefined, undefined, 'lowest_price', '5');
    expect(out.request).toMatchObject({ query: 'running shoes', category: 'clothing', maxPrice: 110, excludedTerms: ['nike'], sort: 'lowest_price', limit: 5 });
    expect(out.results.map((r) => r.slug)).toEqual(['adidas-duramo']);
    expect(out.results[0]).toMatchObject({ bestPrice: 55, statedDiscountPercent: 21 });
    expect(out.results[0].whyItFits.length).toBeGreaterThan(0);
    expect(JSON.stringify(out)).not.toMatch(/commission|affiliate|program/i);
  });

  it('the compare endpoint needs 2 to 5 slugs', async () => {
    await expect(controller.compare('only-one')).rejects.toThrow(/between 2 and 5/);
    await expect(controller.compare(undefined)).rejects.toThrow(/between 2 and 5/);
    expect((await controller.compare('sony-wh1000xm5,bose-qc-ultra')).items).toHaveLength(2);
  });
});
