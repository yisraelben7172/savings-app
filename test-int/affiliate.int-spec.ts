import type { Response } from 'express';
import { CommissionImportService } from '../src/affiliate/commission-import.service';
import { ClickRetentionService } from '../src/affiliate/click-retention.service';
import { ClicksController } from '../src/clicks/clicks.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaService();
const importer = new CommissionImportService(prisma);
const clicks = new ClicksController(prisma);
const retention = new ClickRetentionService(prisma);

const header = 'transaction_id,sub_id,status,sale_amount,commission,date';

async function reset() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Commission", "CommissionImport", "AffiliateProgram", "PriceHistory", "Click", "Offer", "Deal", "Product", "IngestionRun", "DataSource", "Merchant", "Category" RESTART IDENTITY CASCADE',
  );
}

/** A store, an approved network program with a template, and one offer to click. */
async function world(status: 'APPROVED' | 'APPLIED' = 'APPROVED') {
  const category = await prisma.category.create({ data: { slug: 'home', name: 'Home', color: 'butter' } });
  const merchant = await prisma.merchant.create({ data: { slug: 'shop', name: 'Shop', domain: 'shop.test', network: 'impact', approved: true, trustScore: 90 } });
  const program = await prisma.affiliateProgram.create({
    data: {
      merchantId: merchant.id, network: 'impact', name: 'Shop via Impact', status, linkMethod: 'DEEPLINK_TEMPLATE',
      linkTemplate: 'https://go.network.test/c?u={urlEncoded}&sid={clickId}', allowedTrackingHosts: ['network.test'],
    },
  });
  const deal = await prisma.deal.create({ data: { slug: 'lamp', title: 'Lamp', categoryId: category.id, originalPrice: 50, bestPrice: 40, discountPct: 20 } });
  const offer = await prisma.offer.create({ data: { dealId: deal.id, merchantId: merchant.id, price: 40, url: 'https://www.shop.test/lamp' } });
  return { merchant, program, offer };
}

async function clickThrough(offerId: string) {
  let location = '';
  await clicks.go(offerId, 'web-picker', undefined, { redirect: (_c: number, url: string) => (location = url) } as unknown as Response);
  return location;
}

describe('affiliate links, clicks and commissions (real database)', () => {
  beforeEach(reset);
  afterAll(() => prisma.$disconnect());

  it('tracks a click through an approved program, then matches the network report back to it', async () => {
    const { program, offer } = await world();
    const location = await clickThrough(offer.id);
    expect(location).toMatch(/^https:\/\/go\.network\.test\/c\?u=https%3A%2F%2Fwww\.shop\.test%2Flamp&sid=[a-f0-9]{24}$/);
    const clickId = new URL(location).searchParams.get('sid')!;

    const click = await prisma.click.findUniqueOrThrow({ where: { id: clickId } });
    expect(click).toMatchObject({ offerId: offer.id, programId: program.id, outcome: 'TRACKED', source: 'web-picker', destinationHost: 'go.network.test', sessionId: null });

    const report = [header, `T-1,${clickId},approved,$40.00,$2.00,2026-10-20`, 'T-2,someone-elses-sub,pending,$100,$5,2026-10-21', 'T-3,,Cancelled,$20,$1,2026-10-22', 'T-4,,in review,$20,$1,2026-10-22'].join('\n');
    const first = await importer.importCsv(program.id, report);
    expect(first).toMatchObject({ rowsRead: 4, created: 3, rejected: 1, matched: 1 });
    expect(first.errors).toEqual([expect.objectContaining({ row: 5, code: 'UNKNOWN_STATUS' })]);

    const matched = await prisma.commission.findUniqueOrThrow({ where: { programId_externalId: { programId: program.id, externalId: 'T-1' } } });
    expect(matched).toMatchObject({ clickId, status: 'APPROVED' });
    expect(Number(matched.amount)).toBe(2);
    expect((await prisma.commission.findUniqueOrThrow({ where: { programId_externalId: { programId: program.id, externalId: 'T-2' } } })).clickId).toBeNull();
  });

  it('sends plain, untracked links while the program is not approved', async () => {
    const { offer } = await world('APPLIED');
    expect(await clickThrough(offer.id)).toBe('https://www.shop.test/lamp');
    expect(await prisma.click.findFirstOrThrow()).toMatchObject({ outcome: 'PLAIN', programId: null });
  });

  it('re-importing a report changes nothing, and a newer report updates statuses', async () => {
    const { program } = await world();
    const v1 = [header, 'A,,pending,$10,$1,2026-10-01', 'B,,approved,$20,$2,2026-10-02'].join('\n');
    await importer.importCsv(program.id, v1);
    expect(await importer.importCsv(program.id, v1)).toMatchObject({ created: 0, updated: 0, unchanged: 2 });

    const v2 = [header, 'A,,approved,$10,$1,2026-10-01', 'B,,paid,$20,$2,2026-10-02', 'C,,pending,$5,$0.50,2026-10-05'].join('\n');
    expect(await importer.importCsv(program.id, v2)).toMatchObject({ created: 1, updated: 2, unchanged: 0 });
    expect(await prisma.commission.count()).toBe(3);
    expect((await prisma.commission.findMany({ orderBy: { externalId: 'asc' } })).map((c) => c.status)).toEqual(['APPROVED', 'PAID', 'PENDING']);
  });

  it('never moves a status backwards: paid stays paid, reversed is final', async () => {
    const { program } = await world();
    await importer.importCsv(program.id, [header, 'A,,paid,$10,$1,2026-10-01', 'B,,approved,$10,$1,2026-10-01'].join('\n'));
    await importer.importCsv(program.id, [header, 'A,,pending,$10,$1,2026-10-01', 'B,,reversed,$10,$1,2026-10-01'].join('\n'));
    await importer.importCsv(program.id, [header, 'B,,approved,$10,$1,2026-10-01'].join('\n'));
    const byId = Object.fromEntries((await prisma.commission.findMany()).map((c) => [c.externalId, c.status]));
    expect(byId).toEqual({ A: 'PAID', B: 'REVERSED' });
  });

  it("does not match another program's clicks", async () => {
    const { program, offer, merchant } = await world();
    const other = await prisma.affiliateProgram.create({ data: { merchantId: merchant.id, network: 'cj', name: 'Shop via CJ' } });
    const clickId = new URL(await clickThrough(offer.id)).searchParams.get('sid')!;
    await importer.importCsv(other.id, [header, `X,${clickId},approved,$10,$1,2026-10-01`].join('\n'));
    expect((await prisma.commission.findFirstOrThrow({ where: { programId: other.id } })).clickId).toBeNull();
    await importer.importCsv(program.id, [header, `X,${clickId},approved,$10,$1,2026-10-01`].join('\n'));
    expect((await prisma.commission.findFirstOrThrow({ where: { programId: program.id } })).clickId).toBe(clickId);
  });

  it('rejects reports missing required columns before saving anything', async () => {
    const { program } = await world();
    await expect(importer.importCsv(program.id, 'foo,bar\n1,2')).rejects.toThrow(/Missing columns: id, commission, date/);
    expect(await prisma.commissionImport.count()).toBe(0);
  });

  it('deletes clicks past the retention period but keeps the commission records', async () => {
    const { program, offer } = await world();
    const clickId = new URL(await clickThrough(offer.id)).searchParams.get('sid')!;
    await importer.importCsv(program.id, [header, `K,${clickId},approved,$10,$1,2026-10-01`].join('\n'));
    await prisma.click.update({ where: { id: clickId }, data: { createdAt: new Date(Date.now() - 800 * 864e5) } });
    expect(await retention.purge()).toBe(1);
    expect(await prisma.click.count()).toBe(0);
    const c = await prisma.commission.findFirstOrThrow();
    expect(c.clickId).toBeNull();
    expect(c.externalId).toBe('K');
  });
});
