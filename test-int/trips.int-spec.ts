import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ClicksController } from '../src/clicks/clicks.controller';
import { DealsService } from '../src/deals/deals.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchService } from '../src/search/search.service';
import { BookingLinksService } from '../src/trips/booking-links.service';
import { TripsService } from '../src/trips/trips.service';
import { seedCatalog } from './eval/catalog';
import { NEVER_IN_TRIPS, seedTripCatalog, STAY } from './eval/trip-catalog';

const prisma = new PrismaService();
const search = new SearchService(prisma, new DealsService(prisma));
const trips = new TripsService(prisma, search, new BookingLinksService(prisma));
const clicks = new ClicksController(prisma);
const NOW = new Date();
const FULL = () => ({ destination: 'Miami', ...STAY(NOW), adults: 2, originAirport: 'JFK', budgetUsd: 1500, includeFlight: true, includeCar: true });

async function go(goUrl: string) {
  const u = new URL(`http://api.test${goUrl}`);
  const offerId = u.pathname.split('/').pop()!;
  const res = { redirect: jest.fn() } as unknown as Response & { redirect: jest.Mock };
  await clicks.go(offerId, u.searchParams.get('src') ?? undefined, u.searchParams.get('rec') ?? undefined, res, u.searchParams.get('trip') ?? undefined, u.searchParams.get('item') ?? undefined);
  return res.redirect.mock.calls[0][1] as string;
}

describe('trip plans (real database)', () => {
  beforeAll(async () => {
    await seedCatalog(prisma, NOW);
    await seedTripCatalog(prisma, NOW);
  });
  afterAll(() => prisma.$disconnect());

  it('builds a READY plan: flight, hotel, car from verified stores, totals computed from the stored prices', async () => {
    const t = await trips.create(FULL(), { now: NOW });
    expect(t.status).toBe('READY');
    expect(t.id).toMatch(/^[a-f0-9]{32}$/);
    const picks = t.items.filter((i) => i.selected);
    expect(picks.map((i) => i.kind)).toEqual(['FLIGHT', 'HOTEL', 'CAR']);
    for (const i of t.items) {
      for (const s of i.stores) {
        const offer = await prisma.offer.findUniqueOrThrow({ where: { id: s.offerId }, include: { deal: true } });
        expect(Number(offer.price)).toBe(s.unitPrice); // never an invented price
        expect(offer.deal.slug).toBe(i.dealSlug);
      }
      if (i.selected) expect(i.totalPrice).toBe(Math.round(i.unitPrice! * 100 * i.quantity) / 100);
    }
    expect(t.totals.total).toBe(picks.reduce((s, i) => s + i.totalPrice! * 100, 0) / 100);
    expect(t.items.map((i) => i.dealSlug).filter((s) => NEVER_IN_TRIPS.includes(s))).toEqual([]);
    expect(t.booking).toEqual([]); // no booking buttons before approval
  });

  it('refuses invalid or incomplete requests before storing anything', async () => {
    const before = await prisma.tripPlan.count();
    await expect(trips.create({ destination: 'Miami' }, { now: NOW })).rejects.toBeInstanceOf(BadRequestException);
    await expect(trips.create({ ...FULL(), adults: 0 }, { now: NOW })).rejects.toThrow(/adults/);
    expect(await prisma.tripPlan.count()).toBe(before);
  });

  it('switching store or alternative updates totals and the version; stale versions and foreign offers are refused', async () => {
    const t = await trips.create({ destination: 'Miami', ...STAY(NOW), adults: 2 }, { now: NOW });
    const hotel = t.items.find((i) => i.selected)!;
    const alt = t.items.find((i) => !i.selected)!;
    const next = await trips.select(t.id, alt.id, { offerId: alt.stores[0].offerId, version: t.version }, NOW);
    expect(next.version).toBe(t.version + 1);
    expect(next.items.find((i) => i.selected)!.id).toBe(alt.id);
    expect(next.totals.total).toBe(Math.round(alt.stores[0].unitPrice * 100 * 7) / 100);
    await expect(trips.select(t.id, hotel.id, { offerId: hotel.stores[0].offerId, version: t.version }, NOW)).rejects.toBeInstanceOf(ConflictException);
    await expect(trips.select(t.id, hotel.id, { offerId: alt.stores[0].offerId, version: next.version }, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approval re-checks prices: a changed price updates the plan and does NOT approve it', async () => {
    const t = await trips.create(FULL(), { now: NOW });
    const hotel = t.items.find((i) => i.selected && i.kind === 'HOTEL')!;
    await prisma.offer.update({ where: { id: hotel.chosenOfferId! }, data: { price: hotel.unitPrice! + 10 } });
    try {
      await expect(trips.approve(t.id, { version: t.version }, NOW)).rejects.toBeInstanceOf(ConflictException);
      const after = await trips.get(t.id, NOW);
      expect(after.status).toBe('READY');
      expect(after.version).toBe(t.version + 1);
      expect(after.items.find((i) => i.id === hotel.id)!.unitPrice).toBe(hotel.unitPrice! + 10);
      expect(after.totals.total).toBe(Math.round((t.totals.total + 70) * 100) / 100);
      // reviewed again with the new price: now it approves
      const ok = await trips.approve(t.id, { version: after.version }, NOW);
      expect(ok.status).toBe('APPROVED');
    } finally {
      await prisma.offer.update({ where: { id: hotel.chosenOfferId! }, data: { price: hotel.unitPrice! } });
    }
  });

  it('approval re-checks the trust gate: a store that is no longer trusted makes the item unavailable', async () => {
    const t = await trips.create({ destination: 'Miami', ...STAY(NOW), adults: 2, includeHotel: false, includeCar: true }, { now: NOW });
    const car = t.items.find((i) => i.selected)!;
    const offer = await prisma.offer.findUniqueOrThrow({ where: { id: car.chosenOfferId! } });
    await prisma.merchant.update({ where: { id: offer.merchantId }, data: { trustScore: 50 } });
    try {
      await expect(trips.approve(t.id, { version: t.version }, NOW)).rejects.toMatchObject({ response: { changes: [expect.objectContaining({ now: null })] } });
      const after = await trips.get(t.id, NOW);
      expect(after.items.find((i) => i.id === car.id)!.available).toBe(false);
      expect(after.totals.missingKinds).toEqual(['CAR']);
    } finally {
      await prisma.merchant.update({ where: { id: offer.merchantId }, data: { trustScore: 90 } });
    }
  });

  it('approval only unlocks booking buttons: flight, then hotel, then car, each through /go', async () => {
    const t = await trips.create(FULL(), { now: NOW });
    const a = await trips.approve(t.id, { version: t.version }, NOW);
    expect(a.status).toBe('APPROVED');
    expect(a.booking.map((b) => b.kind)).toEqual(['FLIGHT', 'HOTEL', 'CAR']);
    for (const b of a.booking) {
      expect(b.goUrl).toMatch(new RegExp(`^/api/go/[a-z0-9]+\\?src=web-trip&rec=${t.id}&trip=${t.id}&item=${b.itemId}$`));
      expect(b.prefilled).toBe(false);
    }
    expect(a.booking.find((b) => b.kind === 'HOTEL')!.details).toBe(`Check in ${STAY(NOW).startDate}, check out ${STAY(NOW).endDate}, 2 adults, 1 room`);
    await expect(trips.select(t.id, a.items[0].id, { offerId: a.items[0].stores[0].offerId, version: a.version }, NOW)).rejects.toBeInstanceOf(ConflictException);
  });

  it('/go: no documented format means the plain item page, never guessed parameters', async () => {
    const t = await trips.create(FULL(), { now: NOW });
    const a = await trips.approve(t.id, { version: t.version }, NOW);
    for (const b of a.booking) {
      const dest = await go(b.goUrl);
      const offer = await prisma.offer.findUniqueOrThrow({ where: { id: b.goUrl.split('/').pop()!.split('?')[0] } });
      expect(dest).toBe(offer.url);
    }
    const click = await prisma.click.findFirstOrThrow({ where: { recommendationId: t.id }, orderBy: { createdAt: 'desc' } });
    expect(click).toMatchObject({ source: 'web-trip', outcome: 'PLAIN' });
  });

  it('/go: a documented format on the program fills dates and guests from the stored plan, only for the approved offer', async () => {
    const expedia = await prisma.merchant.findFirstOrThrow({ where: { name: 'Expedia' } });
    const program = await prisma.affiliateProgram.create({
      data: {
        merchantId: expedia.id, network: 'direct', name: 'Expedia (test)', status: 'APPLIED',
        bookingLinkTemplate: `https://www.${expedia.domain}/search?in={checkIn}&out={checkOut}&adults={adults}&from={origin}`, bookingLinkDocUrl: 'https://partners.example/docs',
      },
    });
    try {
      const t = await trips.create(FULL(), { now: NOW });
      const ready = await trips.get(t.id, NOW);
      const flight = ready.items.find((i) => i.selected && i.kind === 'FLIGHT')!;
      expect(flight.stores.find((s) => s.offerId === flight.chosenOfferId)!.store).toBe('Expedia');
      // before approval: plain page
      const early = `/api/go/${flight.chosenOfferId}?src=web-trip&trip=${t.id}&item=${flight.id}`;
      expect(await go(early)).toBe((await prisma.offer.findUniqueOrThrow({ where: { id: flight.chosenOfferId! } })).url);

      const a = await trips.approve(t.id, { version: t.version }, NOW);
      const b = a.booking.find((x) => x.kind === 'FLIGHT')!;
      expect(b.prefilled).toBe(true);
      expect(await go(b.goUrl)).toBe(`https://www.${expedia.domain}/search?in=${STAY(NOW).startDate}&out=${STAY(NOW).endDate}&adults=2&from=JFK`);
      // a different offer with this trip's ids gets no pre-fill
      const other = flight.stores.find((s) => s.offerId !== flight.chosenOfferId)!;
      expect(await go(`/api/go/${other.offerId}?trip=${t.id}&item=${flight.id}`)).toBe((await prisma.offer.findUniqueOrThrow({ where: { id: other.offerId } })).url);
    } finally {
      await prisma.affiliateProgram.delete({ where: { id: program.id } });
    }
  });

  it('optional self-report stores only yes or no, and only on an approved plan', async () => {
    const t = await trips.create({ destination: 'Miami', ...STAY(NOW), adults: 1 }, { now: NOW });
    const item = t.items.find((i) => i.selected)!;
    await expect(trips.report(t.id, item.id, { booked: true }, NOW)).rejects.toBeInstanceOf(ConflictException);
    await trips.approve(t.id, { version: t.version }, NOW);
    await expect(trips.report(t.id, item.id, { booked: 'yes, booking #123' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    const r = await trips.report(t.id, item.id, { booked: true }, NOW);
    expect(r.items.find((i) => i.id === item.id)!.selfReport).toBe('yes');
  });

  it('cancel, unknown ids, and expiry after 7 days', async () => {
    const t = await trips.create({ destination: 'Miami', ...STAY(NOW), adults: 2 }, { now: NOW });
    expect((await trips.cancel(t.id, NOW)).status).toBe('CANCELLED');
    await expect(trips.approve(t.id, { version: 1 }, NOW)).rejects.toBeInstanceOf(ConflictException);
    await expect(trips.get('nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(trips.get('0'.repeat(32))).rejects.toBeInstanceOf(NotFoundException);

    const e = await trips.create({ destination: 'Miami', ...STAY(NOW), adults: 2 }, { now: NOW });
    expect(e.expiresAt.getTime() - NOW.getTime()).toBe(7 * 864e5);
    const later = new Date(NOW.getTime() + 7 * 864e5 + 1000);
    expect((await trips.get(e.id, later)).status).toBe('EXPIRED');
    await expect(trips.approve(e.id, { version: e.version }, later)).rejects.toThrow(/expired/);
    await trips.purgeExpired(later);
    expect((await prisma.tripPlan.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('EXPIRED');
    await trips.purgeExpired(new Date(later.getTime() + 7 * 864e5 + 1000));
    expect(await prisma.tripPlan.findUnique({ where: { id: e.id } })).toBeNull();
  });

  it('stores no personal data: only trip details and options', async () => {
    const t = await trips.create(FULL(), { now: NOW });
    const row = await prisma.tripPlan.findUniqueOrThrow({ where: { id: t.id } });
    expect(Object.keys(row).sort()).toEqual(['adults', 'approvedAt', 'budgetUsd', 'children', 'createdAt', 'destination', 'endDate', 'expiresAt', 'hotelName', 'id', 'notes', 'originAirport', 'startDate', 'status', 'updatedAt', 'version', 'wants']);
  });
});
