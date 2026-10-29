import type { TripInput } from '../src/trips/trip-input';
import { applyRecheck, buildTrip, lineCents, matchesName, quantityFor, selectOffer, suggestSwap, tripTotals, type TripCandidate } from '../src/trips/trip-planner';

const CHECKED = '2026-10-29T14:00:00.000Z';
const store = (offerId: string, storeName: string, unitPrice: number, cancellationText: string | null = null) => ({ offerId, store: storeName, storeSlug: storeName.toLowerCase(), unitPrice, cancellationText, priceCheckedAt: CHECKED });
const cand = (kind: TripCandidate['kind'], dealSlug: string, title: string, stores: ReturnType<typeof store>[]): TripCandidate => ({ kind, dealSlug, title, stores });

const input = (o: Partial<TripInput> = {}): TripInput => ({ destination: 'Miami', startDate: '2026-12-20', endDate: '2026-12-27', adults: 2, children: 0, wants: ['HOTEL'], ...o });

const hotels = [
  cand('HOTEL', 'coral', 'Coral Inn, Miami Beach', [store('h1e', 'Expedia', 99.99), store('h1b', 'Booking.com', 95.5)]),
  cand('HOTEL', 'palm', 'Palm Court Hotel, Miami', [store('h2e', 'Expedia', 150)]),
  cand('HOTEL', 'bay', 'Bayfront Hotel, Miami', [store('h3b', 'Booking.com', 120)]),
  cand('HOTEL', 'seabreeze', 'Seabreeze Grand Hotel, Miami Beach', [store('h4e', 'Expedia', 210, 'Free cancellation until Dec 18'), store('h4b', 'Booking.com', 205)]),
];
const flights = [cand('FLIGHT', 'jfk-mia', 'Round trip JFK to Miami (MIA)', [store('f1e', 'Expedia', 240), store('f1b', 'Booking.com', 250)])];
const cars = [cand('CAR', 'compact', 'Compact car, Miami airport', [store('c1b', 'Booking.com', 30), store('c1e', 'Expedia', 33)]), cand('CAR', 'suv', 'SUV, Miami airport', [store('c2e', 'Expedia', 55)])];

describe('trip quantities and totals (computed in code, never by the model)', () => {
  it('nights for hotels, rental days for cars, travelers for flights', () => {
    const i = input({ adults: 2, children: 1 });
    expect(quantityFor('HOTEL', i)).toBe(7);
    expect(quantityFor('CAR', i)).toBe(7);
    expect(quantityFor('FLIGHT', i)).toBe(3);
  });

  it('picks the best fit at its cheapest store and totals unit price x quantity in whole cents', () => {
    const { items } = buildTrip(input(), { HOTEL: hotels });
    const pick = items.find((i) => i.selected)!;
    expect(pick).toMatchObject({ dealSlug: 'coral', chosenOfferId: 'h1b', quantity: 7, unitLabel: 'night' });
    expect(pick.stores.map((s) => s.store)).toEqual(['Booking.com', 'Expedia']); // cheapest first
    expect(lineCents(pick)).toBe(66850); // $95.50 x 7, no floating point drift
    expect(tripTotals(items, null, ['HOTEL']).total).toBe(668.5);
  });

  it('shows the pick plus up to 2 alternatives per part', () => {
    const { items } = buildTrip(input(), { HOTEL: hotels });
    expect(items.map((i) => i.dealSlug)).toEqual(['coral', 'palm', 'bay']);
    expect(items.filter((i) => i.selected)).toHaveLength(1);
  });

  it('orders parts flight, hotel, car and adds them all up', () => {
    const { items } = buildTrip(input({ wants: ['HOTEL', 'FLIGHT', 'CAR'], originAirport: 'JFK' }), { HOTEL: hotels, FLIGHT: flights, CAR: cars });
    expect([...new Set(items.map((i) => i.kind))]).toEqual(['FLIGHT', 'HOTEL', 'CAR']);
    const t = tripTotals(items, 1500, ['HOTEL', 'FLIGHT', 'CAR']);
    expect(t.total).toBe(240 * 2 + 95.5 * 7 + 30 * 7); // 1358.5
    expect(t.budget).toEqual({ limit: 1500, spent: 1358.5, remaining: 141.5, over: 0 });
    expect(t.withinBudget).toBe(true);
  });

  it('a budget exactly met is within budget; one cent over is over', () => {
    const { items } = buildTrip(input(), { HOTEL: hotels });
    expect(tripTotals(items, 668.5, ['HOTEL']).withinBudget).toBe(true);
    expect(tripTotals(items, 668.49, ['HOTEL'])).toMatchObject({ withinBudget: false, budget: { over: 0.01 } });
  });
});

describe('named hotel', () => {
  it('matches every identifying word of the name, never a fuzzy guess', () => {
    expect(matchesName('Seabreeze Grand Hotel, Miami Beach', 'the Seabreeze Grand')).toBe(true);
    expect(matchesName('Seabreeze Grand Hotel, Miami Beach', 'Seabreeze Royal')).toBe(false);
    expect(matchesName('Seabreezy Hotel', 'Seabreeze')).toBe(false);
    expect(matchesName('Any hotel', 'The Hotel')).toBe(false); // only generic words: never a match
  });

  it('when found, it is the pick (even if pricier) and flagged; up to 2 alternatives follow', () => {
    const { items, notes } = buildTrip(input({ hotelName: 'Seabreeze Grand' }), { HOTEL: hotels });
    expect(items[0]).toMatchObject({ dealSlug: 'seabreeze', selected: true, namedMatch: true, chosenOfferId: 'h4b' });
    expect(items).toHaveLength(3);
    expect(items.filter((i) => i.namedMatch)).toHaveLength(1);
    expect(notes.join(' ')).not.toMatch(/couldn't find/);
  });

  it('when missing, says so honestly and never labels another hotel as it', () => {
    const { items, notes } = buildTrip(input({ hotelName: 'Fontainebleau' }), { HOTEL: hotels });
    expect(notes[0]).toBe('We couldn\'t find "Fontainebleau" at a verified store for these dates. Here are other hotels in Miami.');
    expect(items.some((i) => i.namedMatch)).toBe(false);
    expect(items.map((i) => i.title).join(' ')).not.toMatch(/Fontainebleau/);
  });
});

describe('nothing found', () => {
  it('reports a missing part instead of inventing one, and it is listed as not included', () => {
    const { items, notes } = buildTrip(input({ wants: ['HOTEL', 'FLIGHT'], originAirport: 'LAX' }), { HOTEL: hotels, FLIGHT: [] });
    expect(items.some((i) => i.kind === 'FLIGHT')).toBe(false);
    expect(notes).toContain('No flight from a verified store matches LAX to Miami for these dates.');
    expect(tripTotals(items, null, ['HOTEL', 'FLIGHT']).missingKinds).toEqual(['FLIGHT']);
  });
});

describe('over budget', () => {
  const full = () => buildTrip(input({ wants: ['HOTEL', 'FLIGHT', 'CAR'], originAirport: 'JFK', hotelName: 'Seabreeze Grand' }), { HOTEL: hotels, FLIGHT: flights, CAR: cars }).items;

  it('is shown, never hidden: every part stays in the plan', () => {
    const items = full();
    const t = tripTotals(items, 1500, ['HOTEL', 'FLIGHT', 'CAR']);
    expect(t.total).toBe(480 + 205 * 7 + 210); // 2125
    expect(t).toMatchObject({ withinBudget: false, budget: { over: 625 }, missingKinds: [] });
    expect(items.filter((i) => i.selected).map((i) => i.kind)).toEqual(['FLIGHT', 'HOTEL', 'CAR']);
  });

  it('suggests the cheapest swap: the single change that lowers the total most', () => {
    const items = full();
    // Over by $625. Coral at Booking.com ($95.50) saves (205 - 95.50) x 7 = $766.50; Coral at Expedia saves $735.07; Palm saves $385.
    expect(suggestSwap(items, 1500)).toMatchObject({ kind: 'HOTEL', fromItemId: 'HOTEL:seabreeze', toItemId: 'HOTEL:coral', toOfferId: 'h1b', saves: 766.5, withinBudgetAfter: true });
    // It only suggests: nothing in the plan changed.
    expect(items.find((i) => i.selected && i.kind === 'HOTEL')!.dealSlug).toBe('seabreeze');
  });

  it('says honestly when even the cheapest swap is not enough', () => {
    expect(suggestSwap(full(), 500)).toMatchObject({ toItemId: 'HOTEL:coral', saves: 766.5, withinBudgetAfter: false });
  });

  it('can suggest a cheaper store for the same item', () => {
    const { items } = buildTrip(input(), { HOTEL: hotels });
    const onExpedia = selectOffer(items, 'HOTEL:coral', 'h1e')!; // 99.99 x 7 = 699.93
    expect(suggestSwap(onExpedia, 690)).toMatchObject({ toItemId: 'HOTEL:coral', toOfferId: 'h1b', saves: 31.43, withinBudgetAfter: true });
  });

  it('no suggestion when within budget or without a budget', () => {
    expect(suggestSwap(full(), 5000)).toBeNull();
    expect(suggestSwap(full(), null)).toBeNull();
  });
});

describe('choosing a store or an alternative', () => {
  it('switches the store, or moves the pick to an alternative; one pick per part', () => {
    const { items } = buildTrip(input(), { HOTEL: hotels });
    const a = selectOffer(items, 'HOTEL:coral', 'h1e')!;
    expect(a.find((i) => i.id === 'HOTEL:coral')!.chosenOfferId).toBe('h1e');
    const b = selectOffer(a, 'HOTEL:palm', 'h2e')!;
    expect(b.filter((i) => i.selected).map((i) => i.id)).toEqual(['HOTEL:palm']);
    expect(tripTotals(b, null, ['HOTEL']).total).toBe(1050);
  });

  it("refuses an offer that isn't one of the item's own", () => {
    const { items } = buildTrip(input(), { HOTEL: hotels });
    expect(selectOffer(items, 'HOTEL:coral', 'h2e')).toBeNull();
    expect(selectOffer(items, 'nope', 'h1b')).toBeNull();
  });
});

describe('approval re-check', () => {
  const now = new Date('2026-10-29T15:00:00Z');
  it('reports changed and vanished prices, updates the plan, and recomputes the total', () => {
    const { items } = buildTrip(input({ wants: ['HOTEL', 'CAR'] }), { HOTEL: hotels, CAR: cars });
    const { items: next, changes } = applyRecheck(items, new Map([['h1b', { price: 101, checkedAt: now }]]));
    expect(changes).toEqual([
      { itemId: 'HOTEL:coral', kind: 'HOTEL', title: 'Coral Inn, Miami Beach', store: 'Booking.com', was: 95.5, now: 101 },
      { itemId: 'CAR:compact', kind: 'CAR', title: 'Compact car, Miami airport', store: 'Booking.com', was: 30, now: null },
    ]);
    expect(next.find((i) => i.id === 'CAR:compact')!.available).toBe(false);
    expect(tripTotals(next, null, ['HOTEL', 'CAR'])).toMatchObject({ total: 707, missingKinds: ['CAR'] });
  });

  it('reports nothing when every price is unchanged (and refreshes the check time)', () => {
    const { items } = buildTrip(input(), { HOTEL: hotels });
    const { items: next, changes } = applyRecheck(items, new Map([['h1b', { price: 95.5, checkedAt: now }]]));
    expect(changes).toEqual([]);
    expect(next[0].stores.find((s) => s.offerId === 'h1b')!.priceCheckedAt).toBe(now.toISOString());
  });
});

describe('commission blindness', () => {
  it('trip planning code never reads affiliate, program, click or commission data', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['trip-planner.ts', 'trip-input.ts', 'trip-facts.ts', 'trips.service.ts']) {
      const src = readFileSync(`${__dirname}/../src/trips/${f}`, 'utf8');
      expect(src).not.toMatch(/affiliate|commission|click|\bprogram/i);
    }
  });
});
