import { isLinkOnMerchantDomain } from '../deals/trust';

/**
 * Pre-filled booking links. Vault adds dates, guests or an airport to a partner's link ONLY through a format the owner
 * copied from that partner's official docs or network dashboard and saved on the program, together with where it is
 * documented (bookingLinkDocUrl). There is no built-in or guessed format for any partner. Without a saved format the
 * shopper goes to the item's own page and is shown the details to enter, with a copy button.
 */
export type BookingContext = { checkIn: string; checkOut: string; adults: number; children: number; origin: string | null; destination: string };
export type BookingProgram = { bookingLinkTemplate: string | null; bookingLinkDocUrl: string | null };

const PLACEHOLDER = /\{(\w+)\}/g;
export const BOOKING_PLACEHOLDERS = ['checkIn', 'checkOut', 'adults', 'children', 'travelers', 'origin', 'destination'] as const;

const values = (c: BookingContext): Record<string, string> => ({
  checkIn: c.checkIn,
  checkOut: c.checkOut,
  adults: String(c.adults),
  children: String(c.children),
  travelers: String(c.adults + c.children),
  origin: c.origin ?? '',
  destination: encodeURIComponent(c.destination),
});

const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

/** True only when a documented format is saved: both the template and the https page that documents it. */
export const hasDocumentedFormat = (p: BookingProgram | null | undefined): p is { bookingLinkTemplate: string; bookingLinkDocUrl: string } =>
  !!p?.bookingLinkTemplate?.trim() && !!p.bookingLinkDocUrl?.trim() && isHttps(p.bookingLinkDocUrl.trim());

/** The pre-filled link, or null (no documented format, a placeholder it can't fill, or not https on the store's own domain). */
export function prefilledBookingUrl(program: BookingProgram | null | undefined, ctx: BookingContext, merchantDomain: string): string | null {
  if (!hasDocumentedFormat(program)) return null;
  if (ctx.origin === null && program.bookingLinkTemplate.includes('{origin}')) return null;
  const v = values(ctx);
  const url = program.bookingLinkTemplate.trim().replace(PLACEHOLDER, (all, name: string) => (name in v ? v[name] : all));
  if (/\{\w+\}/.test(url)) return null;
  return isLinkOnMerchantDomain(url, merchantDomain) ? url : null;
}

/** Checks a format when the owner saves it, so a bad one is caught before any shopper clicks it. Empty template = turn pre-fill off. */
export function validateBookingFormat(template: string | null, docUrl: string | null, merchantDomain: string): string[] {
  const t = template?.trim() ?? '';
  if (!t) return [];
  const problems: string[] = [];
  if (!docUrl?.trim() || !isHttps(docUrl.trim())) problems.push("Add the https link to the partner's documentation (or dashboard page) that shows this booking link format.");
  const names = [...t.matchAll(PLACEHOLDER)].map((m) => m[1]);
  const unknown = names.filter((n) => !(BOOKING_PLACEHOLDERS as readonly string[]).includes(n));
  if (unknown.length) problems.push(`Unknown placeholder {${unknown[0]}}. Use ${BOOKING_PLACEHOLDERS.map((p) => `{${p}}`).join(', ')}.`);
  if (!names.length) problems.push('The format has no placeholders, so it would not fill in anything.');
  if (!problems.length) {
    const sample = prefilledBookingUrl({ bookingLinkTemplate: t, bookingLinkDocUrl: docUrl }, { checkIn: '2026-12-20', checkOut: '2026-12-27', adults: 2, children: 0, origin: 'JFK', destination: 'Miami' }, merchantDomain);
    if (!sample) problems.push(`The link must be https on the store's own domain (${merchantDomain}).`);
  }
  return problems;
}

/** What the shopper should enter on the partner site when we can't pre-fill it. */
export function manualDetails(kind: 'HOTEL' | 'FLIGHT' | 'CAR', ctx: BookingContext): string {
  const people = `${ctx.adults} adult${ctx.adults === 1 ? '' : 's'}${ctx.children ? `, ${ctx.children} child${ctx.children === 1 ? '' : 'ren'}` : ''}`;
  if (kind === 'FLIGHT') return `Round trip ${ctx.origin ?? ''} to ${ctx.destination}, leaving ${ctx.checkIn}, returning ${ctx.checkOut}, ${people}`;
  if (kind === 'CAR') return `Pick up ${ctx.checkIn}, drop off ${ctx.checkOut}, ${ctx.destination}`;
  return `Check in ${ctx.checkIn}, check out ${ctx.checkOut}, ${people}, 1 room`;
}
