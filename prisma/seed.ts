// DEMO DATA for development only. Prices are examples, not live store prices.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const days = (n: number) => new Date(Date.now() + n * 864e5);
const q = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');

const categories = [
  ['electronics', 'Electronics', 'sky'],
  ['clothing', 'Clothing', 'mint'],
  ['beauty', 'Beauty', 'blush'],
  ['hotels', 'Hotels', 'peach'],
  ['car-rentals', 'Car rentals', 'teal'],
  ['concerts', 'Concerts', 'rose'],
  ['home', 'Home', 'butter'],
  ['flights', 'Flights', 'lilac'],
] as const;

// slug, name, domain, network, trustScore, approved, rating, color, search URL builder
const merchants: [string, string, string, string, number, boolean, number, string, (s: string) => string][] = [
  ['amazon', 'Amazon', 'amazon.com', 'amazon', 95, true, 4.6, 'butter', (s) => `https://www.amazon.com/s?k=${q(s)}`],
  ['best-buy', 'Best Buy', 'bestbuy.com', 'impact', 92, true, 4.6, 'sky', (s) => `https://www.bestbuy.com/site/searchpage.jsp?st=${q(s)}`],
  ['walmart', 'Walmart', 'walmart.com', 'impact', 90, true, 4.5, 'sky', (s) => `https://www.walmart.com/search?q=${q(s)}`],
  ['target', 'Target', 'target.com', 'impact', 91, true, 4.6, 'rose', (s) => `https://www.target.com/s?searchTerm=${q(s)}`],
  ['ulta', 'Ulta Beauty', 'ulta.com', 'impact', 90, true, 4.8, 'peach', (s) => `https://www.ulta.com/search?search=${q(s)}`],
  ['sephora', 'Sephora', 'sephora.com', 'rakuten', 90, true, 4.7, 'lilac', (s) => `https://www.sephora.com/search?keyword=${q(s)}`],
  ['seatgeek', 'SeatGeek', 'seatgeek.com', 'impact', 86, true, 4.6, 'mint', (s) => `https://seatgeek.com/search?search=${q(s)}`],
  ['ticketmaster', 'Ticketmaster', 'ticketmaster.com', 'impact', 88, true, 4.5, 'sky', (s) => `https://www.ticketmaster.com/search?q=${q(s)}`],
  ['nordstrom-rack', 'Nordstrom Rack', 'nordstromrack.com', 'rakuten', 87, true, 4.5, 'sky', (s) => `https://www.nordstromrack.com/sr?keyword=${q(s)}`],
  ['macys', "Macy's", 'macys.com', 'impact', 86, true, 4.4, 'rose', (s) => `https://www.macys.com/shop/search?keyword=${q(s)}`],
  ['expedia', 'Expedia', 'expedia.com', 'expedia', 92, true, 4.5, 'butter', () => 'https://www.expedia.com/'],
  ['booking', 'Booking.com', 'booking.com', 'booking', 92, true, 4.4, 'sky', () => 'https://www.booking.com/'],
  ['zappos', 'Zappos', 'zappos.com', 'cj', 89, true, 4.8, 'sky', (s) => `https://www.zappos.com/search?term=${q(s)}`],
  // Demo of the trust gate: not approved, low score -> never shown anywhere
  ['cheap-deals-outlet', 'Cheap Deals Outlet', 'cheapdeals-outlet.example', 'none', 22, false, 2.1, 'rose', () => 'https://cheapdeals-outlet.example/'],
];

// slug, title, category, original, unit, hot, goldEarlyHours, offers: [merchantSlug, price, delivery, speedRank]
const deals: [string, string, string, number, string | null, boolean, number, [string, number, string, number][]][] = [
  ['noise-cancelling-headphones', 'Noise-cancelling headphones, 30-hour battery', 'electronics', 349, null, false, 24,
    [['amazon', 198, 'Free delivery in 2 days', 1], ['best-buy', 199, 'Pick up today', 0], ['walmart', 204, 'Free delivery in 3 days', 2], ['target', 209, 'Free delivery in 4 days', 3], ['cheap-deals-outlet', 89, 'Ships in 3 weeks', 9]]],
  ['vitamin-c-serum', 'Vitamin C brightening serum, 30 ml', 'beauty', 35, null, false, 0,
    [['ulta', 21, 'Free pickup today', 0], ['sephora', 23, 'Free shipping, 2 days', 1], ['amazon', 24, 'Free delivery in 2 days', 2]]],
  ['ceramide-moisturizer', 'Ceramide moisturizing cream, 16 oz', 'beauty', 22, null, false, 0,
    [['target', 14, 'Pick up today', 0], ['ulta', 15, 'Free shipping over $35', 2], ['amazon', 16, 'Free delivery in 2 days', 1]]],
  ['arena-floor-seats', 'Floor seats, arena show, Saturday night', 'concerts', 145, null, false, 0,
    [['seatgeek', 89, 'Fees included, mobile tickets', 0], ['ticketmaster', 95, 'Fees included, mobile tickets', 0]]],
  ['merino-overshirt', 'Merino wool overshirt, all sizes', 'clothing', 128, null, true, 0,
    [['nordstrom-rack', 64, 'Free shipping over $89', 2], ['macys', 69, 'Free pickup today', 0], ['amazon', 72, 'Free delivery in 3 days', 1]]],
  ['mens-road-running-shoes', "Men's road running shoes, cushioned", 'clothing', 112, null, false, 0,
    [['amazon', 58, 'Free delivery in 2 days', 1], ['zappos', 64, 'Free 2-day shipping', 2]]],
  ['midsize-suv-rental', 'Midsize SUV rental, unlimited miles, free cancellation', 'car-rentals', 62, 'per day', false, 0,
    [['expedia', 39, 'Airport pickup', 0], ['booking', 41, 'Airport pickup', 0]]],
  ['lisbon-boutique-hotel', 'Boutique hotel in Lisbon, 3 nights', 'hotels', 540, null, false, 0,
    [['booking', 312, 'Free cancellation', 0], ['expedia', 328, 'Pay at the hotel', 0]]],
  ['cast-iron-dutch-oven', 'Cast-iron dutch oven, 6 quart', 'home', 79, null, false, 0,
    [['target', 47, 'Pick up today', 0], ['walmart', 49, 'Free delivery in 2 days', 1], ['amazon', 52, 'Free delivery in 2 days', 1]]],
];

// Trip planner samples (made up, shown under the "samples" notice). Generic names on purpose: no real hotel's name
// is paired with an invented price. Each price applies to stays/rentals/trips inside the offer's date window.
// slug, title, category, unit, offers: [merchantSlug, price, cancellation terms (null = the sample source states none)]
const travel: [string, string, string, string, [string, number, string | null][]][] = [
  ['miami-oceanfront-resort', 'Oceanfront resort hotel, Miami Beach', 'hotels', 'per night',
    [['expedia', 189, 'Free cancellation until 3 days before check-in (sample terms)'], ['booking', 194, null]]],
  ['miami-south-beach-boutique', 'Boutique hotel, South Beach, Miami', 'hotels', 'per night',
    [['booking', 142, 'Free cancellation until 24 hours before check-in (sample terms)'], ['expedia', 149, null]]],
  ['miami-downtown-bayfront', 'Bayfront hotel, Downtown Miami', 'hotels', 'per night',
    [['expedia', 118, null], ['booking', 121, 'Non-refundable (sample terms)']]],
  ['flight-jfk-mia', 'Round trip, New York (JFK) to Miami (MIA), economy', 'flights', 'per traveler',
    [['expedia', 238, null], ['booking', 246, null]]],
  ['flight-ewr-mia', 'Round trip, Newark (EWR) to Miami (MIA), economy', 'flights', 'per traveler',
    [['booking', 221, null], ['expedia', 229, null]]],
  ['miami-airport-compact-car', 'Compact car rental, Miami airport (MIA) pickup', 'car-rentals', 'per day',
    [['expedia', 34, 'Free cancellation (sample terms)'], ['booking', 37, null]]],
  ['miami-airport-midsize-suv', 'Midsize SUV rental, Miami airport (MIA) pickup', 'car-rentals', 'per day',
    [['booking', 52, null], ['expedia', 55, null]]],
];

const DEMO_SOURCE = 'src_demo_seed';

async function main() {
  // Every demo offer is tagged with this source so it can be told apart from real data (and removed later).
  await prisma.dataSource.upsert({
    where: { id: DEMO_SOURCE },
    update: {},
    create: {
      id: DEMO_SOURCE, name: 'Demo catalog (sample data)', kind: 'DEMO', status: 'ACTIVE', accessMethod: 'prisma/seed.ts',
      permissionNotes: 'Our own made-up sample data for development. Not real store prices.', aiUseAllowed: true,
      fullSnapshot: false, approvedAt: new Date(), approvedBy: 'system',
    },
  });
  for (const [i, [slug, name, color]] of categories.entries()) {
    await prisma.category.upsert({ where: { slug }, update: { name, color, sortOrder: i }, create: { slug, name, color, sortOrder: i } });
  }
  const urlFor: Record<string, (s: string) => string> = {};
  for (const [slug, name, domain, network, trustScore, approved, rating, color, url] of merchants) {
    urlFor[slug] = url;
    await prisma.merchant.upsert({
      where: { slug },
      update: { name, domain, network, trustScore, approved, rating, color },
      create: { slug, name, domain, network, trustScore, approved, rating, color },
    });
  }
  for (const [slug, title, cat, original, unit, hot, goldHours, offers] of deals) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: cat } });
    const trusted = offers.filter(([m]) => m !== 'cheap-deals-outlet');
    const best = Math.min(...trusted.map((o) => o[1]));
    const deal = await prisma.deal.upsert({
      where: { slug },
      update: {},
      create: {
        slug, title, categoryId: category.id, originalPrice: original, bestPrice: best, priceUnit: unit,
        discountPct: Math.round((1 - best / original) * 100), isHot: hot,
        goldEarlyUntil: goldHours ? new Date(Date.now() + goldHours * 36e5) : null,
        expiresAt: days(7),
      },
    });
    for (const [m, price, deliveryNote, speedRank] of offers) {
      const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: m } });
      await prisma.offer.upsert({
        where: { dealId_merchantId: { dealId: deal.id, merchantId: merchant.id } },
        update: { price, deliveryNote, speedRank, sourceId: DEMO_SOURCE },
        create: { dealId: deal.id, merchantId: merchant.id, price, deliveryNote, speedRank, url: urlFor[m](title), sourceId: DEMO_SOURCE },
      });
    }
    // 90 days of fake price history, ending at today's best price
    const count = await prisma.priceHistory.count({ where: { dealId: deal.id } });
    if (!count) {
      const pts = Array.from({ length: 12 }, (_, k) => {
        const t = k / 11;
        const price = Math.round((original * (0.95 - 0.1 * Math.sin(k)) * (1 - t) + best * t) * 100) / 100;
        return { dealId: deal.id, price, sourceId: DEMO_SOURCE, recordedAt: new Date(Date.now() - (90 - k * 8) * 864e5) };
      });
      await prisma.priceHistory.createMany({ data: pts });
    }
  }
  // Trip planner samples: the date window starts today and runs a year, refreshed on every seed.
  const windowStart = new Date(new Date().toISOString().slice(0, 10));
  const windowEnd = new Date(windowStart.getTime() + 365 * 864e5);
  for (const [slug, title, cat, unit, offers] of travel) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: cat } });
    const best = Math.min(...offers.map((o) => o[1]));
    const deal = await prisma.deal.upsert({
      where: { slug },
      update: { expiresAt: null },
      create: { slug, title, categoryId: category.id, originalPrice: best, bestPrice: best, priceUnit: unit, discountPct: 0 },
    });
    for (const [m, price, cancellationText] of offers) {
      const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: m } });
      const dates = { startDate: windowStart, endDate: windowEnd, cancellationText, lastCheckedAt: new Date() };
      await prisma.offer.upsert({
        where: { dealId_merchantId: { dealId: deal.id, merchantId: merchant.id } },
        update: { price, sourceId: DEMO_SOURCE, ...dates },
        create: { dealId: deal.id, merchantId: merchant.id, price, url: urlFor[m](title), sourceId: DEMO_SOURCE, ...dates },
      });
    }
  }
  // Lets the website show a "sample prices" notice while this demo catalog is live.
  await prisma.setting.upsert({ where: { key: 'catalog:demo' }, update: { value: 'true' }, create: { key: 'catalog:demo', value: 'true' } });
  console.log('Demo deals loaded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
