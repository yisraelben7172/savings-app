import Anthropic from '@anthropic-ai/sdk';
import { AiUsageService } from '../src/ai/usage.service';
import { AssistantService } from '../src/assistant/assistant.service';
import { DealsService } from '../src/deals/deals.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchService } from '../src/search/search.service';
import { seedCatalog } from './eval/catalog';
import { CASES } from './eval/cases';
import { NEVER } from './eval/cases';

/**
 * LIVE evaluation of the real assistant with the real model. It spends real money (a few cents with a small model),
 * so it only runs when you ask for it:  EVAL_LIVE=1 ANTHROPIC_API_KEY=... npm run test:int -- assistant-live
 * It reuses the synthetic catalog, so it measures behavior (honesty, limits, cost), not real retailer data.
 */
const live = process.env.EVAL_LIVE === '1' && !!process.env.ANTHROPIC_API_KEY;
const run = live ? describe : describe.skip;

run('assistant with the real model (synthetic catalog)', () => {
  const prisma = new PrismaService();
  const search = new SearchService(prisma, new DealsService(prisma));
  const usage = new AiUsageService(prisma);
  const assistant = new AssistantService(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 30_000 }), search, usage, prisma);

  beforeAll(() => seedCatalog(prisma, new Date()));
  afterAll(() => prisma.$disconnect());

  it('answers shopping questions honestly and within limits', async () => {
    const asks = CASES.filter((c) => !c.tier && !c.aiOnly).slice(0, Number(process.env.EVAL_LIVE_QUESTIONS ?? 12));
    const outcomes: Record<string, number> = {};
    let hidden = 0;
    for (const c of asks) {
      const out = await assistant.chat(c.ask);
      for (const d of out.deals) if ([...NEVER.everyone, ...NEVER.freeTier, ...NEVER.ai].includes(d.slug)) hidden++;
      expect(out.reply).not.toMatch(/https?:/);
    }
    const rows = await prisma.aiUsage.findMany();
    for (const r of rows) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    const cost = rows.reduce((s, r) => s + Number(r.costUsd), 0);
    console.table({ questions: asks.length, outcomes: JSON.stringify(outcomes), 'estimated cost (USD)': cost.toFixed(4), 'hidden deals shown': hidden });

    expect(hidden).toBe(0);
    expect(outcomes.blocked_claim ?? 0).toBeLessThanOrEqual(Math.ceil(asks.length * 0.1)); // invented claims should be rare, and are always blocked
  }, 300_000); // each question is a real model call (a few seconds)
});
