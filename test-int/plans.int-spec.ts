import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DealsService } from '../src/deals/deals.service';
import { PlansController } from '../src/plans/plans.controller';
import { PlansService, PLAN_TIMEOUT_MS } from '../src/plans/plans.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchService } from '../src/search/search.service';
import { seedCatalog } from './eval/catalog';

const prisma = new PrismaService();
const search = new SearchService(prisma, new DealsService(prisma));
const plans = new PlansService(prisma, search);
const NOW = new Date();

const ITEMS = [
  { query: 'wireless headphones', category: 'electronics', label: 'Headphones' },
  { query: 'desk lamp', category: 'home', label: 'Lamp' },
];
async function readyPlan(extra: object = {}) {
  const id = await plans.create({ items: ITEMS, ...extra }, NOW);
  await plans.execute(id, NOW);
  return plans.get(id);
}

describe('shopping plans (real database)', () => {
  beforeAll(() => seedCatalog(prisma, NOW));
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  it('runs one search per item, records the steps, and ends READY with totals', async () => {
    const plan = await readyPlan({ totalBudget: 1000 });
    expect(plan.status).toBe('READY');
    expect(plan.steps.map((s) => s.kind)).toEqual(['search', 'search', 'fit_budget']);
    expect(plan.result!.items.every((i) => i.status === 'matched')).toBe(true);
    expect(plan.result!.totals.total).toBeGreaterThan(0);
    expect(plan.result!.totals.withinBudget).toBe(true);
    // facts only: no store links and nothing about how stores pay us
    expect(JSON.stringify(plan.result)).not.toMatch(/https?:|affiliate|commission|offerId|\/go\//i);
  });

  it('only offers products the shopper could see: not stale, out of stock, unapproved, Gold-only or AI-restricted', async () => {
    const plan = await readyPlan();
    const slugs = plan.result!.items.flatMap((i) => i.options.map((o) => o.slug));
    for (const hidden of ['stale-blender', 'oos-air-fryer', 'shady-laptop', 'gold-headphones', 'off-speaker']) expect(slugs).not.toContain(hidden);
  });

  it('refuses invalid input before storing anything', async () => {
    const before = await prisma.shoppingPlan.count();
    await expect(plans.create({ items: [] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(plans.create({ items: [{ query: 'lamp', quantity: 99 }] })).rejects.toThrow(/quantity/);
    expect(await prisma.shoppingPlan.count()).toBe(before);
  });

  it('plan ids are unguessable and unknown, malformed or expired ids are not found', async () => {
    const id = await plans.create({ items: ITEMS }, NOW);
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    await expect(plans.get('nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(plans.get('0'.repeat(32))).rejects.toBeInstanceOf(NotFoundException);
    await prisma.shoppingPlan.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(plans.get(id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await plans.purgeExpired()).toBeUndefined();
    expect(await prisma.shoppingPlan.findUnique({ where: { id } })).toBeNull();
  });

  it('stops when the run takes longer than the limit and says so', async () => {
    const id = await plans.create({ items: ITEMS }, NOW);
    const start = Date.now();
    let calls = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => start + (calls++ > 2 ? PLAN_TIMEOUT_MS + 1 : 0));
    await plans.execute(id, NOW);
    jest.restoreAllMocks();
    const plan = await plans.get(id);
    expect(plan.status).toBe('FAILED');
    expect(plan.error).toBe('timeout');
  });

  it('cancelling during a run stops it before the next step and nothing is overwritten', async () => {
    const id = await plans.create({ items: ITEMS }, NOW);
    const real = search.search.bind(search);
    let n = 0;
    jest.spyOn(search, 'search').mockImplementation(async (...a) => {
      const r = await real(...a);
      if (++n === 1) await plans.cancel(id);
      return r;
    });
    await plans.execute(id, NOW);
    const plan = await plans.get(id);
    expect(plan.status).toBe('CANCELLED');
    expect(plan.result).toBeNull();
    expect(n).toBe(1); // the second item was never searched
  });

  it('a run that crashes ends FAILED with a short class, no message content', async () => {
    const id = await plans.create({ items: ITEMS }, NOW);
    jest.spyOn(search, 'search').mockRejectedValue(new Error('secret connection string'));
    await plans.execute(id, NOW);
    const plan = await plans.get(id);
    expect(plan.status).toBe('FAILED');
    expect(plan.error).toBe('error');
    expect(JSON.stringify(plan)).not.toMatch(/secret/);
  });

  it('interrupted runs are marked FAILED by the sweeper', async () => {
    const id = await plans.create({ items: ITEMS }, NOW);
    await prisma.shoppingPlan.update({ where: { id }, data: { createdAt: new Date(Date.now() - PLAN_TIMEOUT_MS * 3) } });
    await plans.sweepInterrupted();
    expect(await plans.get(id)).toMatchObject({ status: 'FAILED', error: 'interrupted' });
  });

  it('cancelling a ready plan works; an approved plan cannot be cancelled', async () => {
    const a = await readyPlan();
    expect((await plans.cancel(a.id)).status).toBe('CANCELLED');
    const b = await readyPlan();
    await plans.approve(b.id, { version: b.version }, NOW);
    await expect(plans.cancel(b.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('switching to another option updates totals and bumps the version; stale versions are refused', async () => {
    const plan = await readyPlan();
    const item = plan.result!.items[0];
    expect(item.options.length).toBeGreaterThan(1);
    const other = item.options.find((_, j) => j !== item.chosen)!;
    const next = await plans.select(plan.id, { index: 0, slug: other.slug, version: plan.version });
    expect(next.version).toBe(plan.version + 1);
    expect(next.result!.items[0].options[next.result!.items[0].chosen!].slug).toBe(other.slug);
    await expect(plans.select(plan.id, { index: 0, slug: other.slug, version: plan.version })).rejects.toBeInstanceOf(ConflictException);
    await expect(plans.select(plan.id, { index: 0, slug: 'sony-wh1000xm5-nope', version: next.version })).rejects.toBeInstanceOf(BadRequestException);
    await expect(plans.select(plan.id, { index: 'x', slug: other.slug, version: next.version })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approval re-checks prices: unchanged approves, changed updates the plan and does NOT approve', async () => {
    const plan = await readyPlan();
    const chosen = plan.result!.items[0].options[plan.result!.items[0].chosen!];
    await expect(plans.approve(plan.id, { version: plan.version + 5 }, NOW)).rejects.toBeInstanceOf(ConflictException);

    // the store changes its price after the plan was made
    await prisma.offer.updateMany({ where: { deal: { slug: chosen.slug } }, data: { price: { increment: 10 } } });
    let err: ConflictException | undefined;
    await plans.approve(plan.id, { version: plan.version }, NOW).catch((e) => (err = e));
    expect(err).toBeInstanceOf(ConflictException);
    const body = err!.getResponse() as { changes: { slug: string; was: number; now: number }[]; plan: { status: string; version: number } };
    expect(body.changes[0]).toMatchObject({ slug: chosen.slug, was: chosen.price, now: chosen.price + 10 });
    expect(body.plan.status).toBe('READY');
    expect(body.plan.version).toBe(plan.version + 1);

    // reviewing the updated plan and approving again works, and records the re-check
    const fresh = await plans.get(plan.id);
    const approved = await plans.approve(plan.id, { version: fresh.version }, NOW);
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.steps.filter((s) => s.kind === 'recheck').map((s) => s.outcome)).toEqual(['error', 'ok']);
    await expect(plans.approve(plan.id, { version: approved.version }, NOW)).rejects.toBeInstanceOf(ConflictException); // only once
    await prisma.offer.updateMany({ where: { deal: { slug: chosen.slug } }, data: { price: { decrement: 10 } } }); // restore
  });

  it('a pick that disappears before approval is removed, not silently approved', async () => {
    const plan = await readyPlan();
    const lamp = plan.result!.items[1].options[plan.result!.items[1].chosen!];
    await prisma.offer.updateMany({ where: { deal: { slug: lamp.slug } }, data: { inStock: false } });
    let err: ConflictException | undefined;
    await plans.approve(plan.id, { version: plan.version }, NOW).catch((e) => (err = e));
    const body = err!.getResponse() as { changes: { now: number | null }[]; plan: { result: { items: { chosen: number | null }[] } } };
    expect(body.changes.some((c) => c.now === null)).toBe(true);
    expect(body.plan.result.items[1].chosen).toBeNull();
    await prisma.offer.updateMany({ where: { deal: { slug: lamp.slug } }, data: { inStock: true } });
  });

  it('the controller creates, starts in the background, and returns the plan to poll', async () => {
    const controller = new PlansController(plans);
    const created = await controller.create({ items: ITEMS });
    expect(created.status).toBe('RUNNING');
    for (let i = 0; i < 50 && (await controller.get(created.id)).status === 'RUNNING'; i++) await new Promise((r) => setTimeout(r, 100));
    expect((await controller.get(created.id)).status).toBe('READY');
  });
});
