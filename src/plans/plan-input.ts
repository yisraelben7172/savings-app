import { CATEGORY_SLUGS, parseShoppingRequest, requestFromText, type CategorySlug, type ShoppingRequest } from '../search/shopping-request';

export const MAX_PLAN_ITEMS = 8;
export const MAX_QUANTITY = 10;
const MAX_BUDGET = 1_000_000;
const OPTIONS_PER_ITEM = 5;

export type PlanItemInput = { label: string; quantity: number; request: ShoppingRequest };
export type CategoryBudgets = Partial<Record<CategorySlug, number>>;
export type PlanInput = { items: PlanItemInput[]; totalBudget?: number; categoryBudgets: CategoryBudgets };
export type PlanParse = { ok: true; value: PlanInput } | { ok: false; errors: string[] };

const label = (v: unknown, fallback: string) => {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return s || fallback.slice(0, 80);
};

function budget(v: unknown, field: string, errors: string[]): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_BUDGET) {
    errors.push(`${field} must be a positive number of US dollars.`);
    return undefined;
  }
  return Math.round(n * 100) / 100;
}

/** One item per line, semicolon, or comma followed by a letter ("$1,200" stays whole). "and" is never a separator. */
export function splitPlanText(text: string): string[] {
  return text
    .split(/[\n;]+|,\s+(?=[a-z])/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Validates a plan request. Accepts `items` (structured, same fields as a shopping request plus optional label and
 * quantity) or `text` (plain language, one item per line). Everything is bounded; nothing here trusts the caller.
 */
export function parsePlanInput(raw: unknown): PlanParse {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['The plan must be an object.'] };
  const r = raw as Record<string, unknown>;

  let rawItems: unknown[] = [];
  if (Array.isArray(r.items)) rawItems = r.items;
  else if (typeof r.text === 'string') rawItems = splitPlanText(r.text.slice(0, 2000)).map((t) => requestFromText(t, OPTIONS_PER_ITEM));
  else errors.push('Provide a list of items or some text with one item per line.');

  if (rawItems.length === 0 && !errors.length) errors.push('Add at least one item.');
  if (rawItems.length > MAX_PLAN_ITEMS) errors.push(`A plan can hold at most ${MAX_PLAN_ITEMS} items.`);

  const items: PlanItemInput[] = [];
  rawItems.slice(0, MAX_PLAN_ITEMS).forEach((it, i) => {
    const n = i + 1;
    if (!it || typeof it !== 'object' || Array.isArray(it)) {
      errors.push(`Item ${n} must be an object.`);
      return;
    }
    const o = it as Record<string, unknown>;
    const parsed = parseShoppingRequest({ ...o, sort: o.sort ?? 'best_match', limit: OPTIONS_PER_ITEM });
    if (!parsed.ok) {
      parsed.errors.forEach((e) => errors.push(`Item ${n}: ${e}`));
      return;
    }
    let quantity = 1;
    if (o.quantity !== undefined && o.quantity !== null) {
      const q = typeof o.quantity === 'number' ? o.quantity : Number.NaN;
      if (!Number.isInteger(q) || q < 1 || q > MAX_QUANTITY) errors.push(`Item ${n}: quantity must be a whole number from 1 to ${MAX_QUANTITY}.`);
      else quantity = q;
    }
    items.push({ label: label(o.label, parsed.value.query || parsed.value.category || `Item ${n}`), quantity, request: { ...parsed.value, limit: OPTIONS_PER_ITEM } });
  });

  const totalBudget = budget(r.totalBudget ?? r.total_budget, 'totalBudget', errors);
  const categoryBudgets: CategoryBudgets = {};
  const cb = r.categoryBudgets ?? r.category_budgets;
  if (cb !== undefined && cb !== null) {
    if (typeof cb !== 'object' || Array.isArray(cb)) errors.push('categoryBudgets must map a category to a dollar amount.');
    else {
      for (const [k, v] of Object.entries(cb as Record<string, unknown>)) {
        if (!(CATEGORY_SLUGS as readonly string[]).includes(k)) errors.push(`Unknown category "${k.slice(0, 30)}" in categoryBudgets.`);
        else {
          const amount = budget(v, `categoryBudgets.${k}`, errors);
          if (amount !== undefined) categoryBudgets[k as CategorySlug] = amount;
        }
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: { items, totalBudget, categoryBudgets } };
}
