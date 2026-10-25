import { aiAllowedOffer, cardPrices, isLinkOnMerchantDomain, MIN_TRUST_SCORE, staleAfter, trustedOffer } from '../src/deals/trust';

describe('trust gate', () => {
  it('accepts https links on the merchant domain and its subdomains', () => {
    expect(isLinkOnMerchantDomain('https://amazon.com/dp/1', 'amazon.com')).toBe(true);
    expect(isLinkOnMerchantDomain('https://www.amazon.com/dp/1', 'amazon.com')).toBe(true);
    expect(isLinkOnMerchantDomain('https://WWW.Amazon.COM/x', 'amazon.com')).toBe(true);
  });

  it('rejects http, lookalike and foreign domains', () => {
    expect(isLinkOnMerchantDomain('http://www.amazon.com/dp/1', 'amazon.com')).toBe(false);
    expect(isLinkOnMerchantDomain('https://evil-amazon.com/dp/1', 'amazon.com')).toBe(false);
    expect(isLinkOnMerchantDomain('https://amazon.com.evil.com/dp/1', 'amazon.com')).toBe(false);
    expect(isLinkOnMerchantDomain('https://evil.com/?u=https://amazon.com', 'amazon.com')).toBe(false);
    expect(isLinkOnMerchantDomain('javascript:alert(1)', 'amazon.com')).toBe(false);
    expect(isLinkOnMerchantDomain('not a url', 'amazon.com')).toBe(false);
  });

  it('only shows in-stock offers from approved, active, trusted stores, from enabled sources, that are not stale', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    expect(MIN_TRUST_SCORE).toBe(70);
    expect(trustedOffer(now)).toEqual({
      inStock: true,
      merchant: { approved: true, active: true, trustScore: { gte: 70 } },
      AND: [
        { OR: [{ staleAfter: null }, { staleAfter: { gt: now } }] },
        { OR: [{ sourceId: null }, { source: { status: { in: ['ACTIVE', 'PAUSED'] } } }] },
      ],
    });
  });

  it('adds the AI-use permission for the assistant', () => {
    const f = aiAllowedOffer(new Date());
    expect(f.AND).toEqual(expect.arrayContaining([{ source: { aiUseAllowed: true } }]));
    expect(f.merchant).toEqual(trustedOffer().merchant);
  });

  it('computes when a price goes stale', () => {
    expect(staleAfter(new Date('2026-10-28T00:00:00Z'), 24).toISOString()).toBe('2026-10-29T00:00:00.000Z');
    expect(staleAfter(new Date('2026-10-28T00:00:00Z'), 0).toISOString()).toBe('2026-10-28T01:00:00.000Z'); // minimum 1 hour
  });
});

describe('card prices', () => {
  it("uses the cheapest offer and that offer's own list price for the discount", () => {
    expect(cardPrices([{ price: 80, listPrice: 100 }, { price: 85, listPrice: 120 }], { originalPrice: 0, isLegacyDemo: false }))
      .toEqual({ bestPrice: 80, originalPrice: 100, discountPct: 20, saved: 20 });
  });

  it('never invents a discount when the source gives no list price', () => {
    expect(cardPrices([{ price: 80, listPrice: null }], { originalPrice: 150, isLegacyDemo: false }))
      .toEqual({ bestPrice: 80, originalPrice: 80, discountPct: 0, saved: 0 });
  });

  it('keeps the stored price for legacy demo deals', () => {
    expect(cardPrices([{ price: 64 }], { originalPrice: 128, isLegacyDemo: true })).toEqual({ bestPrice: 64, originalPrice: 128, discountPct: 50, saved: 64 });
  });

  it('returns nothing when no offer is currently shown', () => {
    expect(cardPrices([], { originalPrice: 10, isLegacyDemo: true })).toBeNull();
  });
});
