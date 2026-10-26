import type { Prisma } from '@prisma/client';

export type Tier = 'free' | 'gold';

/**
 * Which deals a shopper may see: active, not expired, with at least one offer that passes the given offer filter
 * (trust gate, freshness, optionally AI permission). Free users don't see Gold-only deals or deals still inside
 * their Gold early-access window. Shared by browsing, search and comparison so they can never disagree.
 */
export function dealVisibility(tier: Tier, offerFilter: Prisma.OfferWhereInput, now: Date = new Date()): Prisma.DealWhereInput {
  const base: Prisma.DealWhereInput = {
    status: 'ACTIVE',
    offers: { some: offerFilter },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  if (tier === 'gold') return base;
  return { AND: [base, { goldOnly: false }, { OR: [{ goldEarlyUntil: null }, { goldEarlyUntil: { lte: now } }] }] };
}
