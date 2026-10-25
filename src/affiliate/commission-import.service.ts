import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { csvRecords } from '../catalog/csv';
import { mapLimit, withRetry } from '../catalog/ingestion.service';
import { PrismaService } from '../prisma/prisma.service';
import { mapReportHeaders, parseReportRow, STATUS_RANK, type ReportConfig, type ReportRow } from './commission-report';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;

/**
 * Imports a network's commission report (CSV). Only amounts the network reports are stored, never estimates.
 * Idempotent: each row is keyed by program + the network's transaction ID, so re-importing a report (or a newer
 * one that repeats old rows) updates rows instead of duplicating them. A status never moves backwards
 * (paid stays paid; reversed is final), so an older report can't undo a newer one.
 */
@Injectable()
export class CommissionImportService {
  private readonly log = new Logger(CommissionImportService.name);
  constructor(private readonly prisma: PrismaService) {}

  async importCsv(programId: string, csv: string) {
    if (Buffer.byteLength(csv) > MAX_BYTES) throw new BadRequestException('The file is larger than 5 MB.');
    const program = await this.prisma.affiliateProgram.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException('Program not found');
    const config = (program.reportConfig as ReportConfig) ?? null;

    const { headers, records } = csvRecords(csv);
    const cols = mapReportHeaders(headers, config);
    const missing = ['id', 'commission', 'date'].filter((f) => !cols[f]);
    if (!records.length) throw new BadRequestException('The report has no rows.');
    if (missing.length) throw new BadRequestException(`Missing columns: ${missing.join(', ')}. Found: ${headers.join(', ') || 'none'}. You can map your report's column names on the program page.`);
    if (records.length > MAX_ROWS) throw new BadRequestException(`Too many rows (${records.length}); the limit is ${MAX_ROWS} per file.`);

    const now = new Date();
    const errors: { row: number; code: string; message: string }[] = [];
    const rows: { line: number; r: ReportRow }[] = [];
    const seen = new Set<string>();
    for (const rec of records) {
      const parsed = parseReportRow(rec.data, cols, config, now);
      if ('error' in parsed) {
        errors.push({ row: rec.line, ...parsed.error });
        continue;
      }
      if (seen.has(parsed.ok.externalId)) {
        errors.push({ row: rec.line, code: 'DUPLICATE_ID', message: `Transaction ${parsed.ok.externalId} appears more than once; the first row was used.` });
        continue;
      }
      seen.add(parsed.ok.externalId);
      rows.push({ line: rec.line, r: parsed.ok });
    }

    // Tie rows back to our own clicks through the sub-ID (only this program's clicks).
    const subIds = [...new Set(rows.map((x) => x.r.subId).filter((s): s is string => !!s))];
    const clickIds = new Set(
      subIds.length ? (await this.prisma.click.findMany({ where: { id: { in: subIds }, programId }, select: { id: true } })).map((c) => c.id) : [],
    );

    const imp = await this.prisma.commissionImport.create({ data: { programId, fileHash: createHash('sha256').update(csv).digest('hex') } });
    const counts = { created: 0, updated: 0, unchanged: 0, matched: 0 };

    await mapLimit(rows, 4, async ({ line, r }) => {
      try {
        const clickId = r.subId && clickIds.has(r.subId) ? r.subId : null;
        const result = await withRetry(() => this.prisma.$transaction((tx) => this.upsert(tx, programId, imp.id, r, clickId)));
        counts[result]++;
        if (clickId) counts.matched++;
      } catch (e) {
        this.log.warn(`Commission row ${line} failed: ${(e as Error).message}`);
        errors.push({ row: line, code: 'SAVE_FAILED', message: 'Could not be saved. Re-importing the file will retry it.' });
      }
    });

    return this.prisma.commissionImport.update({
      where: { id: imp.id },
      data: { rowsRead: records.length, ...counts, rejected: errors.length, errors: errors.slice(0, 200) as unknown as Prisma.InputJsonValue },
    });
  }

  private async upsert(
    tx: Prisma.TransactionClient,
    programId: string,
    importId: string,
    r: ReportRow,
    clickId: string | null,
  ): Promise<'created' | 'updated' | 'unchanged'> {
    const existing = await tx.commission.findUnique({ where: { programId_externalId: { programId, externalId: r.externalId } } });
    if (!existing) {
      await tx.commission.create({ data: { programId, importId, clickId, ...r } });
      return 'created';
    }
    // Never move a status backwards; amounts may still correct themselves while the status stays.
    const status = STATUS_RANK[r.status] >= STATUS_RANK[existing.status] ? r.status : existing.status;
    const same =
      status === existing.status && Number(existing.amount) === r.amount &&
      (existing.saleAmount == null ? null : Number(existing.saleAmount)) === r.saleAmount && (existing.clickId ?? null) === (clickId ?? existing.clickId);
    if (same) return 'unchanged';
    await tx.commission.update({
      where: { id: existing.id },
      data: { status, amount: r.amount, saleAmount: r.saleAmount, subId: r.subId ?? existing.subId, clickId: clickId ?? existing.clickId, importId },
    });
    return 'updated';
  }
}
