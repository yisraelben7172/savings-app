import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dailyBudgetUsd, type Usage } from './pricing';

export type UsageOutcome = 'ok' | 'fallback_nokey' | 'fallback_budget' | 'fallback_error' | 'blocked_claim' | 'refusal' | 'limit';

export type UsageEntry = Usage & {
  kind: 'assistant';
  model: string;
  outcome: UsageOutcome;
  turns: number;
  toolCalls: number;
  costUsd: number;
  priceKnown: boolean;
  latencyMs: number;
  error?: string;
};

const DAY = 864e5;

@Injectable()
export class AiUsageService {
  private readonly log = new Logger(AiUsageService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Records one run. Never throws: a logging problem must not break the shopper's answer. */
  async record(e: UsageEntry): Promise<void> {
    try {
      await this.prisma.aiUsage.create({
        data: {
          kind: e.kind, model: e.model.slice(0, 80), outcome: e.outcome, turns: e.turns, toolCalls: e.toolCalls,
          inputTokens: e.inputTokens, outputTokens: e.outputTokens, cacheReadTokens: e.cacheReadTokens, cacheWriteTokens: e.cacheWriteTokens,
          costUsd: e.costUsd, priceKnown: e.priceKnown, latencyMs: e.latencyMs, error: e.error?.slice(0, 80),
        },
      });
    } catch (err) {
      this.log.warn(`Could not record AI usage: ${(err as Error).message}`);
    }
  }

  async spentLast24h(now = new Date()): Promise<number> {
    const r = await this.prisma.aiUsage.aggregate({ where: { createdAt: { gte: new Date(now.getTime() - DAY) } }, _sum: { costUsd: true } });
    return Number(r._sum.costUsd ?? 0);
  }

  /** True while the last 24 hours of AI spend are under the daily budget. If the check itself fails, stay on the safe side. */
  async withinBudget(now = new Date()): Promise<boolean> {
    const budget = dailyBudgetUsd();
    if (budget <= 0) return false;
    try {
      return (await this.spentLast24h(now)) < budget;
    } catch (err) {
      this.log.warn(`Budget check failed, using keyword search: ${(err as Error).message}`);
      return false;
    }
  }

  async summary(now = new Date()) {
    const windows = { last24h: 1, last7d: 7, last30d: 30 };
    const out: Record<string, unknown> = {};
    for (const [name, days] of Object.entries(windows)) {
      const since = new Date(now.getTime() - days * DAY);
      const [agg, byOutcome, slow] = await Promise.all([
        this.prisma.aiUsage.aggregate({
          where: { createdAt: { gte: since } },
          _count: true,
          _sum: { costUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, toolCalls: true },
          _avg: { latencyMs: true },
        }),
        this.prisma.aiUsage.groupBy({ by: ['outcome'], where: { createdAt: { gte: since } }, _count: true }),
        this.prisma.$queryRaw<{ p95: number | null }[]>`SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95 FROM "AiUsage" WHERE "createdAt" >= ${since} AND outcome = 'ok'`,
      ]);
      out[name] = {
        runs: agg._count,
        costUsd: Number(agg._sum.costUsd ?? 0),
        inputTokens: agg._sum.inputTokens ?? 0,
        outputTokens: agg._sum.outputTokens ?? 0,
        toolCalls: agg._sum.toolCalls ?? 0,
        avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
        p95LatencyMs: slow[0]?.p95 == null ? null : Math.round(Number(slow[0].p95)),
        outcomes: Object.fromEntries(byOutcome.map((o) => [o.outcome, o._count])),
      };
    }
    const budget = dailyBudgetUsd();
    const spent = await this.spentLast24h(now);
    return { budgetUsd: budget, spentLast24hUsd: spent, remainingUsd: Math.max(0, budget - spent), priceNote: 'Costs are estimates from published rates, not an invoice.', ...out };
  }
}
