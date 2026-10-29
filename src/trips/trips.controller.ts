import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { TRIP_LIMITS } from '../rate-limits';
import { TripsService } from './trips.service';

/** Trip plans (hotel, optional flight and car). Found by random id; no accounts, no personal data. Vault never books or pays. */
@Controller('trips')
@UseGuards(ThrottlerGuard)
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  /** Body: { destination, startDate, endDate (YYYY-MM-DD), adults, children?, originAirport?, budgetUsd?, hotelName?, includeHotel?, includeFlight?, includeCar? }. */
  @Post()
  @Throttle(TRIP_LIMITS)
  create(@Body() body: unknown) {
    return this.trips.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.trips.get(id);
  }

  /** Choose a store or an alternative: { offerId, version }. */
  @Post(':id/items/:itemId/select')
  @HttpCode(200)
  select(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: { offerId?: unknown; version?: unknown }) {
    return this.trips.select(id, itemId, body ?? {});
  }

  /** { version }. Re-checks every price first; if anything changed the plan is updated and NOT approved (409). */
  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Body() body: { version?: unknown }) {
    return this.trips.approve(id, body ?? {});
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.trips.cancel(id);
  }

  /** Optional self-report after visiting the partner site: { booked: true | false }. */
  @Post(':id/items/:itemId/report')
  @HttpCode(200)
  report(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: { booked?: unknown }) {
    return this.trips.report(id, itemId, body ?? {});
  }
}
