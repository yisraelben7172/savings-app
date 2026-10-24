import { Controller, Get, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { isLinkOnMerchantDomain, MIN_TRUST_SCORE } from '../deals/trust';

/** "Go to store" button: logs the click, adds our affiliate tracking, sends the user to the store. */
@Controller('go')
@UseGuards(ThrottlerGuard)
export class ClicksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':offerId')
  async go(@Param('offerId') offerId: string, @Query('src') src: string | undefined, @Res() res: Response) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId }, include: { merchant: true } });
    const m = offer?.merchant;
    if (!offer || !m || !m.approved || m.trustScore < MIN_TRUST_SCORE || !isLinkOnMerchantDomain(offer.url, m.domain)) {
      throw new NotFoundException('This store link is not available');
    }
    await this.prisma.click.create({ data: { offerId, source: src?.slice(0, 20) } });
    res.redirect(302, this.affiliateUrl(offer.url, m.network, m.affiliateTag));
  }

  private affiliateUrl(url: string, network: string, tag: string | null): string {
    const u = new URL(url);
    if (network === 'amazon') {
      const t = tag ?? process.env.AMAZON_ASSOCIATE_TAG;
      if (t) u.searchParams.set('tag', t);
    }
    // TODO: wrap Impact / CJ / Rakuten / Expedia / Booking links with each network's deep-link format once approved.
    return u.toString();
  }
}
