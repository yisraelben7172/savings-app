import { Prisma } from '@prisma/client';

/** The trust gate: only these stores can ever be shown, linked or recommended. */
export const MIN_TRUST_SCORE = 70;

export const trustedOffer: Prisma.OfferWhereInput = {
  inStock: true,
  merchant: { approved: true, trustScore: { gte: MIN_TRUST_SCORE } },
};

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
