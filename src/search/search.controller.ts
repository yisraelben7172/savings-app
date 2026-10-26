import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { dealFacts } from './facts';
import { parseShoppingRequest } from './shopping-request';
import { SearchService } from './search.service';

const csv = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
const num = (v: string | undefined) => (v === undefined || v === '' ? undefined : Number(v));

@Controller()
@UseGuards(ThrottlerGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Ranked search over the deals shoppers can see, with the reasons each one ranks where it does. */
  @Get('search')
  async find(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('brand') brand?: string,
    @Query('exclude') exclude?: string,
    @Query('features') features?: string,
    @Query('stores') stores?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = parseShoppingRequest({
      query: q, category, minPrice: num(minPrice), maxPrice: num(maxPrice), brands: csv(brand), excludedTerms: csv(exclude),
      requiredFeatures: csv(features), preferredRetailers: csv(stores), sort, limit: num(limit),
    });
    if (!parsed.ok) throw new BadRequestException(parsed.errors.join(' '));
    const now = new Date();
    const results = await this.search.search(parsed.value, { now });
    return { request: parsed.value, results: results.map((r) => ({ ...r.card, ...dealFacts(r.ranked, now) })) };
  }

  /** Side-by-side comparison of 2 to 5 deals: /api/compare?slugs=a,b,c */
  @Get('compare')
  compare(@Query('slugs') slugs?: string) {
    return this.search.compare(csv(slugs) ?? []);
  }
}
