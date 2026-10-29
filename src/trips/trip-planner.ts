import { nightsBetween, TRIP_KINDS, type TripInput, type TripKind } from './trip-input';

/**
 * Trip planning rules, as pure functions. Inputs are verified facts only (store, price, stated terms, when the price
 * was checked); nothing here knows how a store pays us, so it cannot rank or pick by it. All money is computed here
 * in whole cents, never by the model.
 */
export type StoreOption = {
  offerId: string;
  store: string;
  storeSlug: string;
  unitPrice: number; // per night, per rental day, or per traveler for a round trip
  cancellationText: string | null; // only what the source states
  priceCheckedAt: string; // ISO time
};

/** One search result for one part of the trip, best fit first (the search ranking's own order). */
export type TripCandidate = { kind: TripKind; dealSlug: string; title: string; stores: StoreOption[] };

export type ItemView = {
  id: string;
  kind: TripKind;
  dealSlug: string;
  title: string;
  namedMatch: boolean;
  selected: boolean;
  available: boolean;
  unitLabel: 'night' | 'day' | 'trip';
  quantity: number;
  chosenOfferId: string | null;
  stores: StoreOption[]; // cheapest first
};

export type BudgetLine = { limit: number; spent: number; remaining: number; over: number };
export type TripTotals = { total: number; budget: BudgetLine | null; withinBudget: boolean; missingKinds: TripKind[] };
export type Swap = { kind: TripKind; fromItemId: string; toItemId: string; toOfferId: string; title: string; store: string; saves: number; withinBudgetAfter: boolean };

export const OPTIONS_PER_KIND = 3; // the pick plus up to 2 alternatives
export const UNIT: Record<TripKind, ItemView['unitLabel']> = { HOTEL: 'night', CAR: 'day', FLIGHT: 'trip' };
const KIND_WORD: Record<TripKind, string> = { HOTEL: 'hotel', CAR: 'car rental', FLIGHT: 'flight' };

export const cents = (n: number) => Math.round(n * 100);
const dollars = (c: number) => c / 100;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text: string, w: string) => new RegExp(`(^|[^a-z0-9])${esc(w)}($|[^a-z0-9])`, 'i').test(text);

/** Nights for a hotel, rental days for a car (at least 1), travelers for a flight (each pays one round trip). */
export function quantityFor(kind: TripKind, input: Pick<TripInput, 'startDate' | 'endDate' | 'adults' | 'children'>): number {
  if (kind === 'FLIGHT') return input.adults + input.children;
  return Math.max(1, nightsBetween(input.startDate, input.endDate));
}

const GENERIC_NAME = new Set(['hotel', 'hotels', 'resort', 'resorts', 'inn', 'suites', 'suite', 'the', 'and', 'spa', 'motel', 'lodge']);
/** The words that identify a named hotel ("the Fontainebleau" -> ["fontainebleau"]). */
export const nameWords = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC_NAME.has(w));
/** A listing is the named hotel only if every identifying word of the name is in its title. Never a fuzzy guess. */
export function matchesName(title: string, name: string): boolean {
  const words = nameWords(name);
  return words.length > 0 && words.every((w) => hasWord(title, w));
}

const byPrice = (a: StoreOption, b: StoreOption) => a.unitPrice - b.unitPrice || a.store.localeCompare(b.store);
const chosenStore = (it: ItemView) => (it.chosenOfferId == null ? undefined : it.stores.find((s) => s.offerId === it.chosenOfferId));

/** unit price x quantity for the item's chosen store, in cents (0 if nothing usable is chosen). */
export function lineCents(it: ItemView): number {
  const s = chosenStore(it);
  return it.available && s ? cents(s.unitPrice) * it.quantity : 0;
}

/**
 * Builds the first version of the plan: for each part, the best-fitting result (or the named hotel when it was found)
 * at its cheapest store, plus up to 2 alternatives. Nothing is dropped or swapped to meet the budget: an over-budget
 * plan is shown as over budget, with a suggested swap.
 */
export function buildTrip(input: TripInput, found: Partial<Record<TripKind, TripCandidate[]>>): { items: ItemView[]; notes: string[] } {
  const items: ItemView[] = [];
  const notes: string[] = [];
  for (const kind of TRIP_KINDS) {
    if (!input.wants.includes(kind)) continue;
    const all = (found[kind] ?? []).filter((c) => c.stores.length > 0);
    let picks = all.slice(0, OPTIONS_PER_KIND);
    let named: TripCandidate | undefined;
    if (kind === 'HOTEL' && input.hotelName) {
      named = all.find((c) => matchesName(c.title, input.hotelName!));
      if (named) picks = [named, ...all.filter((c) => c !== named).slice(0, OPTIONS_PER_KIND - 1)];
      else notes.push(`We couldn't find "${input.hotelName}" at a verified store for these dates.${picks.length ? ` Here ${picks.length === 1 ? 'is another hotel' : 'are other hotels'} in ${input.destination}.` : ''}`);
    }
    if (!picks.length) {
      notes.push(`No ${KIND_WORD[kind]} from a verified store matches${kind === 'FLIGHT' ? ` ${input.originAirport} to ${input.destination}` : ` ${input.destination}`} for these dates.`);
      continue;
    }
    picks.forEach((c, i) => {
      const stores = [...c.stores].sort(byPrice);
      items.push({
        id: `${kind}:${c.dealSlug}`,
        kind,
        dealSlug: c.dealSlug,
        title: c.title,
        namedMatch: c === named,
        selected: i === 0,
        available: true,
        unitLabel: UNIT[kind],
        quantity: quantityFor(kind, input),
        chosenOfferId: stores[0].offerId,
        stores,
      });
    });
  }
  if (items.some((i) => i.kind === 'HOTEL')) notes.push('Hotel prices are for one room.');
  return { items, notes };
}

/** Totals for the selected items and how they compare to the budget. Pure; run after every change. */
export function tripTotals(items: ItemView[], budgetUsd: number | null | undefined, wants: TripKind[]): TripTotals {
  const total = items.filter((i) => i.selected).reduce((sum, i) => sum + lineCents(i), 0);
  const budget = budgetUsd == null ? null : {
    limit: budgetUsd,
    spent: dollars(total),
    remaining: dollars(Math.max(0, cents(budgetUsd) - total)),
    over: dollars(Math.max(0, total - cents(budgetUsd))),
  };
  const missingKinds = wants.filter((k) => !items.some((i) => i.kind === k && i.selected && i.available && chosenStore(i)));
  return { total: dollars(total), budget, withinBudget: budget ? budget.over === 0 : true, missingKinds };
}

/**
 * Over budget: the cheapest swap, meaning the one change (another store, or an alternative for the same part) that
 * lowers the total the most. It is only suggested, never applied. Null when within budget or nothing is cheaper.
 */
export function suggestSwap(items: ItemView[], budgetUsd: number | null | undefined): Swap | null {
  if (budgetUsd == null) return null;
  const total = items.filter((i) => i.selected).reduce((s, i) => s + lineCents(i), 0);
  const limit = cents(budgetUsd);
  if (total <= limit) return null;
  let best: (Swap & { savesCents: number }) | null = null;
  for (const cur of items.filter((i) => i.selected)) {
    const curCents = lineCents(cur);
    for (const alt of items.filter((i) => i.kind === cur.kind && i.available)) {
      for (const s of alt.stores) {
        const savesCents = curCents - cents(s.unitPrice) * alt.quantity;
        if (savesCents <= 0 || (alt.id === cur.id && s.offerId === cur.chosenOfferId)) continue;
        const fits = total - savesCents <= limit;
        if (!best || savesCents > best.savesCents) best = { kind: cur.kind, fromItemId: cur.id, toItemId: alt.id, toOfferId: s.offerId, title: alt.title, store: s.store, saves: dollars(savesCents), withinBudgetAfter: fits, savesCents };
      }
    }
  }
  if (!best) return null;
  const { savesCents: _unused, ...swap } = best;
  return swap;
}

/** The shopper picks a store for an item, or an alternative (with one of its stores). Returns null if the offer isn't one of the item's own. */
export function selectOffer(items: ItemView[], itemId: string, offerId: string): ItemView[] | null {
  const target = items.find((i) => i.id === itemId);
  if (!target || !target.available || !target.stores.some((s) => s.offerId === offerId)) return null;
  return items.map((i) => (i.id === itemId ? { ...i, selected: true, chosenOfferId: offerId } : i.kind === target.kind ? { ...i, selected: false } : i));
}

export type PriceChange = { itemId: string; kind: TripKind; title: string; store: string; was: number; now: number | null };

/**
 * Approval re-check. `current` holds the price found now for each chosen offer (missing = no longer offered by a
 * trusted store for these dates). Returns the updated items and every difference; any difference means "ask again".
 */
export function applyRecheck(items: ItemView[], current: Map<string, { price: number; checkedAt: Date }>): { items: ItemView[]; changes: PriceChange[] } {
  const changes: PriceChange[] = [];
  const next = items.map((it) => {
    const s = chosenStore(it);
    if (!it.selected || !s) return it;
    const now = current.get(s.offerId);
    if (!now) {
      changes.push({ itemId: it.id, kind: it.kind, title: it.title, store: s.store, was: s.unitPrice, now: null });
      return { ...it, available: false };
    }
    const stores = it.stores.map((o) => (o.offerId === s.offerId ? { ...o, unitPrice: now.price, priceCheckedAt: now.checkedAt.toISOString() } : o));
    if (cents(now.price) !== cents(s.unitPrice)) changes.push({ itemId: it.id, kind: it.kind, title: it.title, store: s.store, was: s.unitPrice, now: now.price });
    return { ...it, stores };
  });
  return { items: next, changes };
}
