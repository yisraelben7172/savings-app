import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ClicksController } from '../src/clicks/clicks.controller';
import type { PrismaService } from '../src/prisma/prisma.service';

type Program = Partial<{ id: string; status: string; linkMethod: string; accountTag: string | null; linkTemplate: string | null; allowedTrackingHosts: string[] }>;
const merchant = (o: Partial<{ approved: boolean; active: boolean; trustScore: number; domain: string; programs: Program[] }> = {}) => ({
  approved: true, active: true, trustScore: 90, domain: 'bestbuy.com', name: 'Best Buy', programs: [] as Program[], ...o,
});
const approved = (o: Program = {}) => ({ id: 'p1', status: 'APPROVED', linkMethod: 'AMAZON_TAG', accountTag: 'vault-20', linkTemplate: null, allowedTrackingHosts: [], ...o });

function setup(offer: unknown, clickCreate = jest.fn().mockResolvedValue({})) {
  const prisma = { offer: { findUnique: jest.fn().mockResolvedValue(offer) }, click: { create: clickCreate } } as unknown as PrismaService;
  const res = { redirect: jest.fn() } as unknown as Response;
  return { ctl: new ClicksController(prisma), res, click: { create: clickCreate } };
}

describe('Go to store redirect', () => {
  it('sends a plain link and logs a PLAIN click when the store has no approved program', async () => {
    const { ctl, res, click } = setup({ id: 'o1', url: 'https://www.bestbuy.com/p/1', merchant: merchant() });
    await ctl.go('o1', 'web-picker', undefined, res);
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://www.bestbuy.com/p/1');
    expect(click.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ offerId: 'o1', source: 'web-picker', outcome: 'PLAIN', programId: undefined, destinationHost: 'www.bestbuy.com' }),
    });
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
    await expect(ctl.go('o1', undefined, undefined, res)).rejects.toBeInstanceOf(NotFoundException);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(click.create).not.toHaveBeenCalled();
  });

  it('adds the Amazon tracking ID only through an approved Amazon program', async () => {
    const a = setup({ id: 'o1', url: 'https://www.amazon.com/dp/B1', merchant: merchant({ domain: 'amazon.com', programs: [approved()] }) });
    await a.ctl.go('o1', undefined, undefined, a.res);
    expect(a.res.redirect).toHaveBeenCalledWith(302, 'https://www.amazon.com/dp/B1?tag=vault-20');
    expect(a.click.create).toHaveBeenCalledWith({ data: expect.objectContaining({ outcome: 'TRACKED', programId: 'p1' }) });

    // No program (e.g. not approved yet): never tagged, even though it's an Amazon store.
    const b = setup({ id: 'o1', url: 'https://www.amazon.com/dp/B1', merchant: merchant({ domain: 'amazon.com' }) });
    await b.ctl.go('o1', undefined, undefined, b.res);
    expect(b.res.redirect).toHaveBeenCalledWith(302, 'https://www.amazon.com/dp/B1');
  });

  it("passes the click ID as the network's sub-ID and records the tracking host", async () => {
    const program = approved({ linkMethod: 'DEEPLINK_TEMPLATE', accountTag: null, linkTemplate: 'https://go.network.test/c?u={urlEncoded}&sid={clickId}', allowedTrackingHosts: ['network.test'] });
    const { ctl, res, click } = setup({ id: 'o1', url: 'https://www.bestbuy.com/p/1?x=1', merchant: merchant({ programs: [program] }) });
    await ctl.go('o1', undefined, undefined, res);
    const clickId = (click.create.mock.calls[0][0] as { data: { id: string } }).data.id;
    expect(clickId).toMatch(/^[a-f0-9]{24}$/);
    expect(res.redirect).toHaveBeenCalledWith(302, `https://go.network.test/c?u=${encodeURIComponent('https://www.bestbuy.com/p/1?x=1')}&sid=${clickId}`);
    expect(click.create).toHaveBeenCalledWith({ data: expect.objectContaining({ outcome: 'TRACKED', destinationHost: 'go.network.test' }) });
  });

  it('falls back to the plain store link, and says so, when a tracked link cannot be built', async () => {
    const broken = approved({ linkMethod: 'DEEPLINK_TEMPLATE', accountTag: null, linkTemplate: 'https://evil.test/?u={url}&sid={clickId}', allowedTrackingHosts: ['network.test'] });
    const { ctl, res, click } = setup({ id: 'o1', url: 'https://www.bestbuy.com/p/1', merchant: merchant({ programs: [broken] }) });
    await ctl.go('o1', undefined, undefined, res);
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://www.bestbuy.com/p/1');
    expect(click.create).toHaveBeenCalledWith({ data: expect.objectContaining({ outcome: 'FALLBACK', programId: 'p1' }) });
  });

  it('keeps only simple placement and recommendation labels', async () => {
    const { ctl, res, click } = setup({ id: 'o1', url: 'https://www.bestbuy.com/p/1', merchant: merchant() });
    await ctl.go('o1', 'x'.repeat(60), 'rec 1; DROP TABLE', res);
    const data = (click.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.source).toBeUndefined();
    expect(data.recommendationId).toBeUndefined();
    await ctl.go('o1', 'assistant', 'chat_8f2', res);
    expect((click.create.mock.calls[1][0] as { data: Record<string, unknown> }).data).toMatchObject({ source: 'assistant', recommendationId: 'chat_8f2' });
  });

  it('still redirects if logging the click fails', async () => {
    const { ctl, res } = setup({ id: 'o1', url: 'https://www.bestbuy.com/p/1', merchant: merchant() }, jest.fn().mockRejectedValue(new Error('db down')));
    await ctl.go('o1', undefined, undefined, res);
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://www.bestbuy.com/p/1');
  });
});
