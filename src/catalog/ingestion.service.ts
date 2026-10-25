import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type HealthStatus, type RunStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { cardPrices, staleAfter, trustedOffer } from '../deals/trust';
import { PrismaService } from '../prisma/prisma.service';
import type { AdapterContext, NormalizedOffer, RowError } from './adapter';
import { csvRecords } from './csv';
import { CsvFeedAdapter } from './csv-feed.adapter';
import { brandKey, mpnKey, slugify } from './normalize';

type Tx = Prisma.TransactionClient;
type UpsertResult = { result: 'created' | 'updated' | 'unchanged'; dealIds: string[] };

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;
const CONCURRENCY = 4;
const STUCK_RUN_MS = 30 * 60_000;
const TRANSIENT = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034', 'P2002']);

/** Retries transient database errors (and unique-key races between parallel rows) with backoff. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 100): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (i >= attempts - 1 || !code || !TRANSIENT.has(code)) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
}

/** Runs `fn` over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Imports authorized product data. Idempotent: re-running the same file creates nothing new
 * (offers are keyed by source + retailer SKU, products by GTIN or brand + MPN).
 */
@Injectable()
export class IngestionService {
  private readonly log = new Logger(IngestionService.name);
  private readonly csv = new CsvFeedAdapter();

  constructor(private readonly prisma: PrismaService) {}

  async importCsv(sourceId: string, csv: string, trigger = 'admin-upload') {
    if (Buffer.byteLength(csv) > MAX_FILE_BYTES) throw new BadRequestException('The file is larger than 5 MB.');
    const source = await this.prisma.dataSource.findUnique({ where: { id: sourceId }, include: { merchant: true } });
    if (!source) throw new NotFoundException('Source not found');
    if (source.kind !== 'CSV_FEED') throw new BadRequestException('This source is not a CSV feed.');
    if (source.status !== 'ACTIVE') throw new BadRequestException('This source is not active. Record its permission details and activate it first.');
    if (!source.merchant) throw new BadRequestException('Link this source to a store first.');

    const { headers, records } = csvRecords(csv);
    const cols = CsvFeedAdapter.mapHeaders(headers, source.config as never);
    const missing = ['sku', 'title', 'url', 'category'].filter((f) => !cols[f]).concat(cols.price || cols.sale_price ? [] : ['price']);
    if (!records.length) throw new BadRequestException('The file has no product rows.');
    if (missing.length) throw new BadRequestException(`Missing columns: ${missing.join(', ')}. Found: ${headers.join(', ') || 'none'}.`);
    if (records.length > MAX_ROWS) throw new BadRequestException(`Too many rows (${records.length}); the limit is ${MAX_ROWS} per file.`);

    const running = await this.prisma.ingestionRun.findFirst({ where: { sourceId, status: 'RUNNING', startedAt: { gt: new Date(Date.now() - STUCK_RUN_MS) } } });
    if (running) throw new ConflictException('An import for this source is already running.');

    const run = await this.prisma.ingestionRun.create({
      data: { sourceId, trigger, fileHash: createHash('sha256').update(csv).digest('hex') },
    });
    const now = new Date();
    const counts = { rowsRead: 0, created: 0, updated: 0, unchanged: 0, rejected: 0, markedOut: 0 };
    const errors: RowError[] = [];

    try {
      const ctx: AdapterContext = {
        source, merchant: source.merchant, now,
        categories: new Set((await this.prisma.category.findMany({ select: { slug: true } })).map((c) => c.slug)),
      };
      const valid: { line: number; rec: NormalizedOffer }[] = [];
      const seen = new Set<string>();
      for await (const page of this.csv.pages({ csv })) {
        for (const row of page) {
          counts.rowsRead++;
          const n = this.csv.normalize(row, ctx);
          if ('error' in n) {
            errors.push(n.error);
            continue;
          }
          const key = n.ok.retailerSku.toLowerCase();
          if (seen.has(key)) {
            errors.push({ row: row.line, code: 'DUPLICATE_SKU', message: `SKU ${n.ok.retailerSku} appears more than once; the first row was used.` });
            continue;
          }
          seen.add(key);
          valid.push({ line: row.line, rec: n.ok });
        }
      }

      const touched = new Set<string>();
      const categoryIds = new Map((await this.prisma.category.findMany()).map((c) => [c.slug, c.id]));
      await mapLimit(valid, CONCURRENCY, async ({ line, rec }) => {
        try {
          const r = await withRetry(() => this.prisma.$transaction((tx) => this.upsertOne(tx, ctx, rec, categoryIds.get(rec.categorySlug)!)));
          counts[r.result]++;
          r.dealIds.forEach((d) => touched.add(d));
        } catch (e) {
          this.log.warn(`Row ${line} failed: ${(e as Error).message}`);
          errors.push({ row: line, code: 'SAVE_FAILED', message: 'Could not be saved. It will be retried on the next import.' });
        }
      });
      counts.rejected = errors.length;

      // A full snapshot means anything not in this file is no longer sold. Skip if the file looks broken.
      if (source.fullSnapshot && valid.length > 0 && counts.rejected / Math.max(1, counts.rowsRead) <= 0.5) {
        const gone = await this.prisma.offer.findMany({
          where: { sourceId, inStock: true, retailerSku: { notIn: [...valid.map((v) => v.rec.retailerSku)] } },
          select: { id: true, dealId: true },
        });
        if (gone.length) {
          await this.prisma.offer.updateMany({ where: { id: { in: gone.map((g) => g.id) } }, data: { inStock: false } });
          gone.forEach((g) => touched.add(g.dealId));
          counts.markedOut = gone.length;
        }
      }

      for (const dealId of touched) await this.recomputeDeal(dealId);
      await this.applyRetention(sourceId, source.retentionDays);

      const saved = counts.created + counts.updated + counts.unchanged;
      const status: RunStatus = saved === 0 ? 'FAILED' : counts.rejected ? 'PARTIAL' : 'SUCCEEDED';
      return await this.finish(run.id, source.id, source.merchant.id, status, counts, errors);
    } catch (e) {
      this.log.error(`Import ${run.id} failed: ${(e as Error).message}`);
      errors.push({ row: 0, code: 'IMPORT_FAILED', message: 'The import stopped unexpectedly. Nothing after the error was saved; try again.' });
      return this.finish(run.id, source.id, source.merchant.id, 'FAILED', counts, errors);
    }
  }

  private async finish(runId: string, sourceId: string, merchantId: string, status: RunStatus, counts: Record<string, number>, errors: RowError[]) {
    const health: HealthStatus = status === 'SUCCEEDED' ? 'HEALTHY' : status === 'PARTIAL' ? 'DEGRADED' : 'FAILING';
    const note = status === 'SUCCEEDED' ? null : `${counts.rejected} of ${counts.rowsRead} rows rejected in the last import.`;
    const now = new Date();
    const [run] = await this.prisma.$transaction([
      this.prisma.ingestionRun.update({
        where: { id: runId },
        data: { ...counts, status, errors: errors.slice(0, 200) as unknown as Prisma.InputJsonValue, finishedAt: now },
      }),
      this.prisma.dataSource.update({ where: { id: sourceId }, data: { lastRunAt: now, health, healthNote: note } }),
      this.prisma.merchant.update({
        where: { id: merchantId },
        data: { health, healthNote: note, ...(status !== 'FAILED' ? { lastSyncAt: now, integrationType: 'FEED' } : {}) },
      }),
    ]);
    return run;
  }

  /** Product (by identifiers only) → its deal → this retailer's offer, plus a price-history point when the price changes. */
  private async upsertOne(tx: Tx, ctx: AdapterContext, rec: NormalizedOffer, categoryId: string): Promise<UpsertResult> {
    const sourceId = ctx.source.id;
    const merchantId = ctx.merchant.id;
    const bKey = brandKey(rec.brand);
    const mKey = mpnKey(rec.mpn);

    const existingOffer = await tx.offer.findUnique({
      where: { sourceId_retailerSku: { sourceId, retailerSku: rec.retailerSku } },
      include: { deal: { select: { productId: true } } },
    });

    // Never match on title: only GTIN, brand + MPN, or this source's own SKU.
    let product =
      (rec.gtin && (await tx.product.findUnique({ where: { gtin: rec.gtin } }))) ||
      (bKey && mKey && (await tx.product.findFirst({ where: { brandKey: bKey, mpnKey: mKey } }))) ||
      (existingOffer?.deal.productId && (await tx.product.findUnique({ where: { id: existingOffer.deal.productId } }))) ||
      null;

    if (!product) {
      product = await tx.product.create({
        data: {
          title: rec.title, brand: rec.brand, brandKey: bKey, mpn: rec.mpn, mpnKey: mKey && bKey ? mKey : null, gtin: rec.gtin,
          categoryId, description: rec.description, imageUrl: rec.imageUrl, attributes: rec.attributes ?? undefined,
        },
      });
    } else {
      // Fill gaps only; never overwrite what another source already established.
      const fill: Prisma.ProductUpdateInput = {};
      if (!product.brand && rec.brand) Object.assign(fill, { brand: rec.brand, brandKey: bKey });
      if (!product.mpn && rec.mpn && bKey) Object.assign(fill, { mpn: rec.mpn, mpnKey: mKey });
      if (!product.gtin && rec.gtin) fill.gtin = rec.gtin;
      if (!product.description && rec.description) fill.description = rec.description;
      if (!product.imageUrl && rec.imageUrl) fill.imageUrl = rec.imageUrl;
      if (Object.keys(fill).length) product = await tx.product.update({ where: { id: product.id }, data: fill });
    }

    const deal =
      (await tx.deal.findUnique({ where: { productId: product.id } })) ??
      (await tx.deal.create({
        data: {
          slug: `${slugify(product.title)}-${product.id.slice(-6)}`,
          productId: product.id, title: product.title, categoryId: product.categoryId, imageUrl: product.imageUrl,
          originalPrice: rec.listPrice ?? rec.price, bestPrice: rec.price,
          discountPct: rec.listPrice ? Math.round(((rec.listPrice - rec.price) / rec.listPrice) * 100) : 0,
        },
      }));

    const data = {
      dealId: deal.id, merchantId, sourceId, retailerSku: rec.retailerSku,
      price: rec.price, listPrice: rec.listPrice, currency: rec.currency, url: rec.url, deliveryNote: rec.deliveryNote,
      inStock: rec.inStock, condition: rec.condition,
      lastCheckedAt: rec.checkedAt, staleAfter: staleAfter(rec.checkedAt, ctx.source.priceFreshnessHours),
    };
    // The same store may already list this product from another source: take it over rather than duplicate it.
    const current = existingOffer ?? (await tx.offer.findUnique({ where: { dealId_merchantId: { dealId: deal.id, merchantId } } }));
    const dealIds = [deal.id];
    let result: UpsertResult['result'];
    let priceChanged: boolean;

    if (current) {
      priceChanged = Number(current.price) !== rec.price;
      const changed =
        priceChanged || current.dealId !== deal.id || current.url !== rec.url || current.inStock !== rec.inStock ||
        (current.listPrice == null ? null : Number(current.listPrice)) !== rec.listPrice ||
        current.deliveryNote !== rec.deliveryNote || current.condition !== rec.condition;
      if (current.dealId !== deal.id) dealIds.push(current.dealId);
      await tx.offer.update({ where: { id: current.id }, data });
      result = changed ? 'updated' : 'unchanged';
    } else {
      await tx.offer.create({ data: { ...data, speedRank: 5 } });
      priceChanged = true;
      result = 'created';
    }
    if (priceChanged) {
      await tx.priceHistory.create({ data: { dealId: deal.id, price: rec.price, sourceId, merchantId, recordedAt: rec.checkedAt } });
    }
    return { result, dealIds };
  }

  /** Stores the deal's prices from the offers shown right now (used for sorting and filtering). */
  async recomputeDeal(dealId: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId }, include: { offers: { where: trustedOffer(), select: { price: true, listPrice: true } } } });
    if (!deal) return;
    const p = cardPrices(deal.offers, { originalPrice: Number(deal.originalPrice), isLegacyDemo: !deal.productId });
    if (p) await this.prisma.deal.update({ where: { id: dealId }, data: { bestPrice: p.bestPrice, originalPrice: p.originalPrice, discountPct: p.discountPct } });
  }

  /** Deletes price history older than the source's retention period (agreements can limit how long we keep data). */
  async applyRetention(sourceId: string, retentionDays: number | null) {
    if (!retentionDays) return 0;
    const { count } = await this.prisma.priceHistory.deleteMany({ where: { sourceId, recordedAt: { lt: new Date(Date.now() - retentionDays * 864e5) } } });
    return count;
  }
}
