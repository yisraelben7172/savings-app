import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { queryWords } from '../search/shopping-request';
import { aiAllowedOffer, cardPrices, trustedOffer } from './trust';
import { dealVisibility, type Tier } from './visibility';

export type { Tier } from './visibility';
export type Sort = 'hot' | 'discount' | 'price' | 'newest';

export interface ListOptions {
  category?: string;
  q?: string;
  maxPrice?: number;
  sort?: Sort;
  limit?: number;
  tier?: Tier;
  /** Only offers whose source allows AI processing (used by the assistant's tool). */
  aiOnly?: boolean;
}

const PRICE_FIELDS = { id: true, price: true, listPrice: true } as const;

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  private visibility(tier: Tier, offerFilter: Prisma.OfferWhereInput): Prisma.DealWhereInput {
    return dealVisibility(tier, offerFilter);
  }

  /** Turns "running shoes under $80" into words + a max price. */
  parseQuery(text: string): { words: string[]; maxPrice?: number } {
    const m = text.match(/(?:under|below|less than|max|<)\s*\$?\s*(\d+(?:\.\d+)?)/i);
    const maxPrice = m ? Number(m[1]) : undefined;
    // Same understanding of a query as the ranked search (stems, spec numbers like "4K" and "16GB" kept).
    return { words: queryWords(text), maxPrice };
  }

  async list(opts: ListOptions = {}) {
    const tier = opts.tier ?? 'free';
    const offerFilter = opts.aiOnly ? aiAllowedOffer() : trustedOffer();
    const and: Prisma.DealWhereInput[] = [this.visibility(tier, offerFilter)];
    if (opts.category) and.push({ category: { slug: opts.category } });
    let maxPrice = opts.maxPrice;
    if (opts.q) {
      const parsed = this.parseQuery(opts.q);
      maxPrice = maxPrice ?? parsed.maxPrice;
      if (parsed.words.length) {
        and.push({
          OR: parsed.words.flatMap((w) => [
            { title: { contains: w, mode: 'insensitive' as const } },
            { category: { name: { contains: w, mode: 'insensitive' as const } } },
            { product: { brand: { contains: w, mode: 'insensitive' as const } } },
          ]),
        });
      }
    }
    // Rough filter on the stored price; the exact check below uses only the offers shown right now.
    if (maxPrice != null) and.push({ bestPrice: { lte: maxPrice } });

    const orderBy: Prisma.DealOrderByWithRelationInput[] =
      opts.sort === 'price' ? [{ bestPrice: 'asc' }]
      : opts.sort === 'newest' ? [{ createdAt: 'desc' }]
      : opts.sort === 'discount' ? [{ discountPct: 'desc' }]
      : [{ isHot: 'desc' }, { discountPct: 'desc' }];

    const limit = Math.min(opts.limit ?? 24, 60);
    const deals = await this.prisma.deal.findMany({
      where: { AND: and },
      orderBy,
      take: limit,
      include: { category: true, offers: { where: offerFilter, select: PRICE_FIELDS } },
    });
    return deals
      .map((d) => this.toCard(d))
      .filter((c): c is NonNullable<typeof c> => !!c && (maxPrice == null || c.bestPrice <= maxPrice));
  }

  async detail(slug: string, tier: Tier = 'free') {
    const offerFilter = trustedOffer();
    const deal = await this.prisma.deal.findFirst({
      where: { AND: [{ slug }, this.visibility(tier, offerFilter)] },
      include: {
        category: true,
        offers: {
          where: offerFilter,
          include: {
            merchant: { include: { programs: { where: { status: 'APPROVED', disclosureText: { not: null } }, select: { disclosureText: true }, take: 1 } } },
            source: { select: { attributionText: true } },
          },
          orderBy: { price: 'asc' },
        },
        priceHistory: { orderBy: { recordedAt: 'asc' } },
      },
    });
    const card = deal && this.toCard(deal);
    if (!deal || !card) throw new NotFoundException('Deal not found or no longer available');
    const cheapest = Math.min(...deal.offers.map((o) => Number(o.price)));
    return {
      ...card,
      description: deal.description,
      offers: deal.offers.map((o) => ({
        id: o.id,
        store: o.merchant.name,
        storeSlug: o.merchant.slug,
        storeColor: o.merchant.color,
        rating: o.merchant.rating,
        verified: true,
        price: Number(o.price),
        deliveryNote: o.deliveryNote,
        speedRank: o.speedRank,
        bestPrice: Number(o.price) === cheapest,
        lastCheckedAt: o.lastCheckedAt,
        attribution: o.source?.attributionText ?? null,
        // Wording an approved affiliate program requires next to its links (e.g. Amazon's Associate statement).
        disclosure: o.merchant.programs[0]?.disclosureText ?? null,
        goUrl: `/api/go/${o.id}`,
      })),
      priceHistory: deal.priceHistory.map((p) => ({ price: Number(p.price), date: p.recordedAt })),
    };
  }

  /** The shopper-facing card for a deal and the offers currently shown for it (null if none are). */
  toCard(d: {
    id: string; slug: string; title: string; imageUrl: string | null; productId: string | null;
    originalPrice: Prisma.Decimal; priceUnit: string | null;
    isHot: boolean; goldOnly: boolean; goldEarlyUntil: Date | null; expiresAt: Date | null;
    category: { slug: string; name: string; color: string };
    offers: { id: string; price: Prisma.Decimal; listPrice: Prisma.Decimal | null }[];
  }) {
    const prices = cardPrices(d.offers, { originalPrice: Number(d.originalPrice), isLegacyDemo: !d.productId });
    if (!prices) return null;
    return {
      id: d.id,
      slug: d.slug,
      title: d.title,
      imageUrl: d.imageUrl,
      category: { slug: d.category.slug, name: d.category.name, color: d.category.color },
      ...prices,
      priceUnit: d.priceUnit,
      isHot: d.isHot,
      goldOnly: d.goldOnly,
      goldEarlyAccess: !!d.goldEarlyUntil && d.goldEarlyUntil > new Date(),
      storeCount: d.offers.length,
      expiresAt: d.expiresAt,
    };
  }
}
