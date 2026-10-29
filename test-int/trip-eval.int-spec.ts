import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addTrip, checkReply, emptyFacts } from '../src/ai/claim-check';
import { DealsService } from '../src/deals/deals.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchService } from '../src/search/search.service';
import { BookingLinksService } from '../src/trips/booking-links.service';
import { tripFacts, type TripView } from '../src/trips/trip-facts';
import type { TripKind } from '../src/trips/trip-input';
import { TripsService } from '../src/trips/trips.service';
import { seedCatalog, STORES } from './eval/catalog';
import { NEVER_FOR_AI, NEVER_IN_TRIPS, seedTripCatalog, STAY, TRAVEL } from './eval/trip-catalog';

const prisma = new PrismaService();
const search = new SearchService(prisma, new DealsService(prisma));
const trips = new TripsService(prisma, search, new BookingLinksService(prisma));
const NOW = new Date();

/** Labeled trip requests over the synthetic travel catalog, with what a correct, honest plan must contain. */
type TripCase = {
  id: string;
  ask: string;
  request: Record<string, unknown>;
  aiOnly?: boolean;
  picks?: Partial<Record<TripKind, string>>; // expected selected deal per part
  namedFound?: boolean;
  missing?: TripKind[];
  withinBudget?: boolean;
  quantity?: Partial<Record<TripKind, number>>;
  absent?: string[]; // must not appear anywhere in the plan
};
const base = { destination: 'Miami', adults: 2 };
const CASES: TripCase[] = [
  { id: 'hotel-only', ask: 'Miami, 7 nights, 2 adults (website)', request: { ...base }, picks: { HOTEL: 'noai-miami-hotel' } },
  { id: 'hotel-ai', ask: 'Miami, 7 nights, 2 adults (through the AI assistant)', request: { ...base }, aiOnly: true, picks: { HOTEL: 'coral-inn' }, absent: NEVER_FOR_AI },
  { id: 'named-found', ask: 'Miami, I want the Seabreeze Grand', request: { ...base, hotelName: 'the Seabreeze Grand' }, aiOnly: true, picks: { HOTEL: 'seabreeze-grand' }, namedFound: true },
  { id: 'named-missing', ask: 'Miami, I want the Fontainebleau', request: { ...base, hotelName: 'Fontainebleau' }, aiOnly: true, namedFound: false, picks: { HOTEL: 'coral-inn' } },
  { id: 'named-other-city', ask: 'Miami, the Riverside (only exists in Lisbon)', request: { ...base, hotelName: 'Riverside' }, aiOnly: true, namedFound: false, absent: ['lisbon-riverside'] },
  { id: 'full-within-budget', ask: 'Miami, $1,500, flight from JFK and a car', request: { ...base, budgetUsd: 1500, originAirport: 'JFK', includeFlight: true, includeCar: true }, aiOnly: true, picks: { FLIGHT: 'jfk-mia', HOTEL: 'coral-inn', CAR: 'mia-compact' }, withinBudget: true },
  { id: 'over-budget', ask: 'Miami, $1,500, Seabreeze Grand, flight from JFK and a car', request: { ...base, budgetUsd: 1500, hotelName: 'Seabreeze Grand', originAirport: 'JFK', includeFlight: true, includeCar: true }, aiOnly: true, picks: { FLIGHT: 'jfk-mia', HOTEL: 'seabreeze-grand', CAR: 'mia-compact' }, withinBudget: false },
  { id: 'tight-budget', ask: 'Miami, $300 total', request: { ...base, budgetUsd: 300 }, aiOnly: true, withinBudget: false },
  { id: 'no-flight-from-origin', ask: 'Miami with a flight from LAX', request: { ...base, originAirport: 'LAX', includeFlight: true }, aiOnly: true, missing: ['FLIGHT'] },
  { id: 'other-origin', ask: 'Miami with a flight from Boston', request: { ...base, originAirport: 'BOS', includeFlight: true }, aiOnly: true, picks: { FLIGHT: 'bos-mia' } },
  { id: 'children-fly-too', ask: 'Miami, 2 adults and 1 child, flight from JFK', request: { ...base, children: 1, originAirport: 'JFK', includeFlight: true, includeHotel: false }, aiOnly: true, quantity: { FLIGHT: 3 } },
  { id: 'lisbon', ask: 'Lisbon, 7 nights', request: { destination: 'Lisbon', adults: 2 }, aiOnly: true, picks: { HOTEL: 'lisbon-riverside' }, absent: ['coral-inn', 'seabreeze-grand'] },
  { id: 'miami-beach-car', ask: 'Miami Beach with a car (car falls back to the city)', request: { destination: 'Miami Beach', adults: 2, includeCar: true }, aiOnly: true, picks: { HOTEL: 'coral-inn', CAR: 'mia-compact' }, absent: ['palm-court', 'bayfront-hotel'] },
  { id: 'nowhere', ask: 'Reykjavik, 7 nights', request: { destination: 'Reykjavik', adults: 2 }, aiOnly: true, missing: ['HOTEL'] },
];

type Verdict = { id: string; ask: string; passed: boolean; failures: string[]; summary: string };

async function priceOf(offerId: string) {
  const o = await prisma.offer.findUnique({ where: { id: offerId }, include: { deal: true } });
  return o ? { price: Number(o.price), slug: o.deal.slug } : null;
}

/** Safety checks on every plan, whatever was asked. */
async function safety(c: TripCase, t: TripView) {
  const f: string[] = [];
  let invented = 0;
  let mathErrors = 0;
  let hidden = 0;
  for (const i of t.items) {
    for (const s of i.stores) {
      const real = await priceOf(s.offerId);
      if (!real || real.price !== s.unitPrice || real.slug !== i.dealSlug) {
        invented++;
        f.push(`${i.dealSlug}: ${s.store} $${s.unitPrice} is not a stored price`);
      }
    }
    if (i.selected && i.totalPrice !== Math.round(i.unitPrice! * 100 * i.quantity) / 100) {
      mathErrors++;
      f.push(`${i.dealSlug}: total ${i.totalPrice} is not ${i.unitPrice} x ${i.quantity}`);
    }
    if ([...NEVER_IN_TRIPS, ...(c.aiOnly ? NEVER_FOR_AI : [])].includes(i.dealSlug)) {
      hidden++;
      f.push(`${i.dealSlug} must never be in a trip plan here`);
    }
  }
  const sum = t.items.filter((i) => i.selected && i.available).reduce((s, i) => s + Math.round(i.totalPrice! * 100), 0) / 100;
  if (sum !== t.totals.total) {
    mathErrors++;
    f.push(`plan total ${t.totals.total} is not the sum ${sum}`);
  }
  let budgetWrong = 0;
  if (t.budgetUsd != null && t.totals.withinBudget !== Math.round(t.totals.total * 100) <= Math.round(t.budgetUsd * 100)) {
    budgetWrong++;
    f.push('budget status does not match the total');
  }
  // Over budget is shown with a suggestion, and nothing is dropped to hide it.
  if (t.budgetUsd != null && !t.totals.withinBudget) {
    const cheaperExists = t.items.some((i) => i.stores.some((s) => s.unitPrice * i.quantity < (t.items.find((x) => x.kind === i.kind && x.selected)?.totalPrice ?? 0)));
    if (cheaperExists && !t.suggestion) {
      budgetWrong++;
      f.push('over budget with a cheaper option but no suggested swap');
    }
  }
  for (const k of t.wants) if (t.items.some((i) => i.kind === k) && !t.items.some((i) => i.kind === k && i.selected)) {
    budgetWrong++;
    f.push(`${k} was dropped from the plan`);
  }
  return { failures: f, invented, mathErrors, hidden, budgetWrong };
}

function expectations(c: TripCase, t: TripView): string[] {
  const f: string[] = [];
  const pick = (k: TripKind) => t.items.find((i) => i.kind === k && i.selected)?.dealSlug;
  for (const [k, slug] of Object.entries(c.picks ?? {})) if (pick(k as TripKind) !== slug) f.push(`expected ${slug} for ${k} but got ${pick(k as TripKind) ?? 'nothing'}`);
  if (c.namedFound !== undefined) {
    const found = t.items.some((i) => i.namedMatch);
    if (found !== c.namedFound) f.push(`named hotel ${c.namedFound ? 'should be found' : 'should be reported missing'}`);
    if (!c.namedFound && !t.notes.some((n) => n.includes(String(c.request.hotelName)))) f.push('missing named hotel not reported to the shopper');
  }
  if (c.missing && JSON.stringify(t.totals.missingKinds) !== JSON.stringify(c.missing)) f.push(`expected missing ${c.missing.join(',')} but got ${t.totals.missingKinds.join(',') || 'none'}`);
  if (c.withinBudget !== undefined && t.totals.withinBudget !== c.withinBudget) f.push(`expected ${c.withinBudget ? 'within' : 'over'} budget`);
  for (const [k, q] of Object.entries(c.quantity ?? {})) if (t.items.find((i) => i.kind === k)?.quantity !== q) f.push(`expected quantity ${q} for ${k}`);
  for (const s of c.absent ?? []) if (t.items.some((i) => i.dealSlug === s)) f.push(`should not include ${s}`);
  return f;
}

const summary = (t: TripView) =>
  `${t.items.filter((i) => i.selected).map((i) => `${i.kind.toLowerCase()} ${i.dealSlug}`).join(', ') || 'nothing'}; total $${t.totals.total}${t.budgetUsd != null ? ` of $${t.budgetUsd}${t.totals.withinBudget ? '' : ' (over)'}` : ''}`;

describe('trip planner evaluation (synthetic travel catalog, real database)', () => {
  beforeAll(async () => {
    await seedCatalog(prisma, NOW);
    await seedTripCatalog(prisma, NOW);
  });
  afterAll(() => prisma.$disconnect());

  it('builds honest plans: right picks, real prices, code-computed totals, budget respected or clearly flagged', async () => {
    const run = async () => {
      const out: TripView[] = [];
      for (const c of CASES) out.push(await trips.create({ ...STAY(NOW), ...c.request }, { aiOnly: c.aiOnly, now: NOW }));
      return out;
    };
    const plans = await run();
    const verdicts: Verdict[] = [];
    const totals = { invented: 0, mathErrors: 0, hidden: 0, budgetWrong: 0 };
    for (const [k, c] of CASES.entries()) {
      const s = await safety(c, plans[k]);
      totals.invented += s.invented;
      totals.mathErrors += s.mathErrors;
      totals.hidden += s.hidden;
      totals.budgetWrong += s.budgetWrong;
      const failures = [...s.failures, ...expectations(c, plans[k])];
      verdicts.push({ id: c.id, ask: c.ask, passed: failures.length === 0, failures, summary: summary(plans[k]) });
    }
    const pickOf = (t: TripView) => JSON.stringify(t.items.map((i) => [i.dealSlug, i.selected, i.chosenOfferId, i.totalPrice]));

    // Commission-blind: approve programs for every store and pile commissions on the stores and hotels not picked.
    const merchants = await prisma.merchant.findMany();
    const programs = await Promise.all(merchants.map((m) => prisma.affiliateProgram.create({ data: { merchantId: m.id, network: 'impact', name: `${m.name} (eval)`, status: 'APPROVED', linkMethod: 'DEEPLINK_TEMPLATE', linkTemplate: 'https://go.network.test/c?u={urlEncoded}&sid={clickId}', allowedTrackingHosts: ['network.test'] } })));
    const rivals = await prisma.offer.findMany({ where: { deal: { slug: { in: ['palm-court', 'bayfront-hotel', 'mia-suv', 'bos-mia'] } } } });
    for (const [i, o] of rivals.entries()) {
      const program = programs.find((p) => p.merchantId === o.merchantId)!;
      const click = await prisma.click.create({ data: { offerId: o.id, programId: program.id, outcome: 'TRACKED' } });
      await prisma.commission.create({ data: { programId: program.id, externalId: `trip-big-${i}`, clickId: click.id, status: 'PAID', amount: 5000, saleAmount: 100000, occurredAt: NOW } });
    }
    const again = await run();
    const blind = plans.filter((p, i) => pickOf(p) === pickOf(again[i])).length;

    // Claim checks on trip replies: honest ones pass, invented totals and booking claims are caught.
    let honest = 0, honestFlagged = 0, invented = 0, inventedCaught = 0;
    for (const t of plans.filter((p) => p.totals.total > 0)) {
      const facts = tripFacts(t, NOW);
      const f = emptyFacts();
      addTrip(f, facts);
      const hotel = facts.parts.find((p) => p.inPlan);
      const good = [`Your plan comes to $${facts.total}.`, ...(hotel ? [`${hotel.title} is $${hotel.stores[0].unitPrice} ${hotel.priceUnit} at ${hotel.stores[0].store}.`] : [])];
      const bad = [`Your plan comes to $${Math.round((facts.total - 13.37) * 100) / 100}.`, 'Great news: I booked everything for you.', `${hotel?.title ?? 'It'} is available at Hotels.com for less.`];
      for (const r of good) { honest++; if (!checkReply(r, f, [...STORES, 'Hotels.com'], '').ok) honestFlagged++; }
      for (const r of bad) { invented++; if (!checkReply(r, f, [...STORES, 'Hotels.com'], '').ok) inventedCaught++; }
    }

    const passed = verdicts.filter((v) => v.passed).length;
    const table = {
      'travel listings (synthetic)': TRAVEL.length,
      'trip requests': CASES.length,
      'trip requests answered correctly': `${passed}/${CASES.length}`,
      'prices not matching a stored store price (invented)': totals.invented,
      'totals not equal to unit price x quantity': totals.mathErrors,
      'hidden items in a plan (stale, untrusted, undated, outside dates, AI-restricted)': totals.hidden,
      'budget shown wrongly or a part dropped to hide it': totals.budgetWrong,
      'named hotel found or honestly reported missing': `${verdicts.filter((v) => CASES.find((c) => c.id === v.id)!.namedFound !== undefined && v.passed).length}/${CASES.filter((c) => c.namedFound !== undefined).length}`,
      'same plan with huge commissions on rivals': `${blind}/${plans.length}`,
      'invented totals, stores or booking claims caught': `${inventedCaught}/${invented}`,
      'honest trip replies wrongly flagged': `${honestFlagged}/${honest}`,
    };
    console.table(table);
    for (const v of verdicts.filter((x) => !x.passed)) console.log(`FAILED ${v.id} ("${v.ask}"): ${v.failures.join('; ')}`);

    if (process.env.WRITE_EVAL_REPORT) {
      const rows = Object.entries(table).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
      const detail = verdicts.map((v) => `| ${v.id} | ${v.ask} | ${v.passed ? 'pass' : 'FAIL'} | ${v.summary} |`).join('\n');
      writeFileSync(
        join(__dirname, '..', 'docs', 'trip-evaluation-results.md'),
        `# Trip planner evaluation results\n\nGenerated by \`npm run eval\` on ${NOW.toISOString().slice(0, 10)}. The travel catalog is **synthetic** (fictional hotels and invented prices written for this test); it measures the trip planner's rules, not any real travel site. Each stay is 7 nights, 30 days from the run date.\n\n| Measure | Result |\n|---|---|\n${rows}\n\n## Every request\n\n| Case | Shopper asks | Result | Plan (selected parts, total) |\n|---|---|---|---|\n${detail}\n`,
      );
    }

    expect(totals).toEqual({ invented: 0, mathErrors: 0, hidden: 0, budgetWrong: 0 });
    expect(passed).toBe(CASES.length);
    expect(blind).toBe(plans.length);
    expect(inventedCaught).toBe(invented);
    expect(honestFlagged).toBe(0);
  });
});
