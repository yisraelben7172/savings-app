import { Controller, Get, Logger, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { buildTrackedUrl } from '../affiliate/link-builder';
import { isLinkOnMerchantDomain, MIN_TRUST_SCORE } from '../deals/trust';
import { PrismaService } from '../prisma/prisma.service';
import { prefilledBookingUrl } from '../trips/trip-links';

/** Placement and recommendation labels are short, simple tokens; anything else is dropped. */
const LABEL = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const label = (v: string | undefined) => (v && LABEL.test(v) ? v.slice(0, 40) : undefined);
const TRIP_ID = /^[a-f0-9]{32}$/;
const ITEM_ID = /^[a-z0-9]{8,40}$/i;

/**
 * "Go to store" button: logs the click, sends the shopper to the store, and adds affiliate tracking only through an
 * approved program's verified link method. The destination always comes from our own stored offer, never from the request.
 */
@Controller('go')
@UseGuards(ThrottlerGuard)
export class ClicksController {
  private readonly log = new Logger(ClicksController.name);
  constructor(private readonly prisma: PrismaService) {}

  @Get(':offerId')
  async go(
    @Param('offerId') offerId: string,
    @Query('src') src: string | undefined,
    @Query('rec') rec: string | undefined,
    @Res() res: Response,
    @Query('trip') trip?: string,
    @Query('item') item?: string,
  ) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { merchant: { include: { programs: { where: { status: 'APPROVED', linkMethod: { not: 'NONE' } }, orderBy: { approvedAt: 'asc' } } } } },
    });
    const m = offer?.merchant;
    // A stale price may still link through (the store shows its live price), but never to an inactive or untrusted store.
    if (!offer || !m || !m.approved || !m.active || m.trustScore < MIN_TRUST_SCORE || !isLinkOnMerchantDomain(offer.url, m.domain)) {
      throw new NotFoundException('This store link is not available');
    }

    // The click ID doubles as the sub-ID the network reports back with each sale.
    const clickId = randomBytes(12).toString('hex');
    const program = m.programs[0] ?? null;
    let destination = (trip && item && (await this.tripDestination(trip, item, offer.id, m.id, m.domain))) || offer.url;
    let outcome: 'TRACKED' | 'PLAIN' | 'FALLBACK' = 'PLAIN';
    if (program) {
      const built = buildTrackedUrl(program, offer.url, clickId);
      if (built.ok) {
        destination = built.url;
        outcome = 'TRACKED';
      } else {
        outcome = 'FALLBACK';
        this.log.warn(`Tracked link failed for program ${program.id} (${m.name}): ${built.reason}`);
      }
    }

    try {
      await this.prisma.click.create({
        data: {
          id: clickId, offerId, source: label(src), recommendationId: label(rec),
          programId: program?.id, outcome, destinationHost: new URL(destination).hostname,
        },
      });
    } catch (e) {
      // Never strand a shopper because logging failed.
      this.log.error(`Could not record click ${clickId}: ${(e as Error).message}`);
    }
    res.redirect(302, destination);
  }

  /**
   * An approved trip plan's booking button: the item's page with dates and guests filled in, but only through a
   * documented format saved on the store's program, and only for the offer the shopper approved. Dates and guests
   * come from the stored plan, never from the request. Anything else returns null (the plain item page is used).
   */
  private async tripDestination(trip: string, item: string, offerId: string, merchantId: string, domain: string): Promise<string | null> {
    if (!TRIP_ID.test(trip) || !ITEM_ID.test(item)) return null;
    try {
      const row = await this.prisma.tripItem.findFirst({ where: { id: item, planId: trip, selected: true, chosenOfferId: offerId }, include: { plan: true } });
      if (!row || row.plan.status !== 'APPROVED' || row.plan.expiresAt <= new Date()) return null;
      const programs = await this.prisma.affiliateProgram.findMany({
        where: { merchantId, status: { not: 'REJECTED' }, bookingLinkTemplate: { not: null }, bookingLinkDocUrl: { not: null } },
        orderBy: { createdAt: 'asc' },
      });
      const day = (d: Date) => d.toISOString().slice(0, 10);
      const ctx = { checkIn: day(row.plan.startDate), checkOut: day(row.plan.endDate), adults: row.plan.adults, children: row.plan.children, origin: row.plan.originAirport, destination: row.plan.destination };
      for (const p of programs) {
        const filled = prefilledBookingUrl(p, ctx, domain);
        if (filled) return filled;
      }
      return null;
    } catch (e) {
      this.log.warn(`Trip link lookup failed: ${(e as Error).message}`);
      return null;
    }
  }
}
