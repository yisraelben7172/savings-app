import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DealsService } from '../deals/deals.service';
import { aiAllowedOffer, trustedOffer } from '../deals/trust';
import { dealVisibility, type Tier } from '../deals/visibility';
import { PrismaService } from '../prisma/prisma.service';
import { buildComparison, type CompareItem } from './compare';
import type { Candidate, Ranked } from './ranking';
import { rankCandidates } from './ranking';
import { queryTerms, type ShoppingRequest } from './shopping-request';

const CANDIDATE_LIMIT = 300;
const MAX_COMPARE = 5;

export type SearchOptions = { tier?: Tier; /** only offers whose source allows AI use */ aiOnly?: boolean; now?: Date };
export type SearchResult = { card: NonNullable<ReturnType<DealsService['toCard']>>; ranked: Ranked };

function flatten(attrs: unknown): Record<string, string> {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return {};
  return Object.fromEntries(
    Object.entries(attrs as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 80)]),
  );
}

/**
 * Search = retrieval (database, for recall) + hard-constraint filtering and transparent ranking (pure code).
 * Nothing here reads affiliate programs, commissions or clicks.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService, private readonly deals: DealsService) {}

  async search(req: ShoppingRequest, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const now = opts.now ?? new Date();
    const offerFilter = opts.aiOnly ? aiAllowedOffer(now) : trustedOffer(now);
    const and: Prisma.DealWhereInput[] = [dealVisibility(opts.tier ?? 'free', offerFilter, now)];
    if (req.category) and.push({ category: { slug: req.category } });

    // Retrieval is deliberately broad (any word or synonym, anywhere in the text); ranking.ts then applies the exact rules.
    const terms = [...queryTerms(req.query).flatMap((t) => [t.word, ...t.alts]), ...req.brands];
    if (terms.length) {
      and.push({
        OR: terms.flatMap((w) => [
          { title: { contains: w, mode: 'insensitive' as const } },
          { description: { contains: w, mode: 'insensitive' as const } },
          { category: { name: { contains: w, mode: 'insensitive' as const } } },
          { product: { brand: { contains: w, mode: 'insensitive' as const } } },
        ]),
      });
    }

    const rows = await this.prisma.deal.findMany({
      where: { AND: and },
      orderBy: { slug: 'asc' },
      take: CANDIDATE_LIMIT,
      include: {
        category: true,
        product: { select: { brand: true, attributes: true } },
        offers: { where: offerFilter, include: { merchant: { select: { slug: true, name: true } } } },
      },
    });

    const byDeal = new Map(rows.map((r) => [r.slug, r]));
    const candidates: Candidate[] = rows.map((d) => ({
      slug: d.slug,
      title: d.title,
      categorySlug: d.category.slug,
      categoryName: d.category.name,
      brand: d.product?.brand ?? null,
      description: d.description,
      attributesText: Object.entries(flatten(d.product?.attributes)).map(([k, v]) => `${k}: ${v}`).join(' '),
      priceUnit: d.priceUnit,
      offers: d.offers.map((o) => ({
        store: o.merchant.name,
        storeSlug: o.merchant.slug,
        price: Number(o.price),
        listPrice: o.listPrice == null ? null : Number(o.listPrice),
        deliveryNote: o.deliveryNote,
        lastCheckedAt: o.lastCheckedAt,
        staleAfter: o.staleAfter,
      })),
    }));

    const out: SearchResult[] = [];
    for (const ranked of rankCandidates(candidates, req, now)) {
      const deal = byDeal.get(ranked.candidate.slug)!;
      const card = this.deals.toCard({ ...deal, offers: deal.offers.map((o) => ({ id: o.id, price: o.price, listPrice: o.listPrice })) });
      if (card) out.push({ card, ranked });
    }
    return out;
  }

  /** Side-by-side comparison of 2 to 5 deals the shopper is allowed to see. Unknown or hidden slugs are reported, not guessed. */
  async compare(slugs: string[], opts: SearchOptions = {}) {
    const wanted = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))];
    if (wanted.length < 2 || wanted.length > MAX_COMPARE) throw new BadRequestException(`Choose between 2 and ${MAX_COMPARE} deals to compare.`);
    const now = opts.now ?? new Date();
    const offerFilter = opts.aiOnly ? aiAllowedOffer(now) : trustedOffer(now);

    const rows = await this.prisma.deal.findMany({
      where: { AND: [{ slug: { in: wanted } }, dealVisibility(opts.tier ?? 'free', offerFilter, now)] },
      include: {
        category: true,
        product: { select: { brand: true, attributes: true } },
        offers: { where: offerFilter, include: { merchant: { select: { slug: true, name: true } } } },
        priceHistory: { orderBy: { recordedAt: 'desc' }, take: 400 },
      },
    });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    const items: CompareItem[] = wanted
      .filter((s) => bySlug.has(s) && bySlug.get(s)!.offers.length > 0)
      .map((s) => {
        const d = bySlug.get(s)!;
        return {
          slug: d.slug,
          title: d.title,
          categorySlug: d.category.slug,
          categoryName: d.category.name,
          brand: d.product?.brand ?? null,
          attributes: flatten(d.product?.attributes),
          priceUnit: d.priceUnit,
          offers: d.offers.map((o) => ({
            store: o.merchant.name, storeSlug: o.merchant.slug, price: Number(o.price), listPrice: o.listPrice == null ? null : Number(o.listPrice),
            deliveryNote: o.deliveryNote, lastCheckedAt: o.lastCheckedAt, staleAfter: o.staleAfter,
          })),
          history: [...d.priceHistory].reverse().map((h) => ({ price: Number(h.price), date: h.recordedAt })),
        };
      });
    const unavailable = wanted.filter((s) => !items.some((i) => i.slug === s));
    if (items.length < 2) throw new BadRequestException('At least two of those deals must be currently available to compare.');
    return { ...buildComparison(items, now), unavailable };
  }
}
