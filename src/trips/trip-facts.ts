import { safeText } from '../search/facts';
import type { TripsService } from './trips.service';

export type TripView = Awaited<ReturnType<TripsService['get']>>;

const UNIT_WORDS = { night: 'per night', day: 'per rental day', trip: 'per traveler, round trip' } as const;
const minutesAgo = (iso: string, now: Date) => Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
const money = (n: number) => Math.round(n * 100) / 100;

/**
 * What the assistant is told about a trip plan: verified facts only. No ids, links, offer ids or anything about how a
 * store pays us. Every amount here was computed in code; the reply may quote only these (the claim checker enforces it).
 */
export function tripFacts(t: TripView, now: Date = new Date()) {
  return {
    status: t.status,
    destination: safeText(t.destination, 80),
    startDate: t.startDate,
    endDate: t.endDate,
    nights: t.nights,
    adults: t.adults,
    children: t.children,
    originAirport: t.originAirport,
    budgetUsd: t.budgetUsd,
    namedHotel: t.hotelName ? { name: safeText(t.hotelName, 80), found: t.items.some((i) => i.namedMatch) } : null,
    parts: t.items.map((i) => ({
      kind: i.kind.toLowerCase(),
      title: safeText(i.title, 160),
      inPlan: i.selected,
      isTheNamedHotel: i.namedMatch,
      available: i.available,
      priceUnit: UNIT_WORDS[i.unitLabel],
      quantity: i.quantity,
      chosenStore: i.stores.find((s) => s.offerId === i.chosenOfferId)?.store ?? null,
      stores: i.stores.map((s) => ({
        store: safeText(s.store, 60),
        unitPrice: s.unitPrice,
        totalForTrip: money((Math.round(s.unitPrice * 100) * i.quantity) / 100),
        cancellation: s.cancellationText ? safeText(s.cancellationText, 200) : 'not stated by the source',
        priceCheckedMinutesAgo: minutesAgo(s.priceCheckedAt, now),
      })),
    })),
    total: t.totals.total,
    budget: t.totals.budget ? { limit: t.totals.budget.limit, remaining: t.totals.budget.remaining, over: t.totals.budget.over } : null,
    withinBudget: t.totals.withinBudget,
    missingParts: t.totals.missingKinds.map((k) => k.toLowerCase()),
    suggestedSwap: t.suggestion ? { title: safeText(t.suggestion.title, 160), store: t.suggestion.store, saves: t.suggestion.saves, totalAfter: money(t.totals.total - t.suggestion.saves), withinBudgetAfter: t.suggestion.withinBudgetAfter } : null,
    notes: t.notes.map((n) => safeText(n, 240)),
  };
}

export type TripFacts = ReturnType<typeof tripFacts>;
