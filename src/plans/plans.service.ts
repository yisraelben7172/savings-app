import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { parsePlanInput, type PlanInput } from './plan-input';
import { applyCurrentPrices, buildPlan, selectOption, type ItemSearch, type PlanResult } from './planner';

/** Limits for one run. A plan has at most 8 items, so at most 8 searches plus one budget step. */
export const PLAN_TIMEOUT_MS = 20_000;
export const PLAN_TTL_DAYS = 7;
export const PLAN_ID = /^[a-f0-9]{32}$/;

type StepRecord = { kind: string; outcome: string; summary: string; durationMs: number };

@Injectable()
export class PlansService {
  private readonly log = new Logger(PlansService.name);
  constructor(private readonly prisma: PrismaService, private readonly search: SearchService) {}

  /** Validates and stores a plan in the RUNNING state. Call `execute` (or `start`) to run it. */
  async create(raw: unknown, now = new Date()) {
    const parsed = parsePlanInput(raw);
    if (!parsed.ok) throw new BadRequestException(parsed.errors.join(' '));
    const row = await this.prisma.shoppingPlan.create({
      data: {
        id: randomBytes(16).toString('hex'),
        status: 'RUNNING',
        input: parsed.value as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(now.getTime() + PLAN_TTL_DAYS * 864e5),
      },
    });
    return row.id;
  }

  /** Runs in the background so the request returns at once; the page polls `get`. */
  start(id: string) {
    void this.execute(id).catch((e) => this.log.warn(`Plan ${id.slice(0, 6)} crashed: ${(e as Error).name}`));
  }

  /** One run: a search per item, then the budget step. Checks for cancellation and the time limit before every step. */
  async execute(id: string, now = new Date()) {
    const plan = await this.prisma.shoppingPlan.findUnique({ where: { id } });
    if (!plan || plan.status !== 'RUNNING') return;
    const input = plan.input as unknown as PlanInput;
    const started = Date.now();
    const steps: StepRecord[] = [];
    const searches: ItemSearch[] = [];

    const stop = async (status: 'CANCELLED' | 'FAILED', error?: string) => {
      await this.saveSteps(id, steps);
      if (status === 'FAILED') await this.prisma.shoppingPlan.updateMany({ where: { id, status: 'RUNNING' }, data: { status, error, finishedAt: new Date() } });
    };

    try {
      for (const [i, item] of input.items.entries()) {
        const current = await this.prisma.shoppingPlan.findUnique({ where: { id }, select: { status: true } });
        if (current?.status !== 'RUNNING') return stop('CANCELLED');
        if (Date.now() - started > PLAN_TIMEOUT_MS) return stop('FAILED', 'timeout');
        const t0 = Date.now();
        const found = await this.search.search(item.request, { now });
        searches.push({ item, ranked: found.map((f) => f.ranked) });
        steps.push({
          kind: 'search',
          outcome: found.length ? 'ok' : 'no_match',
          summary: `Item ${i + 1} "${item.label}": ${found.length ? `${found.length} match${found.length === 1 ? '' : 'es'}` : 'no match'}`,
          durationMs: Date.now() - t0,
        });
      }
      const t0 = Date.now();
      const result = buildPlan(searches, input, now);
      steps.push({
        kind: 'fit_budget',
        outcome: 'ok',
        summary: result.swaps.length ? `Switched ${result.swaps.length} item(s) to cheaper options` : input.totalBudget != null || Object.keys(input.categoryBudgets).length ? 'No changes needed for the budget' : 'No budget set',
        durationMs: Date.now() - t0,
      });
      const { count } = await this.prisma.shoppingPlan.updateMany({
        where: { id, status: 'RUNNING' }, // a cancel that landed meanwhile wins
        data: { status: 'READY', result: result as unknown as Prisma.InputJsonValue, finishedAt: new Date() },
      });
      if (count === 0) return stop('CANCELLED');
      await this.saveSteps(id, steps);
    } catch (e) {
      steps.push({ kind: 'search', outcome: 'error', summary: 'The run stopped because of an error.', durationMs: 0 });
      this.log.warn(`Plan ${id.slice(0, 6)} failed: ${(e as Error).name}`);
      await stop('FAILED', 'error');
    }
  }

  private async saveSteps(id: string, steps: StepRecord[]) {
    if (!steps.length) return;
    await this.prisma.planStep.createMany({ data: steps.map((s, position) => ({ planId: id, position, ...s })) });
  }

  async get(id: string) {
    if (!PLAN_ID.test(id)) throw new NotFoundException('Plan not found.');
    const plan = await this.prisma.shoppingPlan.findUnique({ where: { id }, include: { steps: { orderBy: { position: 'asc' } } } });
    if (!plan || plan.expiresAt < new Date()) throw new NotFoundException('Plan not found or expired.');
    return {
      id: plan.id,
      status: plan.status,
      version: plan.version,
      error: plan.error,
      createdAt: plan.createdAt,
      finishedAt: plan.finishedAt,
      approvedAt: plan.approvedAt,
      expiresAt: plan.expiresAt,
      input: plan.input as unknown as PlanInput,
      result: (plan.result as unknown as PlanResult | null) ?? null,
      steps: plan.steps.map((s) => ({ kind: s.kind, outcome: s.outcome, summary: s.summary, durationMs: s.durationMs })),
    };
  }

  /** Stops a run that is still going, or withdraws a plan that is waiting for approval. An approved plan can't be cancelled. */
  async cancel(id: string) {
    await this.get(id);
    const { count } = await this.prisma.shoppingPlan.updateMany({ where: { id, status: { in: ['RUNNING', 'READY'] } }, data: { status: 'CANCELLED', finishedAt: new Date() } });
    if (count === 0) {
      const now = await this.get(id);
      if (now.status !== 'CANCELLED') throw new ConflictException('This plan can no longer be cancelled.');
    }
    return this.get(id);
  }

  /** The shopper picks another of an item's own options. They must name the version they were looking at. */
  async select(id: string, body: { index?: unknown; slug?: unknown; version?: unknown }) {
    const plan = await this.get(id);
    if (plan.status !== 'READY' || !plan.result) throw new ConflictException('Only a plan that is ready for review can be changed.');
    if (body.version !== plan.version) throw new ConflictException('This plan changed. Reload it and try again.');
    if (!Number.isInteger(body.index) || typeof body.slug !== 'string') throw new BadRequestException('Provide the item number and the product to switch to.');
    const next = selectOption(plan.result, body.index as number, body.slug, plan.input);
    if (!next) throw new BadRequestException('That product is not one of the options for this item.');
    const { count } = await this.prisma.shoppingPlan.updateMany({
      where: { id, status: 'READY', version: plan.version },
      data: { result: next as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
    });
    if (count === 0) throw new ConflictException('This plan changed. Reload it and try again.');
    return this.get(id);
  }

  /**
   * Approval locks in what the shopper reviewed. Before it does, every chosen price is checked again: if anything
   * changed or sold out the plan is updated, NOT approved, and the shopper reviews it again.
   */
  async approve(id: string, body: { version?: unknown }, now = new Date()) {
    const plan = await this.get(id);
    if (plan.status !== 'READY' || !plan.result) throw new ConflictException('Only a plan that is ready for review can be approved.');
    if (body.version !== plan.version) throw new ConflictException('This plan changed. Reload it and review it again.');
    if (!plan.result.items.some((i) => i.chosen != null)) throw new BadRequestException('There is nothing in this plan to approve.');

    const t0 = Date.now();
    const slugs = plan.result.items.flatMap((i) => (i.chosen == null ? [] : [i.options[i.chosen].slug]));
    const current = await this.search.currentBestPrices(slugs, { now });
    const { result, changes } = applyCurrentPrices(plan.result, current, plan.input);
    const step: StepRecord = {
      kind: 'recheck',
      outcome: changes.length ? 'error' : 'ok',
      summary: changes.length ? `${changes.length} price(s) changed or sold out; plan updated, not approved` : 'All prices still current; approved',
      durationMs: Date.now() - t0,
    };

    if (changes.length) {
      const { count } = await this.prisma.shoppingPlan.updateMany({
        where: { id, status: 'READY', version: plan.version },
        data: { result: result as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      if (count === 1) await this.prisma.planStep.create({ data: { planId: id, position: plan.steps.length, ...step } });
      throw new ConflictException({ message: 'Some prices changed since this plan was made, so it was updated. Please review it again.', changes, plan: await this.get(id) });
    }
    const { count } = await this.prisma.shoppingPlan.updateMany({ where: { id, status: 'READY', version: plan.version }, data: { status: 'APPROVED', approvedAt: now } });
    if (count === 0) throw new ConflictException('This plan changed. Reload it and review it again.');
    await this.prisma.planStep.create({ data: { planId: id, position: plan.steps.length, ...step } });
    return this.get(id);
  }

  /** Every minute: a run that has been RUNNING far longer than the limit was interrupted (for example by a restart). */
  @Cron('* * * * *')
  async sweepInterrupted() {
    try {
      const cutoff = new Date(Date.now() - PLAN_TIMEOUT_MS * 2);
      await this.prisma.shoppingPlan.updateMany({ where: { status: 'RUNNING', createdAt: { lt: cutoff } }, data: { status: 'FAILED', error: 'interrupted', finishedAt: new Date() } });
    } catch (e) {
      this.log.warn(`Plan sweep failed: ${(e as Error).message}`);
    }
  }

  /** Daily: expired plans are deleted (their steps go with them). */
  @Cron('45 3 * * *', { timeZone: 'America/New_York' })
  async purgeExpired() {
    try {
      const { count } = await this.prisma.shoppingPlan.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      if (count) this.log.log(`Deleted ${count} expired shopping plans`);
    } catch (e) {
      this.log.warn(`Plan purge failed: ${(e as Error).message}`);
    }
  }
}
