import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { LinkMethod, Prisma, ProgramStatus } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import { AdminGuard } from '../admin/admin.guard';
import { isLinkOnMerchantDomain } from '../deals/trust';
import { PrismaService } from '../prisma/prisma.service';
import { validateBookingFormat } from '../trips/trip-links';
import { CommissionImportService } from './commission-import.service';
import { buildTrackedUrl, cleanHosts, validateLinkConfig } from './link-builder';

class ProgramDto {
  @IsString() merchantId!: string;
  @Matches(/^[a-z0-9-]{2,30}$/) network!: string;
  @IsString() @MaxLength(100) name!: string;
}

class ProgramPatchDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsIn(Object.values(ProgramStatus)) status?: ProgramStatus;
  @IsOptional() @IsIn(Object.values(LinkMethod)) linkMethod?: LinkMethod;
  @IsOptional() @IsString() @MaxLength(80) accountTag?: string;
  @IsOptional() @IsString() @MaxLength(2000) linkTemplate?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) allowedTrackingHosts?: string[];
  @IsOptional() @IsString() @MaxLength(500) disclosureText?: string;
  @IsOptional() @IsString() @MaxLength(2000) bookingLinkTemplate?: string;
  @IsOptional() @IsString() @MaxLength(500) bookingLinkDocUrl?: string;
  @IsOptional() @IsString() @MaxLength(4000) commissionNotes?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) applicationUrl?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsObject() reportConfig?: Record<string, unknown>;
}

class TestLinkDto {
  @IsString() @MaxLength(2000) url!: string;
}

const DAY = 864e5;

@Controller('admin')
@UseGuards(AdminGuard)
export class AffiliateAdminController {
  constructor(private readonly prisma: PrismaService, private readonly commissions: CommissionImportService) {}

  /** Clicks and commissions side by side but never mixed: a click is a visit, a commission is a reported sale. */
  @Get('affiliate/summary')
  async summary() {
    const since30 = new Date(Date.now() - 30 * DAY);
    const [programs, clicks, plain, money] = await Promise.all([
      this.prisma.affiliateProgram.findMany({ include: { merchant: { select: { name: true, domain: true } } }, orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
      this.prisma.click.groupBy({ by: ['programId', 'outcome'], where: { createdAt: { gte: since30 } }, _count: true }),
      this.prisma.click.count({ where: { createdAt: { gte: since30 }, programId: null } }),
      this.prisma.commission.groupBy({ by: ['programId', 'status'], _sum: { amount: true, saleAmount: true }, _count: true }),
    ]);
    return {
      since: since30,
      plainClicks: plain,
      programs: programs.map((p) => {
        const c = clicks.filter((x) => x.programId === p.id);
        const m = money.filter((x) => x.programId === p.id);
        const byStatus = Object.fromEntries(m.map((x) => [x.status, { count: x._count, amount: Number(x._sum.amount ?? 0), sales: Number(x._sum.saleAmount ?? 0) }]));
        return {
          id: p.id, name: p.name, network: p.network, status: p.status, linkMethod: p.linkMethod, merchant: p.merchant,
          clicks30: { tracked: c.find((x) => x.outcome === 'TRACKED')?._count ?? 0, fallback: c.find((x) => x.outcome === 'FALLBACK')?._count ?? 0, plain: c.find((x) => x.outcome === 'PLAIN')?._count ?? 0 },
          commissions: byStatus,
        };
      }),
    };
  }

  @Get('programs')
  programs() {
    return this.prisma.affiliateProgram.findMany({ include: { merchant: { select: { id: true, name: true, domain: true } } }, orderBy: { name: 'asc' } });
  }

  @Post('programs')
  async create(@Body() dto: ProgramDto) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: dto.merchantId } });
    if (!merchant) throw new NotFoundException('Store not found');
    const dup = await this.prisma.affiliateProgram.findUnique({ where: { merchantId_network: { merchantId: dto.merchantId, network: dto.network } } });
    if (dup) throw new BadRequestException(`${merchant.name} already has a ${dto.network} program.`);
    return this.prisma.affiliateProgram.create({ data: dto });
  }

  @Get('programs/:id')
  async one(@Param('id') id: string) {
    const p = await this.prisma.affiliateProgram.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, name: true, domain: true } },
        imports: { orderBy: { createdAt: 'desc' }, take: 10 },
        commissions: { orderBy: { occurredAt: 'desc' }, take: 50 },
      },
    });
    if (!p) throw new NotFoundException('Program not found');
    return p;
  }

  @Patch('programs/:id')
  async update(@Param('id') id: string, @Body() dto: ProgramPatchDto) {
    const cur = await this.prisma.affiliateProgram.findUnique({ where: { id }, include: { merchant: { select: { domain: true } } } });
    if (!cur) throw new NotFoundException('Program not found');
    const { reportConfig, allowedTrackingHosts, bookingLinkTemplate, bookingLinkDocUrl, ...rest } = dto;
    // Travel pre-fill: only a format documented by the partner, with where it is documented. Empty turns it off.
    const booking = {
      bookingLinkTemplate: bookingLinkTemplate !== undefined ? bookingLinkTemplate.trim() || null : cur.bookingLinkTemplate,
      bookingLinkDocUrl: bookingLinkDocUrl !== undefined ? bookingLinkDocUrl.trim() || null : cur.bookingLinkDocUrl,
    };
    const bookingProblems = validateBookingFormat(booking.bookingLinkTemplate, booking.bookingLinkDocUrl, cur.merchant.domain);
    if (bookingProblems.length) throw new BadRequestException(bookingProblems.join(' '));
    const next = {
      linkMethod: dto.linkMethod ?? cur.linkMethod,
      accountTag: dto.accountTag !== undefined ? dto.accountTag.trim() || null : cur.accountTag,
      linkTemplate: dto.linkTemplate !== undefined ? dto.linkTemplate.trim() || null : cur.linkTemplate,
      allowedTrackingHosts: allowedTrackingHosts ? cleanHosts(allowedTrackingHosts) : cur.allowedTrackingHosts,
    };
    const problems = validateLinkConfig(next);
    if (problems.length) throw new BadRequestException(problems.join(' '));
    // Approved with no verified link method is allowed: links simply stay plain until one is configured.
    const now = new Date();
    return this.prisma.affiliateProgram.update({
      where: { id },
      data: {
        ...rest, ...next, ...booking,
        ...(dto.status === 'APPLIED' && !cur.appliedAt ? { appliedAt: now } : {}),
        ...(dto.status === 'APPROVED' && !cur.approvedAt ? { approvedAt: now } : {}),
        ...(reportConfig !== undefined ? { reportConfig: reportConfig as Prisma.InputJsonValue } : {}),
      },
    });
  }

  /** Shows exactly what link a shopper would get for a sample product page, so the format can be checked against the network's docs. */
  @Post('programs/:id/test-link')
  async testLink(@Param('id') id: string, @Body() dto: TestLinkDto) {
    const p = await this.prisma.affiliateProgram.findUnique({ where: { id }, include: { merchant: true } });
    if (!p) throw new NotFoundException('Program not found');
    if (!isLinkOnMerchantDomain(dto.url, p.merchant.domain)) throw new BadRequestException(`The sample link must be https on ${p.merchant.domain}.`);
    const built = buildTrackedUrl(p, dto.url, 'testclick0001');
    return built.ok ? { ok: true, url: built.url, host: built.host } : { ok: false, reason: built.reason };
  }

  /** Body: the network's commission report as text/csv (parsed by a route-specific 5 MB parser in main.ts). */
  @Post('programs/:id/commissions/import')
  importCommissions(@Param('id') id: string, @Body() body: unknown) {
    if (typeof body !== 'string' || !body.trim()) throw new BadRequestException('Send the report as text/csv.');
    return this.commissions.importCsv(id, body);
  }
}
