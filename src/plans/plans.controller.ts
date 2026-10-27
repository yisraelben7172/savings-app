import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PLAN_LIMITS } from '../rate-limits';
import { PlansService } from './plans.service';

/** Multi-item shopping plans. A plan is found by its random id; there are no accounts yet. */
@Controller('plans')
@UseGuards(ThrottlerGuard)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** Creates a plan and starts it in the background. Poll GET /plans/:id until status is READY (or FAILED). */
  @Post()
  @Throttle(PLAN_LIMITS)
  async create(@Body() body: unknown) {
    const id = await this.plans.create(body);
    this.plans.start(id);
    return this.plans.get(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.plans.get(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.plans.cancel(id);
  }

  /** Switch one item to another of its own options: { index, slug, version }. */
  @Post(':id/select')
  @HttpCode(200)
  select(@Param('id') id: string, @Body() body: { index?: unknown; slug?: unknown; version?: unknown }) {
    return this.plans.select(id, body ?? {});
  }

  /** Approve what the shopper reviewed: { version }. Prices are re-checked first; if any changed, the plan is updated and not approved. */
  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Body() body: { version?: unknown }) {
    return this.plans.approve(id, body ?? {});
  }
}
