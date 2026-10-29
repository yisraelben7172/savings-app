import { addTrip, bookingClaims, checkReply, emptyFacts, plainTripReply } from '../src/ai/claim-check';
import type { TripFacts } from '../src/trips/trip-facts';
import { hasDocumentedFormat, manualDetails, prefilledBookingUrl, validateBookingFormat } from '../src/trips/trip-links';

const ctx = { checkIn: '2026-12-20', checkOut: '2026-12-27', adults: 2, children: 1, origin: 'JFK', destination: 'Miami Beach' };
const DOC = 'https://partners.example-travel.com/docs/deep-links';
const program = (bookingLinkTemplate: string | null, bookingLinkDocUrl: string | null = DOC) => ({ bookingLinkTemplate, bookingLinkDocUrl });

describe('pre-filled booking links: no guessed parameters', () => {
  it('without a saved, documented format there is no pre-filled link at all', () => {
    expect(prefilledBookingUrl(null, ctx, 'expedia.com')).toBeNull();
    expect(prefilledBookingUrl(program(null), ctx, 'expedia.com')).toBeNull();
    // a format with no record of where it is documented is never used
    expect(prefilledBookingUrl(program('https://www.expedia.com/Hotel-Search?startDate={checkIn}', null), ctx, 'expedia.com')).toBeNull();
    expect(prefilledBookingUrl(program('https://www.expedia.com/Hotel-Search?startDate={checkIn}', 'not a url'), ctx, 'expedia.com')).toBeNull();
    expect(hasDocumentedFormat(program('https://www.expedia.com/x?d={checkIn}', 'http://insecure.example/docs'))).toBe(false);
  });

  it('fills only the documented placeholders, exactly as saved', () => {
    const url = prefilledBookingUrl(program('https://www.expedia.com/Hotel-Search?destination={destination}&startDate={checkIn}&endDate={checkOut}&adults={adults}&children={children}'), ctx, 'expedia.com');
    expect(url).toBe('https://www.expedia.com/Hotel-Search?destination=Miami%20Beach&startDate=2026-12-20&endDate=2026-12-27&adults=2&children=1');
  });

  it('never adds anything that is not in the saved format', () => {
    const url = prefilledBookingUrl(program('https://www.expedia.com/Hotel-Search?startDate={checkIn}'), ctx, 'expedia.com')!;
    expect([...new URL(url).searchParams.keys()]).toEqual(['startDate']);
  });

  it('refuses unknown placeholders, other domains and plain http', () => {
    expect(prefilledBookingUrl(program('https://www.expedia.com/x?rooms={rooms}&d={checkIn}'), ctx, 'expedia.com')).toBeNull();
    expect(prefilledBookingUrl(program('https://evil.example/x?d={checkIn}'), ctx, 'expedia.com')).toBeNull();
    expect(prefilledBookingUrl(program('http://www.expedia.com/x?d={checkIn}'), ctx, 'expedia.com')).toBeNull();
    expect(prefilledBookingUrl(program('https://www.expedia.com/x?from={origin}'), { ...ctx, origin: null }, 'expedia.com')).toBeNull();
  });

  it('checks a format when the owner saves it', () => {
    expect(validateBookingFormat('', null, 'expedia.com')).toEqual([]); // empty = pre-fill off
    expect(validateBookingFormat('https://www.expedia.com/x?d={checkIn}', DOC, 'expedia.com')).toEqual([]);
    expect(validateBookingFormat('https://www.expedia.com/x?d={checkIn}', null, 'expedia.com').join(' ')).toMatch(/documentation/);
    expect(validateBookingFormat('https://www.expedia.com/x?d={date}', DOC, 'expedia.com').join(' ')).toMatch(/Unknown placeholder \{date\}/);
    expect(validateBookingFormat('https://www.expedia.com/hotels', DOC, 'expedia.com').join(' ')).toMatch(/no placeholders/);
    expect(validateBookingFormat('https://other.example/x?d={checkIn}', DOC, 'expedia.com').join(' ')).toMatch(/expedia\.com/);
  });

  it('without pre-fill, the shopper is told exactly what to enter', () => {
    expect(manualDetails('HOTEL', ctx)).toBe('Check in 2026-12-20, check out 2026-12-27, 2 adults, 1 child, 1 room');
    expect(manualDetails('FLIGHT', ctx)).toBe('Round trip JFK to Miami Beach, leaving 2026-12-20, returning 2026-12-27, 2 adults, 1 child');
    expect(manualDetails('CAR', ctx)).toBe('Pick up 2026-12-20, drop off 2026-12-27, Miami Beach');
  });
});

const trip: TripFacts = {
  status: 'READY', destination: 'Miami', startDate: '2026-12-20', endDate: '2026-12-27', nights: 7, adults: 2, children: 0, originAirport: 'JFK', budgetUsd: 1500,
  namedHotel: { name: 'Fontainebleau', found: false },
  parts: [
    { kind: 'flight', title: 'Round trip JFK to Miami (MIA)', inPlan: true, isTheNamedHotel: false, available: true, priceUnit: 'per traveler, round trip', quantity: 2, chosenStore: 'Expedia',
      stores: [{ store: 'Expedia', unitPrice: 240, totalForTrip: 480, cancellation: 'not stated by the source', priceCheckedMinutesAgo: 30 }] },
    { kind: 'hotel', title: 'Coral Inn, Miami Beach', inPlan: true, isTheNamedHotel: false, available: true, priceUnit: 'per night', quantity: 7, chosenStore: 'Booking.com',
      stores: [{ store: 'Booking.com', unitPrice: 95.5, totalForTrip: 668.5, cancellation: 'not stated by the source', priceCheckedMinutesAgo: 30 }, { store: 'Expedia', unitPrice: 99.99, totalForTrip: 699.93, cancellation: 'Free cancellation', priceCheckedMinutesAgo: 30 }] },
  ],
  total: 1148.5, budget: { limit: 1500, remaining: 351.5, over: 0 }, withinBudget: true, missingParts: [], suggestedSwap: null, notes: [],
};
const facts = () => {
  const f = emptyFacts();
  addTrip(f, trip);
  return f;
};
const STORES = ['Expedia', 'Booking.com', 'Hotels.com'];

describe('claim checker on trip replies', () => {
  it('accepts replies that quote the plan exactly', () => {
    for (const reply of [
      'Your Miami plan comes to $1,148.50 of your $1,500 budget, leaving $351.50.',
      'Coral Inn is $95.50 a night at Booking.com, $668.50 for 7 nights.',
      'The flight from JFK is $240 per traveler at Expedia, $480 for both of you.',
      "I couldn't find the Fontainebleau at a verified store, so I picked other hotels. Approve the plan, then finish booking on Expedia and Booking.com.",
    ]) expect(checkReply(reply, facts(), STORES, 'Miami Dec 20 to 27, 2 adults, $1,500, from JFK')).toEqual({ ok: true, problems: [] });
  });

  it('blocks an invented price, total or store', () => {
    expect(checkReply('The whole trip is $1,099.', facts(), STORES, '').ok).toBe(false);
    expect(checkReply('Coral Inn is $89 a night.', facts(), STORES, '').ok).toBe(false);
    expect(checkReply('Coral Inn is $95.50 a night at Hotels.com.', facts(), STORES, '').ok).toBe(false);
  });

  it.each([
    'I booked your hotel at Booking.com.',
    "We've reserved the Coral Inn for you.",
    'Your hotel is booked!',
    'Your booking is confirmed.',
    "You're all booked for Miami.",
    'Your confirmation number is on the way.',
    'Vault has paid for the flight.',
  ])('blocks any claim that something was booked or paid: %s', (reply) => {
    expect(bookingClaims(reply)).toHaveLength(1);
    expect(checkReply(reply, facts(), STORES, '').ok).toBe(false);
  });

  it.each(['Finish booking on Expedia after you approve.', 'Once you approve, you can book each part on the partner site.', 'Book on Booking.com when you are ready.'])(
    'allows honest booking directions: %s',
    (reply) => expect(bookingClaims(reply)).toEqual([]),
  );

  it('the plain fallback reply is built only from the facts and never claims a booking', () => {
    const reply = plainTripReply(trip);
    expect(reply).toBe(
      "I put together a trip plan for Miami, 2026-12-20 to 2026-12-27: $1148.50 in total. That is $1148.50 of your $1500 budget. I couldn't find Fontainebleau at a verified store, so I included other hotels. Review it and approve it, then finish each booking on the partner's site. Prices and availability can change on the booking site.",
    );
    expect(checkReply(reply, facts(), STORES, '').ok).toBe(true);
  });
});
