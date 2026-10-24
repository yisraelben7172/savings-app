import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { trustedOffer } from './trust';

export type Tier = 'free' | 'gold';
export type Sort = 'hot' | 'discount' | 'price' | 'newest';

export interface ListOptions {
  category?: string;
  q?: string;
  maxPrice?: number;
  sort?: Sort;
  limit?: number;
  tier?: Tier;
}

const STOP = new Set(['under', 'for', 'the', 'and', 'with', 'a', 'an', 'deal', 'deals', 'best', 'cheap', 'cheapest', 'find', 'me', 'my', 'this', 'that', 'than', 'less', 'below', 'around']);

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : Number(d));

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Free users don't see Gold-only deals or deals still in their Gold early-access window. */
  private visibility(tier: Tier): Prisma.DealWhereInput {
    const base: Prisma.DealWhereInput = {
      status: 'ACTIVE',
      offers: { some: trustedOffer },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
    if (tier === 'gold') return base;
    return {
      AND: [base, { goldOnly: false }, { OR: [{ goldEarlyUntil: null }, { goldEarlyUntil: { lte: new Date() } }] }],
    };
  }

  /** Turns "running shoes under $80" into words + a max price. */
  parseQuery(text: string): { words: string[]; maxPrice?: number } {
    const m = text.match(/(?:under|below|less than|max|<)\s*\$?\s*(\d+(?:\.\d+)?)/i);
    const maxPrice = m ? Number(m[1]) : undefined;
    const words = text
      .toLowerCase()
      .replace(/\$?\d+(\.\d+)?/g, ' ')
      .split(/[^a-z']+/)
      .map((w) => w.replace(/s$/, ''))
      .filter((w) => w.length > 2 && !STOP.has(w));
    return { words, maxPrice };
  }

  async list(opts: ListOptions = {}) {
    const tier = opts.tier ?? 'free';
    const and: Prisma.DealWhereInput[] = [this.visibility(tier)];
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
          ]),
        });
      }
    }
    if (maxPrice != null) and.push({ bestPrice: { lte: maxPrice } });

    const orderBy: Prisma.DealOrderByWithRelationInput[] =
      opts.sort === 'price' ? [{ bestPrice: 'asc' }]
      : opts.sort === 'newest' ? [{ createdAt: 'desc' }]
      : opts.sort === 'discount' ? [{ discountPct: 'desc' }]
      : [{ isHot: 'desc' }, { discountPct: 'desc' }];

    const deals = await this.prisma.deal.findMany({
      where: { AND: and },
      orderBy,
      take: Math.min(opts.limit ?? 24, 60),
      include: { category: true, offers: { where: trustedOffer, select: { id: true } } },
    });
    return deals.map((d) => this.toCard(d));
  }

  async detail(slug: string, tier: Tier = 'free') {
    const deal = await this.prisma.deal.findFirst({
      where: { AND: [{ slug }, this.visibility(tier)] },
      include: {
        category: true,
        offers: { where: trustedOffer, include: { merchant: true }, orderBy: { price: 'asc' } },
        priceHistory: { orderBy: { recordedAt: 'asc' } },
      },
    });
    if (!deal) throw new NotFoundException('Deal not found or no longer available');
    const cheapest = Math.min(...deal.offers.map((o) => Number(o.price)));
    return {
      ...this.toCard(deal),
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
        goUrl: `/api/go/${o.id}`,
      })),
      priceHistory: deal.priceHistory.map((p) => ({ price: Number(p.price), date: p.recordedAt })),
    };
  }

  private toCard(d: {
    id: string; slug: string; title: string; imageUrl: string | null;
    originalPrice: Prisma.Decimal; bestPrice: Prisma.Decimal; priceUnit: string | null;
    discountPct: number; isHot: boolean; goldOnly: boolean; goldEarlyUntil: Date | null; expiresAt: Date | null;
    category: { slug: string; name: string; color: string };
    offers: { id: string }[];
  }) {
    return {
      id: d.id,
      slug: d.slug,
      title: d.title,
      imageUrl: d.imageUrl,
      category: { slug: d.category.slug, name: d.category.name, color: d.category.color },
      originalPrice: num(d.originalPrice),
      bestPrice: num(d.bestPrice),
      priceUnit: d.priceUnit,
      discountPct: d.discountPct,
      saved: Math.round((Number(d.originalPrice) - Number(d.bestPrice)) * 100) / 100,
      isHot: d.isHot,
      goldOnly: d.goldOnly,
      goldEarlyAccess: !!d.goldEarlyUntil && d.goldEarlyUntil > new Date(),
      storeCount: d.offers.length,
      expiresAt: d.expiresAt,
    };
  }
}
