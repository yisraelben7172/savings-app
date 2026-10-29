import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicLike } from '../src/ai/client';
import type { AiUsageService } from '../src/ai/usage.service';
import { AssistantService } from '../src/assistant/assistant.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SearchService } from '../src/search/search.service';
import type { TripView } from '../src/trips/trip-facts';
import type { TripsService } from '../src/trips/trips.service';

const CHECKED = new Date(Date.now() - 20 * 60_000).toISOString();
const ID = 'a'.repeat(32);
const view = {
  id: ID, status: 'READY', version: 1, destination: 'Miami', startDate: '2026-12-20', endDate: '2026-12-27', nights: 7, adults: 2, children: 0, originAirport: 'JFK',
  budgetUsd: 1500, hotelName: 'Fontainebleau', wants: ['FLIGHT', 'HOTEL'], notes: ['We couldn\'t find "Fontainebleau" at a verified store for these dates. Here is another hotel in Miami.'],
  createdAt: new Date(), approvedAt: null, expiresAt: new Date(),
  items: [
    { id: 'item00000001', kind: 'FLIGHT', dealSlug: 'jfk-mia', title: 'Round trip JFK to Miami (MIA)', namedMatch: false, selected: true, available: true, unitLabel: 'trip', quantity: 2, chosenOfferId: 'offer0000001',
      stores: [{ offerId: 'offer0000001', store: 'Expedia', storeSlug: 'expedia', unitPrice: 240, cancellationText: null, priceCheckedAt: CHECKED }], unitPrice: 240, totalPrice: 480, cancellationText: null, priceCheckedAt: CHECKED, selfReport: null },
    { id: 'item00000002', kind: 'HOTEL', dealSlug: 'coral', title: 'Coral Inn, Miami Beach', namedMatch: false, selected: true, available: true, unitLabel: 'night', quantity: 7, chosenOfferId: 'offer0000002',
      stores: [{ offerId: 'offer0000002', store: 'Booking.com', storeSlug: 'booking-com', unitPrice: 95.5, cancellationText: 'Free cancellation until Dec 18', priceCheckedAt: CHECKED }], unitPrice: 95.5, totalPrice: 668.5, cancellationText: 'Free cancellation until Dec 18', priceCheckedAt: CHECKED, selfReport: null },
  ],
  totals: { total: 1148.5, budget: { limit: 1500, spent: 1148.5, remaining: 351.5, over: 0 }, withinBudget: true, missingKinds: [] },
  suggestion: null,
  booking: [],
} as unknown as TripView;

const msg = (content: Record<string, unknown>[], stop: string) =>
  ({ id: 'm', type: 'message', role: 'assistant', model: 'x', content, stop_reason: stop, usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }) as unknown as Anthropic.Message;
const text = (t: string) => msg([{ type: 'text', text: t }], 'end_turn');
const useTool = (input: unknown) => msg([{ type: 'tool_use', id: 't1', name: 'plan_trip', input }], 'tool_use');
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const FULL = { destination: 'Miami', start_date: day(30), end_date: day(37), adults: 2, origin_airport: 'JFK', budget_usd: 1500, hotel_name: 'Fontainebleau', include_flight: true };

function setup(script: Anthropic.Message[]) {
  const queue = [...script];
  const create = jest.fn(async () => queue.shift()!);
  const client: AnthropicLike = { messages: { create } } as unknown as AnthropicLike;
  const usage = { withinBudget: jest.fn(async () => true), record: jest.fn(async () => undefined) } as unknown as AiUsageService;
  const search = { search: jest.fn(async () => []) } as unknown as SearchService;
  const prisma = { merchant: { findMany: jest.fn(async () => [{ name: 'Expedia' }, { name: 'Booking.com' }, { name: 'Hotels.com' }]) } } as unknown as PrismaService;
  const trips = { create: jest.fn(async () => view) } as unknown as TripsService & { create: jest.Mock };
  return { svc: new AssistantService(client, search, usage, prisma, trips), create, trips };
}
const toolPayload = (create: jest.Mock) => {
  const msgs = (create.mock.calls[1] as unknown as [{ messages: { content: unknown }[] }])[0].messages;
  return JSON.parse((msgs[msgs.length - 1].content as { content: string }[])[0].content);
};

describe('assistant: plan_trip', () => {
  it('asks one question when details are missing, and builds nothing', async () => {
    const { svc, create, trips } = setup([useTool({ destination: 'Miami', include_flight: true }), text('Happy to plan Miami! What dates, how many travelers, and which airport are you flying from?')]);
    const out = await svc.chat('Plan me a Miami trip with a flight');
    expect(trips.create).not.toHaveBeenCalled();
    expect(toolPayload(create)).toMatchObject({ needsInfo: ['dates', 'travelers', 'origin airport'] });
    expect(out.trip).toBeUndefined();
    expect(out.reply).toMatch(/What dates/);
  });

  it('builds the plan through the same service (AI-permitted data only) and returns the trip card', async () => {
    const reply = "Your Miami plan is $1,148.50 of your $1,500 budget. I couldn't find the Fontainebleau at a verified store, so I picked Coral Inn at $95.50 a night on Booking.com. Approve it, then finish booking on each partner site.";
    const { svc, create, trips } = setup([useTool(FULL), text(reply)]);
    const out = await svc.chat('Miami, Dec 20 to 27, 2 adults, $1,500 total, I want the Fontainebleau, plus a flight from JFK');
    expect(trips.create).toHaveBeenCalledWith(expect.objectContaining({ destination: 'Miami', adults: 2, originAirport: 'JFK', wants: ['FLIGHT', 'HOTEL'] }), expect.objectContaining({ aiOnly: true }));
    expect(out.reply).toBe(reply);
    expect(out.trip).toEqual({ id: ID, destination: 'Miami', startDate: '2026-12-20', endDate: '2026-12-27', total: 1148.5, withinBudget: true });
    const payload = toolPayload(create);
    expect(payload.trip).toMatchObject({ total: 1148.5, namedHotel: { name: 'Fontainebleau', found: false } });
    // facts only: no ids, links or anything commercial reach the model
    expect(JSON.stringify(payload)).not.toMatch(/https?:|offer0|item0|aaaaaaaa|commission|affiliate|program|\/go\//i);
  });

  it.each([
    ['an invented total', 'Your whole trip comes to $999, well under budget.'],
    ['a booking claim', 'Done! I booked the Coral Inn and your flight from JFK.'],
    ['an unlisted store', 'Coral Inn is $95.50 a night at Hotels.com.'],
  ])('replaces %s with a plain answer built from the plan', async (_label, bad) => {
    const { svc } = setup([useTool(FULL), text(bad)]);
    const out = await svc.chat('Miami Dec 20 to 27, 2 adults, $1,500, Fontainebleau, flight from JFK');
    expect(out.reply).not.toBe(bad);
    expect(out.reply).toMatch(/^I put together a trip plan for Miami, 2026-12-20 to 2026-12-27: \$1148\.50 in total\./);
    expect(out.reply).not.toMatch(/\bbooked\b/i);
    expect(out.trip?.id).toBe(ID);
  });
});
