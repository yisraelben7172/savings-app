import type { PrismaClient } from '@prisma/client';

/**
 * SYNTHETIC evaluation catalog. Every product, store price and discount here is invented to exercise the search,
 * ranking and safety rules. It is not real retailer data and says nothing about any real integration.
 */
type O = [store: string, price: number, listPrice?: number];
type D = { slug: string; title: string; cat: string; brand?: string; offers: O[]; unit?: string; flags?: { goldOnly?: boolean; staleHours?: number; outOfStock?: boolean; source?: 'noai' | 'off'; merchant?: string } };

export const STORES = ['Amazon', 'Best Buy', 'Walmart', 'Target', 'Zappos', 'REI', 'Ulta', 'Sephora', "Macy's", 'Expedia', 'Booking.com', 'Ticketmaster', 'SeatGeek'];

export const DEALS: D[] = [
  // electronics
  { slug: 'sony-wh1000xm5', cat: 'electronics', brand: 'Sony', title: 'Sony WH-1000XM5 wireless noise-cancelling headphones', offers: [['Best Buy', 329, 399], ['Amazon', 338], ['Walmart', 349]] },
  { slug: 'bose-qc-ultra', cat: 'electronics', brand: 'Bose', title: 'Bose QuietComfort Ultra noise-cancelling headphones', offers: [['Best Buy', 379, 429], ['Target', 399]] },
  { slug: 'jbl-tune-520', cat: 'electronics', brand: 'JBL', title: 'JBL Tune 520BT wireless on-ear headphones', offers: [['Walmart', 39, 59], ['Amazon', 42]] },
  { slug: 'airpods-pro', cat: 'electronics', brand: 'Apple', title: 'Apple AirPods Pro 2 wireless earbuds', offers: [['Amazon', 189, 249], ['Target', 199], ['Best Buy', 199]] },
  { slug: 'anker-p20i', cat: 'electronics', brand: 'Anker', title: 'Anker Soundcore P20i true wireless earbuds', offers: [['Amazon', 19], ['Walmart', 24]] },
  { slug: 'lenovo-ideapad', cat: 'electronics', brand: 'Lenovo', title: 'Lenovo IdeaPad 5 14-inch laptop, 16GB RAM', offers: [['Best Buy', 549, 699], ['Walmart', 579]] },
  { slug: 'hp-pavilion', cat: 'electronics', brand: 'HP', title: 'HP Pavilion 15 laptop, 8GB RAM', offers: [['Walmart', 429], ['Best Buy', 449]] },
  { slug: 'macbook-air', cat: 'electronics', brand: 'Apple', title: 'Apple MacBook Air 13-inch laptop M3, 16GB', offers: [['Amazon', 899, 1099], ['Best Buy', 949], ['Target', 959]] },
  { slug: 'dell-inspiron', cat: 'electronics', brand: 'Dell', title: 'Dell Inspiron 16 laptop, 16GB RAM', offers: [['Best Buy', 799]] },
  { slug: 'samsung-tv-55', cat: 'electronics', brand: 'Samsung', title: 'Samsung 55-inch 4K smart TV', offers: [['Walmart', 379, 499], ['Best Buy', 399]] },
  { slug: 'lg-monitor-27', cat: 'electronics', brand: 'LG', title: 'LG 27-inch 4K monitor', offers: [['Amazon', 249, 329], ['Best Buy', 259]] },
  // clothing
  { slug: 'brooks-ghost', cat: 'clothing', brand: 'Brooks', title: "Brooks Ghost 16 men's running shoes", offers: [['Zappos', 120, 140], ['Amazon', 124], ['REI', 130]] },
  { slug: 'nike-pegasus', cat: 'clothing', brand: 'Nike', title: "Nike Pegasus 41 men's road running shoes", offers: [['Zappos', 100], ["Macy's", 105]] },
  { slug: 'salomon-speedcross', cat: 'clothing', brand: 'Salomon', title: 'Salomon Speedcross waterproof trail running shoes', offers: [['REI', 119, 140], ['Zappos', 125]] },
  { slug: 'hoka-clifton', cat: 'clothing', brand: 'Hoka', title: "Hoka Clifton 9 women's running shoes", offers: [['Zappos', 130], ['REI', 130]] },
  { slug: 'adidas-duramo', cat: 'clothing', brand: 'Adidas', title: 'Adidas Duramo running shoes', offers: [["Macy's", 55, 70], ['Zappos', 60]] },
  { slug: 'patagonia-rain-jacket', cat: 'clothing', brand: 'Patagonia', title: 'Patagonia waterproof rain jacket', offers: [['REI', 149], ['Zappos', 159]] },
  { slug: 'danner-boots', cat: 'clothing', brand: 'Danner', title: 'Danner leather hiking boots', offers: [['REI', 230]] },
  { slug: 'merino-overshirt', cat: 'clothing', title: 'Merino wool overshirt', offers: [["Macy's", 64, 128], ['Target', 72]] },
  // beauty
  { slug: 'cerave-cream', cat: 'beauty', brand: 'CeraVe', title: 'CeraVe moisturizing cream for dry skin, 16 oz', offers: [['Ulta', 15, 20], ['Target', 14], ['Amazon', 16]] },
  { slug: 'vitamin-c-serum', cat: 'beauty', title: 'Vitamin C brightening serum, 30 ml', offers: [['Ulta', 21, 35], ['Sephora', 23]] },
  { slug: 'neutrogena-spf50', cat: 'beauty', brand: 'Neutrogena', title: 'Neutrogena SPF 50 sunscreen', offers: [['Target', 11], ['Walmart', 10]] },
  { slug: 'fenty-foundation', cat: 'beauty', brand: 'Fenty', title: 'Fenty Beauty liquid foundation', offers: [['Sephora', 40]] },
  // home
  { slug: 'lodge-dutch-oven', cat: 'home', brand: 'Lodge', title: 'Lodge cast-iron dutch oven, 6 quart', offers: [['Target', 47, 79], ['Walmart', 52], ['Amazon', 55]] },
  { slug: 'led-desk-lamp', cat: 'home', title: 'LED desk lamp with dimmer', offers: [['Amazon', 25], ['Target', 29]] },
  { slug: 'standing-desk', cat: 'home', brand: 'FlexiSpot', title: 'Electric standing desk, 48-inch', offers: [['Amazon', 229, 329], ['Walmart', 249]] },
  { slug: 'office-chair', cat: 'home', brand: 'Branch', title: 'Ergonomic office chair with lumbar support', offers: [['Amazon', 249], ['Target', 269], ['Walmart', 275]] },
  { slug: 'shark-vacuum', cat: 'home', brand: 'Shark', title: 'Shark cordless stick vacuum', offers: [['Walmart', 179, 249], ['Target', 189]] },
  // travel and events
  { slug: 'lisbon-hotel', cat: 'hotels', title: 'Boutique hotel in Lisbon, 3 nights', offers: [['Booking.com', 312, 540], ['Expedia', 335]] },
  { slug: 'miami-hotel', cat: 'hotels', title: 'Beachfront hotel in Miami Beach, 2 nights', offers: [['Expedia', 289], ['Booking.com', 299]] },
  { slug: 'suv-rental', cat: 'car-rentals', title: 'Midsize SUV rental, unlimited miles', unit: 'per day', offers: [['Expedia', 39, 62], ['Booking.com', 41]] },
  { slug: 'compact-rental', cat: 'car-rentals', title: 'Compact car rental, airport pickup', unit: 'per day', offers: [['Booking.com', 24], ['Expedia', 26]] },
  { slug: 'arena-floor-seats', cat: 'concerts', title: 'Floor seats, arena show, Saturday night', offers: [['SeatGeek', 89, 145], ['Ticketmaster', 95]] },
  // traps: none of these may reach a free shopper (or the AI) where noted
  { slug: 'stale-blender', cat: 'home', title: 'Old price blender', offers: [['Target', 30]], flags: { staleHours: 48 } },
  { slug: 'oos-air-fryer', cat: 'home', title: 'Out of stock air fryer', offers: [['Target', 70]], flags: { outOfStock: true } },
  { slug: 'shady-laptop', cat: 'electronics', title: 'Too good to be true laptop', offers: [['Cheap Deals Outlet', 99]], flags: { merchant: 'shady' } },
  { slug: 'gold-headphones', cat: 'electronics', brand: 'Sony', title: 'Gold-only noise-cancelling headphones', offers: [['Best Buy', 99]], flags: { goldOnly: true } },
  { slug: 'noai-espresso', cat: 'home', title: 'Restricted-source espresso machine', offers: [['Target', 149]], flags: { source: 'noai' } },
  { slug: 'off-speaker', cat: 'electronics', title: 'Disabled-source bluetooth speaker', offers: [['Amazon', 59]], flags: { source: 'off' } },
];

export async function seedCatalog(prisma: PrismaClient, now: Date = new Date()) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Commission", "CommissionImport", "AffiliateProgram", "PriceHistory", "Click", "Offer", "Deal", "Product", "IngestionRun", "DataSource", "Merchant", "Category", "AiUsage" RESTART IDENTITY CASCADE',
  );
  const cats: [string, string, string][] = [['electronics', 'Electronics', 'sky'], ['clothing', 'Clothing', 'mint'], ['beauty', 'Beauty', 'blush'], ['home', 'Home', 'butter'], ['hotels', 'Hotels', 'peach'], ['car-rentals', 'Car rentals', 'teal'], ['concerts', 'Concerts', 'rose']];
  const category = Object.fromEntries(await Promise.all(cats.map(async ([slug, name, color]) => [slug, (await prisma.category.create({ data: { slug, name, color } })).id])));

  const merchant: Record<string, string> = {};
  for (const name of [...STORES, 'Cheap Deals Outlet']) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const bad = name === 'Cheap Deals Outlet';
    merchant[name] = (await prisma.merchant.create({ data: { slug, name, domain: `${slug}.test`, network: 'impact', approved: !bad, trustScore: bad ? 22 : 90 } })).id;
  }

  const source = {
    ok: (await prisma.dataSource.create({ data: { name: 'eval feed', kind: 'CSV_FEED', status: 'ACTIVE', aiUseAllowed: true } })).id,
    noai: (await prisma.dataSource.create({ data: { name: 'eval feed (no AI)', kind: 'CSV_FEED', status: 'ACTIVE', aiUseAllowed: false } })).id,
    off: (await prisma.dataSource.create({ data: { name: 'eval feed (disabled)', kind: 'CSV_FEED', status: 'DISABLED', aiUseAllowed: true } })).id,
  };

  for (const d of DEALS) {
    const product = await prisma.product.create({ data: { title: d.title, brand: d.brand ?? null, brandKey: d.brand?.toLowerCase() ?? null, categoryId: category[d.cat] } });
    const best = Math.min(...d.offers.map((o) => o[1]));
    const list = d.offers.find((o) => o[2])?.[2];
    const deal = await prisma.deal.create({
      data: {
        slug: d.slug, title: d.title, productId: product.id, categoryId: category[d.cat], priceUnit: d.unit ?? null, originalPrice: list ?? best, bestPrice: best,
        discountPct: list ? Math.round(((list - best) / list) * 100) : 0, goldOnly: d.flags?.goldOnly ?? false,
      },
    });
    for (const [i, [store, price, listPrice]] of d.offers.entries()) {
      const age = (d.flags?.staleHours ?? 1 + i * 2) * 3600_000;
      const checked = new Date(now.getTime() - age);
      const sourceId = d.flags?.source === 'noai' ? source.noai : d.flags?.source === 'off' ? source.off : source.ok;
      await prisma.offer.create({
        data: {
          dealId: deal.id, merchantId: merchant[d.flags?.merchant === 'shady' ? 'Cheap Deals Outlet' : store], sourceId, retailerSku: `${d.slug}-${i}`,
          price, listPrice: listPrice ?? null, url: `https://${(d.flags?.merchant === 'shady' ? 'cheap-deals-outlet' : store.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}.test/p/${d.slug}`,
          inStock: !d.flags?.outOfStock, lastCheckedAt: checked, staleAfter: new Date(checked.getTime() + 24 * 3600_000),
        },
      });
    }
    // A short price history so comparisons have something to say.
    await prisma.priceHistory.createMany({
      data: [10, 5, 0].map((daysAgo, i) => ({ dealId: deal.id, price: Math.round(best * (1 + (2 - i) * 0.06) * 100) / 100, recordedAt: new Date(now.getTime() - daysAgo * 864e5 - 3600_000), sourceId: source.ok })),
    });
  }
}
