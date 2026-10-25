import { Prisma } from '@prisma/client';

/** The trust gate: only these stores can ever be shown, linked or recommended. */
export const MIN_TRUST_SCORE = 70;

/**
 * Offers we may show as current: approved, active store with enough trust, in stock, from a source that isn't
 * disabled, and not past its freshness window. Stale prices are hidden rather than shown as live.
 */
export function trustedOffer(now: Date = new Date()): Prisma.OfferWhereInput {
  return {
    inStock: true,
    merchant: { approved: true, active: true, trustScore: { gte: MIN_TRUST_SCORE } },
    AND: [
      { OR: [{ staleAfter: null }, { staleAfter: { gt: now } }] },
      { OR: [{ sourceId: null }, { source: { status: { in: ['ACTIVE', 'PAUSED'] } } }] },
    ],
  };
}

/** Trusted offers whose source agreement allows sending the data to an AI model (the assistant). */
export function aiAllowedOffer(now: Date = new Date()): Prisma.OfferWhereInput {
  const base = trustedOffer(now);
  return { ...base, AND: [...(base.AND as Prisma.OfferWhereInput[]), { source: { aiUseAllowed: true } }] };
}

/** When an offer checked at `checkedAt` stops counting as a current price. */
export function staleAfter(checkedAt: Date, freshnessHours: number) {
  return new Date(checkedAt.getTime() + Math.max(1, freshnessHours) * 3600_000);
}

/** A link is only allowed if it points at the merchant's own domain over https. */
export function isLinkOnMerchantDomain(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const d = domain.toLowerCase();
    return u.protocol === 'https:' && (host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

type PricedOffer = { price: Prisma.Decimal | number; listPrice?: Prisma.Decimal | number | null };

/**
 * Card prices from the offers that are currently shown. The "was" price is the cheapest offer's own list price
 * from its source; we never invent a discount. Legacy demo deals (no product) fall back to their stored price.
 */
export function cardPrices(offers: PricedOffer[], stored: { originalPrice: number; isLegacyDemo: boolean }) {
  if (!offers.length) return null;
  const best = offers.reduce((a, o) => (Number(o.price) < Number(a.price) ? o : a));
  const bestPrice = Number(best.price);
  const list = best.listPrice != null ? Number(best.listPrice) : null;
  const originalPrice = list != null && list > bestPrice ? list : stored.isLegacyDemo ? Math.max(stored.originalPrice, bestPrice) : bestPrice;
  const discountPct = originalPrice > bestPrice ? Math.round(((originalPrice - bestPrice) / originalPrice) * 100) : 0;
  return { bestPrice, originalPrice, discountPct, saved: Math.round((originalPrice - bestPrice) * 100) / 100 };
}
