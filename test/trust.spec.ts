import { isLinkOnMerchantDomain, MIN_TRUST_SCORE, trustedOffer } from '../src/deals/trust';

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

  it('only allows approved, in-stock offers from merchants at or above the minimum score', () => {
    expect(MIN_TRUST_SCORE).toBe(70);
    expect(trustedOffer).toEqual({ inStock: true, merchant: { approved: true, trustScore: { gte: 70 } } });
  });
});
