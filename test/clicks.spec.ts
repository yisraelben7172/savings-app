import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ClicksController } from '../src/clicks/clicks.controller';
import type { PrismaService } from '../src/prisma/prisma.service';

const merchant = (o: Partial<{ approved: boolean; active: boolean; trustScore: number; domain: string; network: string; affiliateTag: string | null }> = {}) => ({
  approved: true, active: true, trustScore: 90, domain: 'bestbuy.com', network: 'impact', affiliateTag: null, ...o,
});

function setup(offer: unknown) {
  const click = { create: jest.fn().mockResolvedValue({}) };
  const prisma = { offer: { findUnique: jest.fn().mockResolvedValue(offer) }, click } as unknown as PrismaService;
  const res = { redirect: jest.fn() } as unknown as Response;
  return { ctl: new ClicksController(prisma), res, click };
}

describe('Go to store redirect', () => {
  afterEach(() => delete process.env.AMAZON_ASSOCIATE_TAG);

  it('redirects to the stored merchant URL and logs the click', async () => {
    const { ctl, res, click } = setup({ id: 'o1', url: 'https://www.bestbuy.com/p/1', merchant: merchant() });
    await ctl.go('o1', 'web', res);
    expect(click.create).toHaveBeenCalledWith({ data: { offerId: 'o1', source: 'web' } });
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://www.bestbuy.com/p/1');
  });

  it.each([
    ['unknown offer', null],
    ['unapproved merchant', { url: 'https://www.bestbuy.com/p/1', merchant: merchant({ approved: false }) }],
    ['inactive merchant', { url: 'https://www.bestbuy.com/p/1', merchant: merchant({ active: false }) }],
    ['low trust score', { url: 'https://www.bestbuy.com/p/1', merchant: merchant({ trustScore: 69 }) }],
    ['URL off the merchant domain', { url: 'https://evil.example/p/1', merchant: merchant() }],
    ['plain http URL', { url: 'http://www.bestbuy.com/p/1', merchant: merchant() }],
  ])('refuses: %s (no redirect, no click)', async (_label, offer) => {
    const { ctl, res, click } = setup(offer);
    await expect(ctl.go('o1', undefined, res)).rejects.toBeInstanceOf(NotFoundException);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(click.create).not.toHaveBeenCalled();
  });

  it('adds the Amazon associate tag only for Amazon merchants', async () => {
    process.env.AMAZON_ASSOCIATE_TAG = 'vault-20';
    const a = setup({ url: 'https://www.amazon.com/dp/B1', merchant: merchant({ domain: 'amazon.com', network: 'amazon' }) });
    await a.ctl.go('o1', undefined, a.res);
    expect(a.res.redirect).toHaveBeenCalledWith(302, 'https://www.amazon.com/dp/B1?tag=vault-20');

    const b = setup({ url: 'https://www.bestbuy.com/p/1', merchant: merchant() });
    await b.ctl.go('o1', undefined, b.res);
    expect(b.res.redirect).toHaveBeenCalledWith(302, 'https://www.bestbuy.com/p/1');
  });

  it('truncates the source label', async () => {
    const { ctl, res, click } = setup({ url: 'https://www.bestbuy.com/p/1', merchant: merchant() });
    await ctl.go('o1', 'x'.repeat(100), res);
    expect(click.create).toHaveBeenCalledWith({ data: { offerId: 'o1', source: 'x'.repeat(20) } });
  });
});
