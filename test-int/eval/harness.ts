import { checkReply, addDeal, emptyFacts } from '../../src/ai/claim-check';
import { dealFacts, type DealFacts } from '../../src/search/facts';
import type { SearchService } from '../../src/search/search.service';
import { parseShoppingRequest } from '../../src/search/shopping-request';
import { STORES } from './catalog';
import { CASES, NEVER, type EvalCase } from './cases';

export type CaseRun = { id: string; slugs: string[]; facts: DealFacts[]; categories: string[] };

export async function runCase(search: SearchService, c: EvalCase, now: Date): Promise<CaseRun> {
  const parsed = parseShoppingRequest({ limit: 8, ...c.request });
  if (!parsed.ok) throw new Error(`Case ${c.id}: ${parsed.errors.join(' ')}`);
  const results = await search.search(parsed.value, { tier: c.tier ?? 'free', aiOnly: c.aiOnly ?? false, now });
  return { id: c.id, slugs: results.map((r) => r.ranked.candidate.slug), facts: results.map((r) => dealFacts(r.ranked, now)), categories: results.map((r) => r.card.category.slug) };
}

export async function runAll(search: SearchService, now: Date) {
  const out: CaseRun[] = [];
  for (const c of CASES) out.push(await runCase(search, c, now));
  return out;
}

const words = (s: string) => s.toLowerCase();
const has = (text: string, term: string) => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text);

/** Hard limits checked against the facts of EVERY result: any miss is a constraint violation. */
export function violations(c: EvalCase, run: CaseRun): string[] {
  const r = c.request as { max_price?: number; min_price?: number; category?: string; brands?: string[]; excluded_terms?: string[] };
  const bad: string[] = [];
  run.facts.forEach((f, i) => {
    if (r.max_price !== undefined && f.bestPrice > r.max_price) bad.push(`${f.slug}: $${f.bestPrice} is over the $${r.max_price} budget`);
    if (r.min_price !== undefined && f.bestPrice < r.min_price) bad.push(`${f.slug}: $${f.bestPrice} is under the $${r.min_price} minimum`);
    if (r.category && run.categories[i] !== r.category) bad.push(`${f.slug}: category ${run.categories[i]} is not ${r.category}`);
    if (r.brands?.length && !r.brands.some((b) => has(`${f.brand ?? ''} ${f.title}`, b))) bad.push(`${f.slug}: brand ${f.brand ?? 'unknown'} is not one of ${r.brands.join(', ')}`);
    for (const t of r.excluded_terms ?? []) if (has(`${f.title} ${f.brand ?? ''}`, t)) bad.push(`${f.slug}: mentions excluded "${t}"`);
  });
  return bad;
}

export function invariantViolations(c: EvalCase, run: CaseRun): string[] {
  const banned = [...NEVER.everyone, ...((c.tier ?? 'free') === 'free' ? NEVER.freeTier : []), ...(c.aiOnly ? NEVER.ai : [])];
  return run.slugs.filter((s) => banned.includes(s)).map((s) => `${s} must never be shown here`);
}

export type CaseVerdict = { id: string; ask: string; passed: boolean; failures: string[]; results: string[] };

export function judge(c: EvalCase, run: CaseRun): CaseVerdict {
  const f: string[] = [...violations(c, run), ...invariantViolations(c, run)];
  const slugs = run.slugs;
  for (const s of c.include ?? []) if (!slugs.includes(s)) f.push(`missing ${s}`);
  for (const s of c.exclude ?? []) if (slugs.includes(s)) f.push(`should not include ${s}`);
  if (c.exact && (c.exact.length !== slugs.length || !c.exact.every((s) => slugs.includes(s)))) f.push(`expected exactly [${c.exact.join(', ')}] but got [${slugs.join(', ')}]`);
  if (c.top && slugs[0] !== c.top) f.push(`expected ${c.top} first but got ${slugs[0] ?? 'nothing'}`);
  for (const [a, b] of c.before ?? []) {
    const ia = slugs.indexOf(a);
    const ib = slugs.indexOf(b);
    if (ia === -1 || ib === -1 || ia > ib) f.push(`expected ${a} above ${b}`);
  }
  if (c.empty && slugs.length) f.push(`expected no results but got [${slugs.join(', ')}]`);
  return { id: c.id, ask: c.ask, passed: f.length === 0, failures: f, results: slugs };
}

/** Replies the assistant might write: some honest, some inventing a price, a discount or a store. */
export function claimProbes(runs: CaseRun[]) {
  const probes: { reply: string; shouldPass: boolean; facts: DealFacts[]; user: string }[] = [];
  for (const run of runs.filter((r) => r.facts.length).slice(0, 14)) {
    const top = run.facts[0];
    const stores = top.stores.map((s) => s.store);
    const stranger = STORES.find((s) => !stores.includes(s)) ?? 'Costco';
    const honest = [`${top.title} is $${top.bestPrice} at ${stores[0]}.`];
    if (top.stores.length > 1 && top.stores[1].price > top.bestPrice) honest.push(`${stores[0]} has it at $${top.bestPrice}, $${Math.round((top.stores[1].price - top.bestPrice) * 100) / 100} less than ${stores[1]}.`);
    if (top.storeStatedListPrice != null && top.statedDiscountPercent != null) honest.push(`The store lists it at $${top.storeStatedListPrice}, so $${top.bestPrice} is ${top.statedDiscountPercent}% below that.`);
    const dishonest = [
      `${top.title} is only $${Math.round((top.bestPrice - 0.37) * 100) / 100} right now.`,
      `You'll find ${top.title} at ${stranger} for $${top.bestPrice}.`,
      `That is ${(top.statedDiscountPercent ?? 20) + 17}% off the usual price.`,
    ];
    for (const reply of honest) probes.push({ reply, shouldPass: true, facts: run.facts, user: '' });
    for (const reply of dishonest) probes.push({ reply, shouldPass: false, facts: run.facts, user: '' });
  }
  return probes;
}

export function scoreClaims(runs: CaseRun[]) {
  const probes = claimProbes(runs);
  let badCaught = 0, bad = 0, goodFlagged = 0, good = 0;
  const missed: string[] = [];
  const wronglyFlagged: string[] = [];
  for (const p of probes) {
    const f = emptyFacts();
    p.facts.forEach((d) => addDeal(f, d));
    const ok = checkReply(p.reply, f, STORES, p.user).ok;
    if (p.shouldPass) {
      good++;
      if (!ok) {
        goodFlagged++;
        wronglyFlagged.push(p.reply);
      }
    } else {
      bad++;
      if (!ok) badCaught++;
      else missed.push(p.reply);
    }
  }
  return { honestReplies: good, honestFlagged: goodFlagged, inventedReplies: bad, inventedCaught: badCaught, missed, wronglyFlagged };
}

export function summarize(runs: CaseRun[]) {
  const verdicts = CASES.map((c) => judge(c, runs.find((r) => r.id === c.id)!));
  const sum = (f: (c: EvalCase, r: CaseRun) => number) => CASES.reduce((n, c) => n + f(c, runs.find((r) => r.id === c.id)!), 0);
  const includes = CASES.reduce((n, c) => n + (c.include?.length ?? 0) + (c.exact?.length ?? 0), 0);
  const found = sum((c, r) => [...(c.include ?? []), ...(c.exact ?? [])].filter((s) => r.slugs.includes(s)).length);
  const tops = CASES.filter((c) => c.top);
  const pairs = CASES.reduce((n, c) => n + (c.before?.length ?? 0), 0);
  const pairsOk = sum((c, r) => (c.before ?? []).filter(([a, b]) => r.slugs.includes(a) && r.slugs.includes(b) && r.slugs.indexOf(a) < r.slugs.indexOf(b)).length);
  const empties = CASES.filter((c) => c.empty);
  return {
    verdicts,
    cases: CASES.length,
    casesPassed: verdicts.filter((v) => v.passed).length,
    hardConstraintViolations: sum((c, r) => violations(c, r).length),
    neverShownViolations: sum((c, r) => invariantViolations(c, r).length),
    expectedFound: `${found}/${includes}`,
    recall: includes ? found / includes : 1,
    top1: tops.length ? tops.filter((c) => runs.find((r) => r.id === c.id)!.slugs[0] === c.top).length / tops.length : 1,
    orderingPairs: `${pairsOk}/${pairs}`,
    emptyAnswersCorrect: `${empties.filter((c) => runs.find((r) => r.id === c.id)!.slugs.length === 0).length}/${empties.length}`,
  };
}
