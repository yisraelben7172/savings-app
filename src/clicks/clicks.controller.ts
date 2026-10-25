import { Controller, Get, Logger, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { buildTrackedUrl } from '../affiliate/link-builder';
import { isLinkOnMerchantDomain, MIN_TRUST_SCORE } from '../deals/trust';
import { PrismaService } from '../prisma/prisma.service';

/** Placement and recommendation labels are short, simple tokens; anything else is dropped. */
const LABEL = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const label = (v: string | undefined) => (v && LABEL.test(v) ? v.slice(0, 40) : undefined);

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
    let destination = offer.url;
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
}
