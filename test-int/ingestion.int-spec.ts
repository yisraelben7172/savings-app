import { BadRequestException } from '@nestjs/common';
import { IngestionService } from '../src/catalog/ingestion.service';
import { DealsService } from '../src/deals/deals.service';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaService();
const ingestion = new IngestionService(prisma);
const deals = new DealsService(prisma);

const ALL_FIELDS = ['title', 'price', 'url', 'list_price', 'brand', 'identifiers', 'description', 'image', 'delivery', 'attributes'];
const header = 'sku,title,brand,mpn,upc,category,price,sale_price,url,availability,updated_at';
const fresh = () => new Date().toISOString();

async function reset() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "PriceHistory", "Click", "Offer", "Deal", "Product", "IngestionRun", "DataSource", "Merchant", "Category" RESTART IDENTITY CASCADE',
  );
  await prisma.category.createMany({ data: [{ slug: 'electronics', name: 'Electronics', color: 'sky' }, { slug: 'home', name: 'Home', color: 'butter' }] });
}

async function store(slug: string, domain: string) {
  return prisma.merchant.create({ data: { slug, name: slug, domain, network: 'impact', approved: true, trustScore: 90 } });
}

async function feed(merchantId: string, over: Partial<{ aiUseAllowed: boolean; priceFreshnessHours: number; retentionDays: number; status: 'ACTIVE' | 'AWAITING_APPROVAL' }> = {}) {
  return prisma.dataSource.create({
    data: { name: `feed-${merchantId}`, kind: 'CSV_FEED', status: 'ACTIVE', merchantId, accessMethod: 'test', permissionNotes: 'test', allowedFields: ALL_FIELDS, aiUseAllowed: true, ...over },
  });
}

describe('CSV ingestion (real database)', () => {
  beforeEach(reset);
  afterAll(() => prisma.$disconnect());

  it('imports valid rows, rejects bad ones with reasons, and is idempotent on re-import', async () => {
    const bb = await store('best-buy', 'bestbuy.com');
    const src = await feed(bb.id);
    const csv = [
      header,
      `BB-1,Sony WH-1000XM5 headphones,Sony,WH-1000XM5,036000291452,electronics,349.99,279.99,https://www.bestbuy.com/p/1,in stock,${fresh()}`,
      `BB-2,Bose QC Ultra,Bose,QCU-01,,electronics,429.00,,https://www.bestbuy.com/p/2,in stock,${fresh()}`,
      `BB-3,Oak desk lamp,,,,home,59.00,49.00,https://www.bestbuy.com/p/3,in stock,${fresh()}`,
      `BB-4,Bad link item,,,,home,10,,https://evil.test/p/4,in stock,${fresh()}`,
    ].join('\n');

    const first = await ingestion.importCsv(src.id, csv);
    expect(first).toMatchObject({ status: 'PARTIAL', rowsRead: 4, created: 3, rejected: 1, updated: 0 });
    expect(first.errors).toEqual([expect.objectContaining({ row: 5, code: 'OFF_DOMAIN_URL' })]);
    expect(await prisma.product.count()).toBe(3);
    expect(await prisma.offer.count()).toBe(3);
    expect(await prisma.priceHistory.count()).toBe(3);

    const again = await ingestion.importCsv(src.id, csv);
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 3, rejected: 1 });
    expect(await prisma.product.count()).toBe(3);
    expect(await prisma.deal.count()).toBe(3);
    expect(await prisma.offer.count()).toBe(3);
    expect(await prisma.priceHistory.count()).toBe(3); // no new points when prices didn't change

    const s = await prisma.dataSource.findUniqueOrThrow({ where: { id: src.id } });
    expect(s.health).toBe('DEGRADED');
    expect(await prisma.ingestionRun.count({ where: { sourceId: src.id } })).toBe(2);
  });

  it('records price changes, and marks SKUs missing from a full snapshot as out of stock', async () => {
    const bb = await store('best-buy', 'bestbuy.com');
    const src = await feed(bb.id);
    await ingestion.importCsv(src.id, [header, `A,Lamp,,,,home,50,,https://bestbuy.com/a,in stock,${fresh()}`, `B,Rug,,,,home,80,,https://bestbuy.com/b,in stock,${fresh()}`].join('\n'));

    const r = await ingestion.importCsv(src.id, [header, `A,Lamp,,,,home,45,,https://bestbuy.com/a,in stock,${fresh()}`].join('\n'));
    expect(r).toMatchObject({ status: 'SUCCEEDED', updated: 1, markedOut: 1 });
    expect((await prisma.offer.findFirstOrThrow({ where: { retailerSku: 'B' } })).inStock).toBe(false);
    const lamp = await prisma.offer.findFirstOrThrow({ where: { retailerSku: 'A' }, include: { deal: { include: { priceHistory: { orderBy: { recordedAt: 'asc' } } } } } });
    expect(lamp.deal.priceHistory.map((p) => Number(p.price))).toEqual([50, 45]);
    expect(Number(lamp.deal.bestPrice)).toBe(45);

    const visible = (await deals.list({ limit: 50 })).map((d) => d.title);
    expect(visible).toEqual(['Lamp']); // the rug is out of stock, so it's hidden
  });

  it('merges the same product across stores only by GTIN or brand + MPN, never by title', async () => {
    const bb = await store('best-buy', 'bestbuy.com');
    const wm = await store('walmart', 'walmart.com');
    const s1 = await feed(bb.id);
    const s2 = await feed(wm.id);
    await ingestion.importCsv(s1.id, [header,
      `1,Sony WH-1000XM5,Sony,WH-1000XM5,036000291452,electronics,300,,https://bestbuy.com/1,,${fresh()}`,
      `2,Bose QC Ultra,Bose,QCU-01,,electronics,400,,https://bestbuy.com/2,,${fresh()}`,
      `3,Oak desk lamp,,,,home,50,,https://bestbuy.com/3,,${fresh()}`,
    ].join('\n'));
    await ingestion.importCsv(s2.id, [header,
      `W1,Sony Wireless Headphones (Black),Sony,,00036000291452,electronics,289,,https://walmart.com/1,,${fresh()}`, // same GTIN
      `W2,QC Ultra by Bose,BOSE,qcu 01,,electronics,410,,https://walmart.com/2,,${fresh()}`, // same brand + MPN
      `W3,Oak desk lamp,,,,home,48,,https://walmart.com/3,,${fresh()}`, // same title, no identifiers
    ].join('\n'));

    expect(await prisma.product.count()).toBe(4); // 3 + the lamp, which is NOT merged on title alone
    const sony = await prisma.product.findUniqueOrThrow({ where: { gtin: '00036000291452' }, include: { deals: { include: { offers: true } } } });
    expect(sony.deals[0].offers).toHaveLength(2);
    expect(Number(sony.deals[0].bestPrice)).toBe(289);
    const lamps = await prisma.product.findMany({ where: { title: 'Oak desk lamp' } });
    expect(lamps).toHaveLength(2);
  });

  it('hides prices older than the source allows, instead of showing them as current', async () => {
    const bb = await store('best-buy', 'bestbuy.com');
    const src = await feed(bb.id, { priceFreshnessHours: 24 });
    const old = new Date(Date.now() - 3 * 864e5).toISOString();
    await ingestion.importCsv(src.id, [header, `OLD,Old price item,,,,home,20,,https://bestbuy.com/old,,${old}`, `NEW,New price item,,,,home,30,,https://bestbuy.com/new,,${fresh()}`].join('\n'));

    expect((await deals.list({ limit: 50 })).map((d) => d.title)).toEqual(['New price item']);
    const oldDeal = await prisma.deal.findFirstOrThrow({ where: { title: 'Old price item' } });
    await expect(deals.detail(oldDeal.slug)).rejects.toThrow('Deal not found');
  });

  it('only gives the assistant data whose source allows AI use', async () => {
    const bb = await store('best-buy', 'bestbuy.com');
    const wm = await store('walmart', 'walmart.com');
    await ingestion.importCsv((await feed(bb.id, { aiUseAllowed: true })).id, [header, `1,Allowed lamp,,,,home,20,,https://bestbuy.com/1,,${fresh()}`].join('\n'));
    await ingestion.importCsv((await feed(wm.id, { aiUseAllowed: false })).id, [header, `1,Restricted lamp,,,,home,20,,https://walmart.com/1,,${fresh()}`].join('\n'));

    expect((await deals.list({ q: 'lamp', limit: 10 })).map((d) => d.title).sort()).toEqual(['Allowed lamp', 'Restricted lamp']);
    expect((await deals.list({ q: 'lamp', limit: 10, aiOnly: true })).map((d) => d.title)).toEqual(['Allowed lamp']);
  });

  it('refuses sources that are not approved, and disabled sources disappear from the site', async () => {
    const bb = await store('best-buy', 'bestbuy.com');
    const pending = await feed(bb.id, { status: 'AWAITING_APPROVAL' });
    await expect(ingestion.importCsv(pending.id, `${header}\n1,X,,,,home,5,,https://bestbuy.com/1,,`)).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.ingestionRun.count()).toBe(0);

    const src = await feed(bb.id);
    await ingestion.importCsv(src.id, [header, `1,Visible lamp,,,,home,20,,https://bestbuy.com/1,,${fresh()}`].join('\n'));
    expect(await deals.list({ limit: 10 })).toHaveLength(1);
    await prisma.dataSource.update({ where: { id: src.id }, data: { status: 'DISABLED' } });
    expect(await deals.list({ limit: 10 })).toHaveLength(0);
  });

  it('rejects files with missing columns before touching anything', async () => {
    const bb = await store('best-buy', 'bestbuy.com');
    const src = await feed(bb.id);
    await expect(ingestion.importCsv(src.id, 'name,cost\nLamp,5')).rejects.toThrow(/Missing columns: sku, url, category, price/);
    expect(await prisma.ingestionRun.count()).toBe(0);
  });

  it("deletes price history past the source's retention period", async () => {
    const bb = await store('best-buy', 'bestbuy.com');
    const src = await feed(bb.id, { retentionDays: 30 });
    await ingestion.importCsv(src.id, [header, `1,Lamp,,,,home,20,,https://bestbuy.com/1,,${fresh()}`].join('\n'));
    const deal = await prisma.deal.findFirstOrThrow();
    await prisma.priceHistory.create({ data: { dealId: deal.id, price: 25, sourceId: src.id, recordedAt: new Date(Date.now() - 60 * 864e5) } });
    expect(await ingestion.applyRetention(src.id, 30)).toBe(1);
    expect(await prisma.priceHistory.count()).toBe(1);
  });
});
