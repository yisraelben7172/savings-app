import type { PrismaClient } from '@prisma/client';

/**
 * SYNTHETIC travel catalog for the trip planner tests and evaluation, added on top of the shopping catalog (seedCatalog).
 * Hotel names are fictional; every price is invented. Each offer's date window says which stays its price applies to.
 */
type O = [store: string, price: number, cancellation?: string];
type TD = {
  slug: string;
  cat: 'hotels' | 'flights' | 'car-rentals';
  title: string;
  unit: string;
  offers: O[];
  flags?: { staleHours?: number; source?: 'noai'; merchant?: 'shady'; shortWindow?: boolean };
};

export const TRAVEL: TD[] = [
  { slug: 'seabreeze-grand', cat: 'hotels', title: 'Seabreeze Grand Hotel, Miami Beach', unit: 'per night', offers: [['Expedia', 210, 'Free cancellation until 3 days before check-in'], ['Booking.com', 205]] },
  { slug: 'coral-inn', cat: 'hotels', title: 'Coral Inn, Miami Beach', unit: 'per night', offers: [['Booking.com', 95.5], ['Expedia', 99.99]] },
  { slug: 'palm-court', cat: 'hotels', title: 'Palm Court Hotel, Miami', unit: 'per night', offers: [['Expedia', 150]] },
  { slug: 'bayfront-hotel', cat: 'hotels', title: 'Bayfront Hotel, Miami', unit: 'per night', offers: [['Booking.com', 120]] },
  { slug: 'noai-miami-hotel', cat: 'hotels', title: 'Harbor Lights Hotel, Miami', unit: 'per night', offers: [['Expedia', 70]], flags: { source: 'noai' } },
  { slug: 'lisbon-riverside', cat: 'hotels', title: 'Riverside Hotel, Lisbon', unit: 'per night', offers: [['Booking.com', 120]] },
  { slug: 'jfk-mia', cat: 'flights', title: 'Round trip JFK to Miami (MIA), economy', unit: 'per traveler', offers: [['Expedia', 240], ['Booking.com', 250]] },
  { slug: 'bos-mia', cat: 'flights', title: 'Round trip BOS to Miami (MIA), economy', unit: 'per traveler', offers: [['Expedia', 260]] },
  { slug: 'mia-compact', cat: 'car-rentals', title: 'Compact car, Miami airport pickup', unit: 'per day', offers: [['Booking.com', 30, 'Free cancellation'], ['Expedia', 33]] },
  { slug: 'mia-suv', cat: 'car-rentals', title: 'SUV, Miami airport pickup', unit: 'per day', offers: [['Expedia', 55]] },
  // traps: never in any trip plan
  { slug: 'stale-miami-hotel', cat: 'hotels', title: 'Old price hotel, Miami', unit: 'per night', offers: [['Expedia', 60]], flags: { staleHours: 48 } },
  { slug: 'shady-miami-hotel', cat: 'hotels', title: 'Too cheap hotel, Miami', unit: 'per night', offers: [['Expedia', 40]], flags: { merchant: 'shady' } },
  { slug: 'short-window-miami', cat: 'hotels', title: 'Short stay hotel, Miami', unit: 'per night', offers: [['Booking.com', 65]], flags: { shortWindow: true } },
];

/** Never in a trip plan: stale, untrusted store, price window not covering the stay, or undated (no stated dates at all). */
export const NEVER_IN_TRIPS = ['stale-miami-hotel', 'shady-miami-hotel', 'short-window-miami', 'miami-hotel', 'lisbon-hotel', 'suv-rental', 'compact-rental'];
export const NEVER_FOR_AI = ['noai-miami-hotel'];

const DAY = 864e5;
export const tripDay = (now: Date, days: number) => new Date(now.getTime() + days * DAY).toISOString().slice(0, 10);
/** The standard test stay: 30 to 37 days from now (7 nights). */
export const STAY = (now: Date) => ({ startDate: tripDay(now, 30), endDate: tripDay(now, 37) });

export async function seedTripCatalog(prisma: PrismaClient, now: Date = new Date()) {
  await prisma.tripPlan.deleteMany({});
  const flights = await prisma.category.upsert({ where: { slug: 'flights' }, update: {}, create: { slug: 'flights', name: 'Flights', color: 'lilac' } });
  const cats: Record<string, string> = { flights: flights.id };
  for (const slug of ['hotels', 'car-rentals']) cats[slug] = (await prisma.category.findUniqueOrThrow({ where: { slug } })).id;
  const merchant = async (name: string) => prisma.merchant.findFirstOrThrow({ where: { name } });
  const source = {
    ok: (await prisma.dataSource.findFirstOrThrow({ where: { name: 'eval feed' } })).id,
    noai: (await prisma.dataSource.findFirstOrThrow({ where: { name: 'eval feed (no AI)' } })).id,
  };
  const windowStart = new Date(now.getTime() - DAY);
  for (const d of TRAVEL) {
    const best = Math.min(...d.offers.map((o) => o[1]));
    const deal = await prisma.deal.create({ data: { slug: d.slug, title: d.title, categoryId: cats[d.cat], priceUnit: d.unit, originalPrice: best, bestPrice: best, discountPct: 0 } });
    for (const [i, [store, price, cancellationText]] of d.offers.entries()) {
      const m = await merchant(d.flags?.merchant === 'shady' ? 'Cheap Deals Outlet' : store);
      const checked = new Date(now.getTime() - (d.flags?.staleHours ?? 1 + i) * 3600_000);
      await prisma.offer.create({
        data: {
          dealId: deal.id, merchantId: m.id, sourceId: d.flags?.source === 'noai' ? source.noai : source.ok, retailerSku: `${d.slug}-${i}`, price,
          url: `https://${m.domain}/travel/${d.slug}`, lastCheckedAt: checked, staleAfter: new Date(checked.getTime() + 24 * 3600_000),
          startDate: windowStart, endDate: new Date(now.getTime() + (d.flags?.shortWindow ? 33 : 200) * DAY), cancellationText: cancellationText ?? null,
        },
      });
    }
  }
}
