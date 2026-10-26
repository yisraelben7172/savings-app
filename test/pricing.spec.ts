import { dailyBudgetUsd, estimateCost, priceFor, supportsEffort } from '../src/ai/pricing';

const usage = (over: Partial<Parameters<typeof estimateCost>[1]> = {}) => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, ...over });

describe('AI cost estimates', () => {
  it('prices input and output tokens per million', () => {
    expect(estimateCost('claude-haiku-4-5', usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }), {})).toEqual({ costUsd: 6, priceKnown: true });
    expect(estimateCost('claude-haiku-5-5', usage({ inputTokens: 10_000, outputTokens: 2_000 }), {})).toEqual({ costUsd: 0.002, priceKnown: true });
    expect(estimateCost('claude-opus-5-5', usage({ inputTokens: 1_000_000, outputTokens: 100_000 }), {}).costUsd).toBe(6);
  });

  it('prices cache reads and writes', () => {
    // opus 5.5: reads $0.20/M, writes 1.25x input = $5/M
    expect(estimateCost('claude-opus-5-5', usage({ cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 }), {}).costUsd).toBe(5.2);
    // haiku 4.5: reads default to 0.1x input
    expect(estimateCost('claude-haiku-4-5', usage({ cacheReadTokens: 1_000_000 }), {}).costUsd).toBe(0.1);
  });

  it('costs an unknown model at the highest tier so a spending cap cannot be undercut', () => {
    expect(priceFor('claude-brand-new', {})).toEqual({ price: { input: 10, output: 50 }, known: false });
    expect(estimateCost('claude-brand-new', usage({ inputTokens: 1_000_000 }), {})).toEqual({ costUsd: 10, priceKnown: false });
  });

  it('lets the owner override both prices', () => {
    const env = { AI_PRICE_INPUT_PER_MTOK: '2', AI_PRICE_OUTPUT_PER_MTOK: '8' } as NodeJS.ProcessEnv;
    expect(estimateCost('claude-brand-new', usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }), env)).toEqual({ costUsd: 10, priceKnown: true });
    expect(priceFor('claude-haiku-4-5', { AI_PRICE_INPUT_PER_MTOK: '2' } as NodeJS.ProcessEnv).price.input).toBe(1); // both or neither
  });

  it('only sends effort to models that accept it', () => {
    for (const m of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']) expect(supportsEffort(m)).toBe(true);
    for (const m of ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8']) expect(supportsEffort(m)).toBe(false);
  });

  it('reads the daily budget, defaulting to $5 and allowing 0 to switch the AI off', () => {
    expect(dailyBudgetUsd({} as NodeJS.ProcessEnv)).toBe(5);
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: '12.5' } as NodeJS.ProcessEnv)).toBe(12.5);
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: '0' } as NodeJS.ProcessEnv)).toBe(0);
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: '-3' } as NodeJS.ProcessEnv)).toBe(5);
    expect(dailyBudgetUsd({ AI_DAILY_BUDGET_USD: 'lots' } as NodeJS.ProcessEnv)).toBe(5);
  });
});
