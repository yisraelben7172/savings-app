import { Controller, Get, Param, Query } from '@nestjs/common';
import { DealsService, Sort, Tier } from './deals.service';

@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  // TODO: tier comes from the signed-in user once accounts are added; ?tier=gold is for testing only.
  @Get()
  list(
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sort') sort?: Sort,
    @Query('limit') limit?: string,
    @Query('tier') tier?: Tier,
  ) {
    return this.deals.list({
      category, q, sort,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      limit: limit ? Number(limit) : undefined,
      tier: tier === 'gold' ? 'gold' : 'free',
    });
  }

  @Get(':slug')
  detail(@Param('slug') slug: string, @Query('tier') tier?: Tier) {
    return this.deals.detail(slug, tier === 'gold' ? 'gold' : 'free');
  }
}
