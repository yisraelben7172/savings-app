import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, type TripItem, type TripPlan } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { offerFilterFor, SearchService, type SearchResult } from '../search/search.service';
import { queryTerms } from '../search/shopping-request';
import { dayString, nightsBetween, parseDay, parseTripInput, TRIP_KINDS, type TripInput, type TripKind } from './trip-input';
import { BookingLinksService, type BookingButton } from './booking-links.service';
import { applyRecheck, buildTrip, selectOffer, suggestSwap, tripTotals, type ItemView, type StoreOption, type TripCandidate } from './trip-planner';

export const TRIP_TTL_DAYS = 7;
export const TRIP_TIMEOUT_MS = 15_000; // at most 4 searches
export const TRIP_ID = /^[a-f0-9]{32}$/;
const ITEM_ID = /^[a-z0-9]{8,40}$/i;
const SEARCH_LIMIT = 8;
const CATEGORY: Record<TripKind, 'hotels' | 'flights' | 'car-rentals'> = { HOTEL: 'hotels', FLIGHT: 'flights', CAR: 'car-rentals' };

type PlanWithItems = TripPlan & { items: TripItem[] };
export type CreateOptions = { aiOnly?: boolean; now?: Date };

const toCandidates = (kind: TripKind, results: SearchResult[]): TripCandidate[] =>
  results.map((r) => ({
    kind,
    dealSlug: r.ranked.candidate.slug,
    title: r.ranked.candidate.title,
    stores: r.offers.map((o) => ({ offerId: o.id, store: o.store, storeSlug: o.storeSlug, unitPrice: o.price, cancellationText: o.cancellationText, priceCheckedAt: o.lastCheckedAt.toISOString() })),
  }));

const toView = (i: TripItem): ItemView => ({
  id: i.id,
  kind: i.kind,
  dealSlug: i.dealSlug,
  title: i.title,
  namedMatch: i.namedMatch,
  selected: i.selected,
  available: i.available,
  unitLabel: i.unitLabel as ItemView['unitLabel'],
  quantity: i.quantity,
  chosenOfferId: i.chosenOfferId,
  stores: i.storeOptions as unknown as StoreOption[],
});

/** The columns that follow from an item's chosen store (computed in code, never by the model). */
function chosenColumns(v: ItemView) {
  const s = v.stores.find((o) => o.offerId === v.chosenOfferId);
  return {
    selected: v.selected,
    available: v.available,
    chosenOfferId: v.chosenOfferId,
    storeOptions: v.stores as unknown as Prisma.InputJsonValue,
    offerIds: v.stores.map((o) => o.offerId),
    unitPrice: s ? new Prisma.Decimal(s.unitPrice) : null,
    totalPrice: s ? new Prisma.Decimal((Math.round(s.unitPrice * 100) * v.quantity) / 100) : null,
    cancellationText: s?.cancellationText ?? null,
    priceCheckedAt: s ? new Date(s.priceCheckedAt) : null,
  };
}

@Injectable()
export class TripsService {
  private readonly log = new Logger(TripsService.name);
  constructor(private readonly prisma: PrismaService, private readonly search: SearchService, private readonly links: BookingLinksService) {}

  /** Validates the request, searches each part (trust gate + date window), and stores a READY plan. */
  async create(raw: unknown, opts: CreateOptions = {}) {
    const now = opts.now ?? new Date();
    const parsed = parseTripInput(raw, now);
    if (!parsed.ok) throw new BadRequestException({ message: parsed.errors.join(' '), missing: parsed.missing });
    const input = parsed.value;
    const id = randomBytes(16).toString('hex');
    await this.prisma.tripPlan.create({
      data: {
        id, status: 'DRAFT', destination: input.destination, startDate: parseDay(input.startDate)!, endDate: parseDay(input.endDate)!,
        adults: input.adults, children: input.children, originAirport: input.originAirport ?? null, budgetUsd: input.budgetUsd ?? null,
        hotelName: input.hotelName ?? null, wants: input.wants, expiresAt: new Date(now.getTime() + TRIP_TTL_DAYS * 864e5),
      },
    });
    try {
      const found = await this.findAll(input, opts, now);
      const { items, notes } = buildTrip(input, found);
      await this.prisma.$transaction([
        this.prisma.tripItem.createMany({
          data: items.map((v, position) => ({
            planId: id, kind: v.kind, dealSlug: v.dealSlug, title: v.title, namedMatch: v.namedMatch, unitLabel: v.unitLabel, quantity: v.quantity, position,
            ...chosenColumns(v),
          })),
        }),
        this.prisma.tripPlan.update({ where: { id }, data: { status: 'READY', notes } }),
      ]);
    } catch (e) {
      await this.prisma.tripPlan.delete({ where: { id } }).catch(() => undefined);
      this.log.warn(`Trip plan failed: ${(e as Error).name}`);
      throw new ServiceUnavailableException('We could not build this trip plan just now. Please try again.');
    }
    return this.get(id, now);
  }

  /** One search per part of the trip, with the same ranking as shopping search (which never sees commercial data). */
  private async findAll(input: TripInput, opts: CreateOptions, now: Date) {
    const started = Date.now();
    const travel = { start: parseDay(input.startDate)!, end: parseDay(input.endDate)! };
    const run = async (kind: TripKind, query: string) => {
      if (Date.now() - started > TRIP_TIMEOUT_MS) throw new Error('timeout');
      return this.search.search(
        { query, category: CATEGORY[kind], requiredFeatures: [], excludedTerms: [], brands: [], preferredRetailers: [], sort: 'best_match', limit: SEARCH_LIMIT },
        { aiOnly: opts.aiOnly, now, travel },
      );
    };
    // Flights and cars are booked by city: "Miami Beach" may fall back to its main word ("Miami"). Hotels never do.
    const cityWords = queryTerms(input.destination).map((t) => t.word).sort((a, b) => b.length - a.length);
    const withFallback = async (kind: TripKind, prefix: string) => {
      const first = await run(kind, `${prefix}${input.destination}`);
      return first.length || cityWords.length < 2 ? first : run(kind, `${prefix}${cityWords[0]}`);
    };

    const found: Partial<Record<TripKind, TripCandidate[]>> = {};
    for (const kind of TRIP_KINDS) {
      if (!input.wants.includes(kind)) continue;
      if (kind === 'HOTEL') {
        const inCity = await run('HOTEL', input.destination);
        let named: SearchResult[] = [];
        if (input.hotelName) {
          // The named hotel may rank below the first few in the city; look it up by name too, and keep it only if it is in the city.
          const cityTerms = queryTerms(input.destination);
          named = (await run('HOTEL', input.hotelName)).filter((r) => cityTerms.every((t) => new RegExp(`(^|[^a-z0-9])${t.word}`, 'i').test(r.ranked.candidate.title)));
        }
        const seen = new Set<string>();
        found.HOTEL = toCandidates('HOTEL', [...inCity, ...named].filter((r) => !seen.has(r.ranked.candidate.slug) && seen.add(r.ranked.candidate.slug)));
      } else if (kind === 'FLIGHT') found.FLIGHT = toCandidates('FLIGHT', await withFallback('FLIGHT', `${input.originAirport} `));
      else found.CAR = toCandidates('CAR', await withFallback('CAR', ''));
    }
    return found;
  }

  private async load(id: string): Promise<PlanWithItems> {
    if (!TRIP_ID.test(id)) throw new NotFoundException('Trip plan not found.');
    const plan = await this.prisma.tripPlan.findUnique({ where: { id }, include: { items: { orderBy: { position: 'asc' } } } });
    if (!plan || plan.status === 'DRAFT') throw new NotFoundException('Trip plan not found.');
    return plan;
  }

  private status(plan: TripPlan, now: Date) {
    return plan.expiresAt <= now && plan.status !== 'CANCELLED' ? 'EXPIRED' : plan.status;
  }

  async get(id: string, now = new Date()) {
    const plan = await this.load(id);
    const status = this.status(plan, now);
    const items = plan.items.map(toView);
    const budget = plan.budgetUsd == null ? null : Number(plan.budgetUsd);
    const totals = tripTotals(items, budget, plan.wants as TripKind[]);
    const startDate = dayString(plan.startDate);
    const endDate = dayString(plan.endDate);
    let booking: BookingButton[] = [];
    if (status === 'APPROVED') {
      booking = await this.links.buttons(plan.id, plan.items.filter((i) => i.selected && i.available && i.chosenOfferId), {
        checkIn: startDate, checkOut: endDate, adults: plan.adults, children: plan.children, origin: plan.originAirport, destination: plan.destination,
      });
    }
    return {
      id: plan.id,
      status,
      version: plan.version,
      destination: plan.destination,
      startDate,
      endDate,
      nights: nightsBetween(startDate, endDate),
      adults: plan.adults,
      children: plan.children,
      originAirport: plan.originAirport,
      budgetUsd: budget,
      hotelName: plan.hotelName,
      wants: plan.wants as TripKind[],
      notes: plan.notes,
      createdAt: plan.createdAt,
      approvedAt: plan.approvedAt,
      expiresAt: plan.expiresAt,
      items: plan.items.map((i, k) => ({
        ...items[k],
        unitPrice: i.unitPrice == null ? null : Number(i.unitPrice),
        totalPrice: i.totalPrice == null ? null : Number(i.totalPrice),
        cancellationText: i.cancellationText,
        priceCheckedAt: i.priceCheckedAt,
        selfReport: i.selfReport,
      })),
      totals,
      suggestion: status === 'READY' ? suggestSwap(items, budget) : null,
      booking,
    };
  }

  private async mustBeReady(id: string, version: unknown, now: Date) {
    const plan = await this.load(id);
    const status = this.status(plan, now);
    if (status !== 'READY') throw new ConflictException(status === 'EXPIRED' ? 'This trip plan has expired. Please make a new one.' : 'Only a trip plan that is waiting for review can be changed.');
    if (version !== plan.version) throw new ConflictException('This trip plan changed. Reload it and try again.');
    return plan;
  }

  /** Writes changed items and bumps the version, but only if nobody else changed the plan meanwhile. */
  private async saveItems(plan: PlanWithItems, next: ItemView[]) {
    const changed = next.filter((v, k) => JSON.stringify(v) !== JSON.stringify(toView(plan.items[k])));
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tripPlan.updateMany({ where: { id: plan.id, status: 'READY', version: plan.version }, data: { version: { increment: 1 } } });
      if (count === 0) throw new ConflictException('This trip plan changed. Reload it and try again.');
      for (const v of changed) await tx.tripItem.update({ where: { id: v.id }, data: chosenColumns(v) });
    });
  }

  /** Choose another store for an item, or switch to one of its alternatives: { offerId, version }. */
  async select(id: string, itemId: string, body: { offerId?: unknown; version?: unknown }, now = new Date()) {
    const plan = await this.mustBeReady(id, body?.version, now);
    if (!ITEM_ID.test(itemId) || typeof body?.offerId !== 'string') throw new BadRequestException('Provide the store option to switch to.');
    const next = selectOffer(plan.items.map(toView), itemId, body.offerId);
    if (!next) throw new BadRequestException('That is not one of the store options for this item.');
    await this.saveItems(plan, next);
    return this.get(id, now);
  }

  /**
   * Approval re-checks every chosen price against the trust gate and the trip's dates (same rule as shopping plans).
   * If anything changed or disappeared, the plan is updated and NOT approved, and the shopper is asked again.
   * Approval only unlocks the booking buttons: Vault never books or pays.
   */
  async approve(id: string, body: { version?: unknown }, now = new Date()) {
    const plan = await this.mustBeReady(id, body?.version, now);
    const items = plan.items.map(toView);
    const chosen = items.filter((i) => i.selected && i.available && i.chosenOfferId).map((i) => i.chosenOfferId!);
    if (!chosen.length) throw new BadRequestException('There is nothing in this trip plan to approve.');

    const offers = await this.prisma.offer.findMany({
      where: { AND: [{ id: { in: chosen } }, offerFilterFor({ travel: { start: plan.startDate, end: plan.endDate } }, now)] },
      select: { id: true, price: true, lastCheckedAt: true },
    });
    const current = new Map(offers.map((o) => [o.id, { price: Number(o.price), checkedAt: o.lastCheckedAt }]));
    const { items: next, changes } = applyRecheck(items, current);
    if (changes.length) {
      await this.saveItems(plan, next);
      throw new ConflictException({ message: 'Some prices changed since this trip plan was made, so it was updated. Please review it again.', changes, plan: await this.get(id, now) });
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tripPlan.updateMany({ where: { id, status: 'READY', version: plan.version }, data: { status: 'APPROVED', approvedAt: now } });
      if (count === 0) throw new ConflictException('This trip plan changed. Reload it and review it again.');
      for (const v of next) await tx.tripItem.update({ where: { id: v.id }, data: { priceCheckedAt: chosenColumns(v).priceCheckedAt, storeOptions: v.stores as unknown as Prisma.InputJsonValue } });
    });
    return this.get(id, now);
  }

  /** Withdraws a plan (before or after approval). It can't be reopened. */
  async cancel(id: string, now = new Date()) {
    const plan = await this.load(id);
    if (this.status(plan, now) === 'EXPIRED') throw new ConflictException('This trip plan has already expired.');
    await this.prisma.tripPlan.updateMany({ where: { id, status: { in: ['READY', 'APPROVED'] } }, data: { status: 'CANCELLED' } });
    return this.get(id, now);
  }

  /** Optional "Did you complete this booking?" answer. Stores only yes or no: no names, emails or booking numbers. */
  async report(id: string, itemId: string, body: { booked?: unknown }, now = new Date()) {
    const plan = await this.load(id);
    if (this.status(plan, now) !== 'APPROVED') throw new ConflictException('Only an approved trip plan has bookings to report.');
    if (typeof body?.booked !== 'boolean') throw new BadRequestException('Answer yes or no.');
    const item = plan.items.find((i) => i.id === itemId && i.selected);
    if (!item) throw new NotFoundException('That item is not part of this trip plan.');
    await this.prisma.tripItem.update({ where: { id: item.id }, data: { selfReport: body.booked ? 'yes' : 'no' } });
    return this.get(id, now);
  }

  /** Daily: plans past their 7 days are marked EXPIRED, then deleted a week later; plans stuck in DRAFT (a crash mid-build) are deleted. */
  @Cron('50 3 * * *', { timeZone: 'America/New_York' })
  async purgeExpired(now = new Date()) {
    try {
      await this.prisma.tripPlan.updateMany({ where: { expiresAt: { lte: now }, status: { notIn: ['EXPIRED', 'CANCELLED'] } }, data: { status: 'EXPIRED' } });
      const { count } = await this.prisma.tripPlan.deleteMany({
        where: { OR: [{ expiresAt: { lt: new Date(now.getTime() - TRIP_TTL_DAYS * 864e5) } }, { status: 'DRAFT', createdAt: { lt: new Date(now.getTime() - 3600_000) } }] },
      });
      if (count) this.log.log(`Deleted ${count} old trip plans`);
    } catch (e) {
      this.log.warn(`Trip purge failed: ${(e as Error).message}`);
    }
  }
}
