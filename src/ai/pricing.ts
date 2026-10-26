/**
 * Estimated cost of a Claude call, in US dollars per million tokens. These are Anthropic's published first-party
 * rates as listed in the Claude API reference on 2026-10-06; they can change, so costs here are ESTIMATES for budgeting
 * and alerts, not an invoice. Override both with AI_PRICE_INPUT_PER_MTOK and AI_PRICE_OUTPUT_PER_MTOK to match your
 * plan. A model that isn't in the table is costed at the highest tier so a spending cap can never be undercut.
 */
export type ModelPrice = { input: number; output: number; cacheRead?: number };

export const PRICES: Record<string, ModelPrice> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-mythos-5-1': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 }, // for prompts up to 100K tokens
  'claude-haiku-4-5': { input: 1, output: 5 },
};

const HIGHEST: ModelPrice = { input: 10, output: 50 };

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

export function priceFor(model: string, env: NodeJS.ProcessEnv = process.env): { price: ModelPrice; known: boolean } {
  const i = Number(env.AI_PRICE_INPUT_PER_MTOK);
  const o = Number(env.AI_PRICE_OUTPUT_PER_MTOK);
  if (Number.isFinite(i) && Number.isFinite(o) && i > 0 && o > 0) return { price: { input: i, output: o }, known: true };
  const p = PRICES[model];
  return p ? { price: p, known: true } : { price: HIGHEST, known: false };
}

export function estimateCost(model: string, u: Usage, env: NodeJS.ProcessEnv = process.env) {
  const { price, known } = priceFor(model, env);
  const read = price.cacheRead ?? price.input * 0.1;
  const write = price.input * 1.25;
  const usd = (u.inputTokens * price.input + u.outputTokens * price.output + u.cacheReadTokens * read + u.cacheWriteTokens * write) / 1_000_000;
  return { costUsd: Math.round(usd * 1e6) / 1e6, priceKnown: known };
}

/** The `effort` setting exists on the 5.x models and errors on older ones (e.g. Haiku 4.5), so only send it where supported. */
export const supportsEffort = (model: string) => /^claude-(opus|sonnet|haiku|fable|mythos)-5/.test(model);

/** Daily AI budget in USD (rolling 24 hours). 0 turns the AI off and uses keyword search only. */
export function dailyBudgetUsd(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.AI_DAILY_BUDGET_USD);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}
