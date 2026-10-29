/**
 * The typed trip request. The assistant proposes one of these from the shopper's words; the website form sends one
 * directly. Either way it is untrusted input: everything is validated and bounded here before anything is searched.
 */
export const TRIP_KINDS = ['FLIGHT', 'HOTEL', 'CAR'] as const; // also the booking order: flight first, then hotel, then car
export type TripKind = (typeof TRIP_KINDS)[number];

export const MAX_NIGHTS = 30;
export const MAX_DAYS_AHEAD = 365;
export const MAX_ADULTS = 9;
export const MAX_CHILDREN = 8;
const MAX_BUDGET = 1_000_000;

export type TripInput = {
  destination: string;
  startDate: string; // YYYY-MM-DD: check-in, pickup, outbound
  endDate: string; // YYYY-MM-DD: check-out, drop-off, return
  adults: number;
  children: number;
  originAirport?: string; // 3-letter code, required when a flight is wanted
  budgetUsd?: number;
  hotelName?: string;
  wants: TripKind[];
};

/** What the shopper still has to tell us (the assistant asks for these in one short question). */
export type MissingField = 'destination' | 'dates' | 'travelers' | 'origin airport';
export type TripParse = { ok: true; value: TripInput } | { ok: false; errors: string[]; missing: MissingField[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AIRPORT = /^[A-Z]{3}$/;
const DAY_MS = 864e5;

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>`{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const absent = (v: unknown) => v === undefined || v === null || v === '';

/** A YYYY-MM-DD date as UTC midnight, or null if it isn't a real calendar date. */
export function parseDay(v: string): Date | null {
  if (!DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}

export const dayString = (d: Date) => d.toISOString().slice(0, 10);
export const nightsBetween = (start: string, end: string) => Math.round((parseDay(end)!.getTime() - parseDay(start)!.getTime()) / DAY_MS);

function wanted(r: Record<string, unknown>): TripKind[] {
  if (Array.isArray(r.wants)) return TRIP_KINDS.filter((k) => (r.wants as unknown[]).some((w) => String(w).toUpperCase() === k));
  const flag = (snake: string, camel: string, dflt: boolean) => {
    const v = r[snake] ?? r[camel];
    return typeof v === 'boolean' ? v : dflt;
  };
  return TRIP_KINDS.filter((k) => (k === 'HOTEL' ? flag('include_hotel', 'includeHotel', true) : k === 'FLIGHT' ? flag('include_flight', 'includeFlight', false) : flag('include_car', 'includeCar', false)));
}

/** Validates a trip request. `today` is the shopper's earliest allowed start date (UTC). */
export function parseTripInput(raw: unknown, today: Date = new Date()): TripParse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['The trip request must be an object.'], missing: [] };
  const r = raw as Record<string, unknown>;
  const pick = (snake: string, camel: string) => r[snake] ?? r[camel];
  const errors: string[] = [];
  const missing: MissingField[] = [];

  const destination = clean(r.destination, 80);
  if (!destination) missing.push('destination');
  else if (destination.length < 2) errors.push('destination is too short.');

  const startRaw = pick('start_date', 'startDate');
  const endRaw = pick('end_date', 'endDate');
  let startDate = '';
  let endDate = '';
  if (absent(startRaw) || absent(endRaw)) missing.push('dates');
  else {
    const s = parseDay(String(startRaw));
    const e = parseDay(String(endRaw));
    const first = parseDay(dayString(today))!;
    if (!s || !e) errors.push('Dates must be real calendar dates written as YYYY-MM-DD.');
    else if (s < first) errors.push('The trip must start today or later.');
    else if (e <= s) errors.push('The end date must be after the start date.');
    else if ((e.getTime() - s.getTime()) / DAY_MS > MAX_NIGHTS) errors.push(`A trip can be at most ${MAX_NIGHTS} nights.`);
    else if ((s.getTime() - first.getTime()) / DAY_MS > MAX_DAYS_AHEAD) errors.push(`The trip must start within ${MAX_DAYS_AHEAD} days.`);
    else {
      startDate = dayString(s);
      endDate = dayString(e);
    }
  }

  let adults = 0;
  if (absent(r.adults)) missing.push('travelers');
  else if (!Number.isInteger(r.adults) || (r.adults as number) < 1 || (r.adults as number) > MAX_ADULTS) errors.push(`adults must be a whole number from 1 to ${MAX_ADULTS}.`);
  else adults = r.adults as number;

  let children = 0;
  if (!absent(r.children)) {
    if (!Number.isInteger(r.children) || (r.children as number) < 0 || (r.children as number) > MAX_CHILDREN) errors.push(`children must be a whole number from 0 to ${MAX_CHILDREN}.`);
    else children = r.children as number;
  }

  const wants = wanted(r);
  if (!wants.length) errors.push('Choose at least one of hotel, flight or car.');

  let originAirport: string | undefined;
  const origin = pick('origin_airport', 'originAirport');
  if (!absent(origin)) {
    const code = clean(origin, 3).toUpperCase();
    if (!AIRPORT.test(code) || String(origin).trim().length !== 3) errors.push('originAirport must be a 3-letter airport code, like JFK.');
    else originAirport = code;
  }
  if (wants.includes('FLIGHT') && absent(origin)) missing.push('origin airport');
  if (!wants.includes('FLIGHT')) originAirport = undefined; // only kept when it is used

  let budgetUsd: number | undefined;
  const budget = pick('budget_usd', 'budgetUsd');
  if (!absent(budget)) {
    const n = typeof budget === 'number' ? budget : Number.NaN;
    if (!Number.isFinite(n) || n <= 0 || n > MAX_BUDGET) errors.push('budgetUsd must be a positive number of US dollars.');
    else budgetUsd = Math.round(n * 100) / 100;
  }

  const hotelName = wants.includes('HOTEL') ? clean(pick('hotel_name', 'hotelName'), 80) || undefined : undefined;

  if (missing.length) errors.unshift(`Still needed: ${missing.join(', ')}.`);
  if (errors.length) return { ok: false, errors, missing };
  return { ok: true, value: { destination, startDate, endDate, adults, children, originAirport, budgetUsd, hotelName, wants } };
}
