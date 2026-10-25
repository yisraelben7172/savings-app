import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AffiliateStatus, IntegrationType, Prisma, SourceKind } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min } from 'class-validator';
import { AdminGuard } from '../admin/admin.guard';
import { isLinkOnMerchantDomain, trustedOffer } from '../deals/trust';
import { PrismaService } from '../prisma/prisma.service';
import { PERMITTABLE_FIELDS, REQUIRED_FIELDS } from './adapter';
import { IngestionService } from './ingestion.service';

/** Source kinds Vault can actually import today. Others can be recorded but not activated. */
export const IMPORTABLE_KINDS: SourceKind[] = ['CSV_FEED'];

class RetailerDto {
  @IsString() @MaxLength(80) name!: string;
  @Matches(/^[a-z0-9-]{2,40}$/) slug!: string;
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/, { message: 'domain must look like store.com' }) domain!: string;
  @IsString() @MaxLength(40) network!: string;
}

class RetailerPatchDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() approved?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) trustScore?: number;
  @IsOptional() @IsString() @MaxLength(40) network?: string;
  @IsOptional() @IsIn(Object.values(IntegrationType)) integrationType?: IntegrationType;
  @IsOptional() @IsIn(Object.values(AffiliateStatus)) affiliateStatus?: AffiliateStatus;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) supportedCategories?: string[];
  @IsOptional() @IsString() @MaxLength(80) linkCapability?: string;
  @IsOptional() @IsString() @MaxLength(4000) complianceNotes?: string;
}

class SourceDto {
  @IsString() @MaxLength(120) name!: string;
  @IsIn(Object.values(SourceKind).filter((k) => k !== 'DEMO')) kind!: SourceKind;
  @IsOptional() @IsString() merchantId?: string;
}

class SourcePatchDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() merchantId?: string;
  @IsOptional() @IsString() @MaxLength(300) accessMethod?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) agreementUrl?: string;
  @IsOptional() @IsString() @MaxLength(4000) permissionNotes?: string;
  @IsOptional() @IsArray() @IsIn(PERMITTABLE_FIELDS as unknown as string[], { each: true }) allowedFields?: string[];
  @IsOptional() @IsBoolean() aiUseAllowed?: boolean;
  @IsOptional() @IsString() @MaxLength(200) attributionText?: string;
  @IsOptional() @IsInt() @Min(1) @Max(720) priceFreshnessHours?: number;
  @IsOptional() @IsInt() @Min(1) @Max(3650) retentionDays?: number | null;
  @IsOptional() @IsBoolean() fullSnapshot?: boolean;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

class ActivateDto {
  @IsString() @MaxLength(80) approvedBy!: string;
}

@Controller('admin')
@UseGuards(AdminGuard)
export class CatalogAdminController {
  constructor(private readonly prisma: PrismaService, private readonly ingestion: IngestionService) {}

  // ---------- retailers ----------

  @Get('retailers')
  async retailers() {
    const now = new Date();
    const [rows, shown] = await Promise.all([
      this.prisma.merchant.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { offers: true, sources: true } } } }),
      this.prisma.offer.groupBy({ by: ['merchantId'], where: trustedOffer(now), _count: true }),
    ]);
    const shownBy = new Map(shown.map((s) => [s.merchantId, s._count]));
    return rows.map((m) => ({ ...m, offerCount: m._count.offers, sourceCount: m._count.sources, shownOffers: shownBy.get(m.id) ?? 0 }));
  }

  @Post('retailers')
  createRetailer(@Body() dto: RetailerDto) {
    // New stores start unapproved with no trust: nothing from them shows until the owner approves them.
    return this.prisma.merchant.create({ data: { ...dto, trustScore: 0, approved: false } });
  }

  @Patch('retailers/:id')
  updateRetailer(@Param('id') id: string, @Body() dto: RetailerPatchDto) {
    return this.prisma.merchant.update({ where: { id }, data: dto });
  }

  // ---------- data sources ----------

  @Get('sources')
  async sources() {
    const now = new Date();
    const rows = await this.prisma.dataSource.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: { merchant: { select: { id: true, name: true, domain: true } }, _count: { select: { offers: true } } },
    });
    const stale = await this.prisma.offer.groupBy({ by: ['sourceId'], where: { inStock: true, staleAfter: { lt: now } }, _count: true });
    const staleBy = new Map(stale.map((s) => [s.sourceId, s._count]));
    return rows.map((s) => ({ ...s, offerCount: s._count.offers, staleOffers: staleBy.get(s.id) ?? 0, importable: IMPORTABLE_KINDS.includes(s.kind) }));
  }

  @Get('sources/:id')
  async source(@Param('id') id: string) {
    const s = await this.prisma.dataSource.findUnique({
      where: { id },
      include: { merchant: true, runs: { orderBy: { startedAt: 'desc' }, take: 20 } },
    });
    if (!s) throw new NotFoundException('Source not found');
    return { ...s, importable: IMPORTABLE_KINDS.includes(s.kind), permittableFields: PERMITTABLE_FIELDS };
  }

  @Post('sources')
  createSource(@Body() dto: SourceDto) {
    // Every new source starts as awaiting approval: no data is collected until its permission is recorded.
    return this.prisma.dataSource.create({ data: { ...dto, status: 'AWAITING_APPROVAL', allowedFields: [...REQUIRED_FIELDS] } });
  }

  @Patch('sources/:id')
  async updateSource(@Param('id') id: string, @Body() dto: SourcePatchDto) {
    const s = await this.prisma.dataSource.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Source not found');
    if (s.kind === 'DEMO') throw new BadRequestException('The demo source cannot be edited.');
    const { config, ...rest } = dto;
    return this.prisma.dataSource.update({
      where: { id },
      data: { ...rest, ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}) },
    });
  }

  /** Turns a source on only when its permission record is complete and Vault can import its kind. */
  @Post('sources/:id/activate')
  async activate(@Param('id') id: string, @Body() dto: ActivateDto) {
    const s = await this.prisma.dataSource.findUnique({ where: { id }, include: { merchant: true } });
    if (!s) throw new NotFoundException('Source not found');
    const problems: string[] = [];
    if (!IMPORTABLE_KINDS.includes(s.kind)) problems.push(`Vault has no importer for ${s.kind} sources yet`);
    if (!s.accessMethod?.trim()) problems.push('describe how the data is provided (access method)');
    if (!s.agreementUrl && !s.permissionNotes?.trim()) problems.push('link the agreement or note what was agreed');
    for (const f of REQUIRED_FIELDS) if (!s.allowedFields.includes(f)) problems.push(`the agreement must allow "${f}"`);
    if (s.kind === 'CSV_FEED' && !s.merchant) problems.push('link the feed to a store');
    if (problems.length) throw new BadRequestException(`Can't activate yet: ${problems.join('; ')}.`);
    return this.prisma.dataSource.update({ where: { id }, data: { status: 'ACTIVE', approvedAt: new Date(), approvedBy: dto.approvedBy } });
  }

  @Post('sources/:id/pause')
  pause(@Param('id') id: string) {
    return this.prisma.dataSource.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'PAUSED' } });
  }

  /** Disabled sources' offers disappear from the site immediately (the trust gate excludes them). */
  @Post('sources/:id/disable')
  disable(@Param('id') id: string) {
    return this.prisma.dataSource.updateMany({ where: { id, kind: { not: 'DEMO' } }, data: { status: 'DISABLED' } });
  }

  /** Body: the CSV file as text/csv (parsed by a route-specific 5 MB parser in main.ts). */
  @Post('sources/:id/import')
  async importFeed(@Param('id') id: string, @Body() body: unknown) {
    if (typeof body !== 'string' || !body.trim()) throw new BadRequestException('Send the CSV file as text/csv.');
    return this.ingestion.importCsv(id, body);
  }

  // ---------- catalog health ----------

  @Get('catalog/health')
  async health() {
    const now = new Date();
    const [products, noIds, legacyDeals, offers, shown, stale, outOfStock, dupes, linkRows] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({ where: { gtin: null, mpnKey: null } }),
      this.prisma.deal.count({ where: { productId: null } }),
      this.prisma.offer.count(),
      this.prisma.offer.count({ where: trustedOffer(now) }),
      this.prisma.offer.count({ where: { inStock: true, staleAfter: { lt: now } } }),
      this.prisma.offer.count({ where: { inStock: false } }),
      // Possible duplicates for a human to review: same brand and same simplified title. Never merged automatically.
      this.prisma.$queryRaw<{ brand: string | null; ids: string[]; titles: string[] }[]>`
        SELECT "brandKey" AS brand, array_agg(id) AS ids, array_agg(title) AS titles FROM "Product"
        GROUP BY "brandKey", lower(regexp_replace(title, '[^a-zA-Z0-9]', '', 'g'))
        HAVING count(*) > 1 LIMIT 50`,
      this.prisma.offer.findMany({ take: 5000, select: { id: true, url: true, merchant: { select: { name: true, domain: true } } } }),
    ]);
    const invalidLinks = linkRows.filter((o) => !isLinkOnMerchantDomain(o.url, o.merchant.domain)).map((o) => ({ id: o.id, store: o.merchant.name, url: o.url }));
    return { products, productsWithoutIdentifiers: noIds, legacyDemoDeals: legacyDeals, offers, shownOffers: shown, staleOffers: stale, outOfStock, duplicateCandidates: dupes, invalidLinks };
  }
}
