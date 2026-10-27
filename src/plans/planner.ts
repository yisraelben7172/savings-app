import { dealFacts } from '../search/facts';
import type { Ranked } from '../search/ranking';
import type { CategorySlug } from '../search/shopping-request';
import type { PlanInput, PlanItemInput } from './plan-input';

/** One product a shopper could pick for an item. Verified facts only: no links and nothing about how a store pays us. */
export type PlanOption = {
  slug: string;
  title: string;
  brand: string | null;
  category: string;
  categorySlug: string;
  store: string;
  price: number; // the cheapest fresh store price for one unit
  priceUnit: string | null; // null = a one-time price per item
  statedDiscountPercent: number | null;
  score: number;
  whyItFits: string[];
  notConfirmed: string[];
  priceCheckedHoursAgo: number;
};

export type PlanItemResult = {
  index: number;
  label: string;
  quantity: number;
  categorySlug: CategorySlug | null; // the category the shopper asked for, used for category budgets
  status: 'matched' | 'no_match';
  chosen: number | null; // index into options
  options: PlanOption[]; // best fit first
  note: string | null;
};

export type BudgetLine = { limit: number; spent: number; remaining: number; over: number };
export type PlanSwap = { index: number; from: string; to: string; saves: number };
export type PlanTotals = {
  total: number; // dollars, only items with a one-time price
  byCategory: Record<string, number>;
  uncounted: { index: number; label: string; price: number; priceUnit: string }[]; // priced per night/day etc.; not added to the total
  totalBudget: BudgetLine | null;
  categoryBudgets: Record<string, BudgetLine>;
  withinBudget: boolean;
};
export type PlanResult = { items: PlanItemResult[]; totals: PlanTotals; swaps: PlanSwap[]; notes: string[] };

export type ItemSearch = { item: PlanItemInput; ranked: Ranked[] };

const cents = (n: number) => Math.round(n * 100);
const dollars = (c: number) => c / 100;

export function toOption(r: Ranked, now: Date): PlanOption {
  const f = dealFacts(r, now);
  const cheapest = f.stores[0];
  return {
    slug: f.slug,
    title: f.title,
    brand: f.brand,
    category: f.category,
    categorySlug: r.candidate.categorySlug,
    store: cheapest.store,
    price: f.bestPrice,
    priceUnit: f.priceUnit,
    statedDiscountPercent: f.statedDiscountPercent,
    score: Math.round(r.score * 1000) / 1000,
    whyItFits: f.whyItFits,
    notConfirmed: f.notConfirmed,
    priceCheckedHoursAgo: cheapest.priceCheckedHoursAgo,
  };
}

const lineCents = (item: PlanItemResult, opt: PlanOption | undefined) => (opt && opt.priceUnit == null ? cents(opt.price) * item.quantity : 0);
const chosenOf = (item: PlanItemResult) => (item.chosen == null ? undefined : item.options[item.chosen]);
/** The category a line counts toward: what the shopper asked for, else the product's own category. */
const categoryOf = (item: PlanItemResult, opt: PlanOption) => item.categorySlug ?? opt.categorySlug;

/** Totals and budget status for the current picks. Pure; used after every change. */
export function summarize(items: PlanItemResult[], input: PlanInput): PlanTotals {
  let total = 0;
  const byCat: Record<string, number> = {};
  const uncounted: PlanTotals['uncounted'] = [];
  for (const it of items) {
    const opt = chosenOf(it);
    if (!opt) continue;
    if (opt.priceUnit != null) {
      uncounted.push({ index: it.index, label: it.label, price: opt.price, priceUnit: opt.priceUnit });
      continue;
    }
    const c = lineCents(it, opt);
    total += c;
    const cat = categoryOf(it, opt);
    byCat[cat] = (byCat[cat] ?? 0) + c;
  }
  const line = (limit: number, spent: number): BudgetLine => ({ limit, spent: dollars(spent), remaining: dollars(Math.max(0, cents(limit) - spent)), over: dollars(Math.max(0, spent - cents(limit))) });
  const totalBudget = input.totalBudget != null ? line(input.totalBudget, total) : null;
  const categoryBudgets: Record<string, BudgetLine> = {};
  for (const [cat, limit] of Object.entries(input.categoryBudgets)) categoryBudgets[cat] = line(limit as number, byCat[cat] ?? 0);
  const withinBudget = (totalBudget ? totalBudget.over === 0 : true) && Object.values(categoryBudgets).every((b) => b.over === 0);
  return {
    total: dollars(total),
    byCategory: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, dollars(v)])),
    uncounted,
    totalBudget,
    categoryBudgets,
    withinBudget,
  };
}

/**
 * Keeps each item's best-fitting pick, then, only while a budget is exceeded, swaps to a cheaper option from the same
 * item's own results: always the swap that gives up the least fit per dollar saved. It never invents a product, never
 * breaks an item's own limits (every option already passed them), and reports honestly if the budget still cannot be met.
 */
export function buildPlan(searches: ItemSearch[], input: PlanInput, now: Date = new Date()): PlanResult {
  const items: PlanItemResult[] = searches.map(({ item, ranked }, index) => {
    const options = ranked.slice(0, 5).map((r) => toOption(r, now));
    return {
      index,
      label: item.label,
      quantity: item.quantity,
      categorySlug: item.request.category ?? null,
      status: options.length ? 'matched' : 'no_match',
      chosen: options.length ? 0 : null,
      options,
      note: options.length ? null : 'Nothing currently matches this request. Try fewer requirements or a higher price limit.',
    };
  });

  const swaps: PlanSwap[] = [];
  const notes: string[] = [];
  const over = (t: PlanTotals) => !t.withinBudget;

  for (let guard = 0; guard < items.length * 5 + 1; guard++) {
    const totals = summarize(items, input);
    if (!over(totals)) break;
    const overCats = new Set(Object.entries(totals.categoryBudgets).filter(([, b]) => b.over > 0).map(([c]) => c));
    const totalOver = (totals.totalBudget?.over ?? 0) > 0;

    let best: { item: PlanItemResult; to: number; saves: number; loss: number } | null = null;
    for (const it of items) {
      const cur = chosenOf(it);
      if (!cur || cur.priceUnit != null) continue; // per-day or per-night items are not part of the totals
      if (!totalOver && !overCats.has(categoryOf(it, cur))) continue;
      const curCents = lineCents(it, cur);
      it.options.forEach((opt, j) => {
        if (j === it.chosen || opt.priceUnit != null) return;
        const saves = curCents - lineCents(it, opt);
        if (saves <= 0) return;
        const loss = Math.max(0, cur.score - opt.score);
        // smaller loss per dollar saved wins; ties go to the larger saving, then the earlier item
        const better = !best || loss / saves < best.loss / best.saves || (loss / saves === best.loss / best.saves && saves > best.saves);
        if (better) best = { item: it, to: j, saves, loss };
      });
    }
    if (!best) break;
    const picked: { item: PlanItemResult; to: number; saves: number } = best;
    swaps.push({ index: picked.item.index, from: chosenOf(picked.item)!.slug, to: picked.item.options[picked.to].slug, saves: dollars(picked.saves) });
    picked.item.chosen = picked.to;
  }

  const totals = summarize(items, input);
  if (swaps.length) notes.push(`To stay closer to your budget we switched ${swaps.length} item${swaps.length === 1 ? '' : 's'} to a cheaper option. You can change any pick.`);
  if (!totals.withinBudget) notes.push('We could not get under every budget using the products currently available that meet your requirements.');
  if (items.some((i) => i.status === 'no_match')) notes.push('Some items had no match and are not included in the total.');
  if (totals.uncounted.length) notes.push('Items priced per night or per day are shown but not added to the total, because the final cost depends on how many you need.');
  return { items, totals, swaps, notes };
}

/** The shopper picked another of an item's own options. Their choice wins, even over budget; totals are recomputed. */
export function selectOption(result: PlanResult, index: number, slug: string, input: PlanInput): PlanResult | null {
  const item = result.items[index];
  const j = item?.options.findIndex((o) => o.slug === slug) ?? -1;
  if (!item || j < 0) return null;
  const items = result.items.map((i) => (i.index === index ? { ...i, chosen: j } : i));
  return { ...result, items, totals: summarize(items, input), notes: result.notes.filter((n) => !n.startsWith('We could not')).concat(summarize(items, input).withinBudget ? [] : ['Your picks are over a budget you set.']) };
}

/** Replaces chosen prices with freshly checked ones (used at approval). Items that are no longer available lose their pick. */
export function applyCurrentPrices(result: PlanResult, current: Map<string, number>, input: PlanInput): { result: PlanResult; changes: { index: number; label: string; slug: string; was: number; now: number | null }[] } {
  const changes: { index: number; label: string; slug: string; was: number; now: number | null }[] = [];
  const items = result.items.map((it) => {
    const opt = chosenOf(it);
    if (!opt) return it;
    const now = current.get(opt.slug);
    if (now === undefined) {
      changes.push({ index: it.index, label: it.label, slug: opt.slug, was: opt.price, now: null });
      return { ...it, chosen: null, status: 'no_match' as const, note: 'This product is no longer available at a verified store.' };
    }
    if (cents(now) === cents(opt.price)) return it;
    changes.push({ index: it.index, label: it.label, slug: opt.slug, was: opt.price, now });
    const options = it.options.map((o, j) => (j === it.chosen ? { ...o, price: now } : o));
    return { ...it, options };
  });
  return { result: { ...result, items, totals: summarize(items, input) }, changes };
}
