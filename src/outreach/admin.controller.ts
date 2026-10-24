import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PartnerStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AdminGuard } from '../admin/admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OutreachService } from './outreach.service';
import { DEFAULT_SETTINGS, SettingsService } from './settings.service';
import { TelegramService } from './telegram.service';

const STATUSES = Object.values(PartnerStatus);

class PartnerDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(300) website?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(60) network?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

class PartnerPatchDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(300) website?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(60) network?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string; // "" clears it
  @IsOptional() @IsString() @MaxLength(500) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsIn(STATUSES) status?: PartnerStatus;
}

class ImportDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PartnerDto) rows!: PartnerDto[];
}

class TemplateDto {
  @IsString() @MaxLength(80) name!: string;
  @IsInt() @Min(0) @Max(2) step!: number;
  @IsString() @MaxLength(200) subject!: string;
  @IsString() @MaxLength(8000) body!: string;
}

class TemplatePatchDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2) step?: number;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(8000) body?: string;
}

class DraftDto {
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) partnerIds!: string[];
  @IsOptional() @IsString() templateId?: string;
}

class EmailPatchDto {
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(8000) body?: string;
}

class SettingsDto {
  @IsOptional() @IsIn(['true', 'false']) paused?: string;
  @IsOptional() @IsString() @MaxLength(4) dailyLimit?: string;
  @IsOptional() @IsString() @MaxLength(2) sendStartHour?: string;
  @IsOptional() @IsString() @MaxLength(2) sendEndHour?: string;
  @IsOptional() @IsString() @MaxLength(3) followUp1Days?: string;
  @IsOptional() @IsString() @MaxLength(3) followUp2Days?: string;
  @IsOptional() @IsIn(['true', 'false']) autoPrepare?: string;
  @IsOptional() @IsString() @MaxLength(80) fromName?: string;
  @IsOptional() @IsString() @MaxLength(300) postalAddress?: string;
  @IsOptional() @IsString() @MaxLength(1000) signature?: string;
}

const clampNum = (v: string | undefined, lo: number, hi: number) =>
  v === undefined ? undefined : String(Math.min(hi, Math.max(lo, Math.round(Number(v) || lo))));

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outreach: OutreachService,
    private readonly settings: SettingsService,
    private readonly telegram: TelegramService,
  ) {}

  @Get('stats')
  async stats() {
    const now = Date.now();
    const since = (days: number) => new Date(now - days * 864e5);
    const [activeDeals, merchants, clicks1, clicks7, clicks30, daily, top, outreach] = await Promise.all([
      this.prisma.deal.count({ where: { status: 'ACTIVE' } }),
      this.prisma.merchant.count({ where: { approved: true } }),
      this.prisma.click.count({ where: { createdAt: { gte: since(1) } } }),
      this.prisma.click.count({ where: { createdAt: { gte: since(7) } } }),
      this.prisma.click.count({ where: { createdAt: { gte: since(30) } } }),
      this.prisma.$queryRaw<{ day: Date; n: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, count(*) AS n FROM "Click"
        WHERE "createdAt" >= ${since(14)} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ title: string; slug: string; n: bigint }[]>`
        SELECT d.title, d.slug, count(*) AS n FROM "Click" c
        JOIN "Offer" o ON o.id = c."offerId" JOIN "Deal" d ON d.id = o."dealId"
        WHERE c."createdAt" >= ${since(30)} GROUP BY d.id ORDER BY n DESC LIMIT 5`,
      this.outreach.summary(),
    ]);
    const byDay = new Map(daily.map((r) => [r.day.toISOString().slice(0, 10), Number(r.n)]));
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now - (13 - i) * 864e5).toISOString().slice(0, 10);
      return { day: d, clicks: byDay.get(d) ?? 0 };
    });
    return {
      deals: { active: activeDeals, merchants },
      clicks: { today: clicks1, week: clicks7, month: clicks30, days, top: top.map((t) => ({ ...t, n: Number(t.n) })) },
      outreach,
    };
  }

  // partners
  @Get('partners')
  partners(@Query('status') status?: string, @Query('q') q?: string) {
    return this.outreach.listPartners(STATUSES.includes(status as PartnerStatus) ? (status as PartnerStatus) : undefined, q?.slice(0, 100));
  }

  @Post('partners')
  addPartner(@Body() dto: PartnerDto) {
    return this.outreach.createPartners([dto]);
  }

  @Post('partners/import')
  importPartners(@Body() dto: ImportDto) {
    return this.outreach.createPartners(dto.rows);
  }

  @Get('partners/:id')
  partner(@Param('id') id: string) {
    return this.outreach.partner(id);
  }

  @Patch('partners/:id')
  updatePartner(@Param('id') id: string, @Body() dto: PartnerPatchDto) {
    return this.outreach.updatePartner(id, dto);
  }

  @Delete('partners/:id')
  deletePartner(@Param('id') id: string) {
    return this.outreach.deletePartner(id);
  }

  // templates
  @Get('templates')
  templates() {
    return this.outreach.templates();
  }

  @Post('templates')
  createTemplate(@Body() dto: TemplateDto) {
    return this.outreach.createTemplate(dto);
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: TemplatePatchDto) {
    return this.outreach.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.outreach.deleteTemplate(id);
  }

  // queue
  @Get('queue')
  queue() {
    return this.outreach.queue();
  }

  @Post('queue/prepare')
  prepare() {
    return this.outreach.prepareQueue();
  }

  @Post('queue/draft')
  draft(@Body() dto: DraftDto) {
    return this.outreach.draftFirstEmails(dto.partnerIds, dto.templateId);
  }

  @Post('queue/approve-all')
  approveAll() {
    return this.outreach.approveAll();
  }

  @Patch('emails/:id')
  editEmail(@Param('id') id: string, @Body() dto: EmailPatchDto) {
    return this.outreach.editEmail(id, dto);
  }

  @Post('emails/:id/approve')
  approve(@Param('id') id: string) {
    return this.outreach.setEmailStatus(id, 'APPROVED');
  }

  @Post('emails/:id/unapprove')
  unapprove(@Param('id') id: string) {
    return this.outreach.setEmailStatus(id, 'DRAFT');
  }

  @Post('emails/:id/skip')
  skip(@Param('id') id: string) {
    return this.outreach.setEmailStatus(id, 'SKIPPED');
  }

  // inbox
  @Get('inbox')
  inbox(@Query('unread') unread?: string) {
    return this.outreach.listInbox(unread === 'true');
  }

  @Post('inbox/check')
  checkInbox() {
    return this.outreach.checkInbox();
  }

  @Post('inbox/:id/read')
  read(@Param('id') id: string, @Query('read') read?: string) {
    return this.outreach.markRead(id, read !== 'false');
  }

  // settings
  @Get('settings')
  getSettings() {
    return this.settings.all();
  }

  @Patch('settings')
  updateSettings(@Body() dto: SettingsDto) {
    const patch = {
      ...dto,
      dailyLimit: clampNum(dto.dailyLimit, 1, 50),
      sendStartHour: clampNum(dto.sendStartHour, 0, 23),
      sendEndHour: clampNum(dto.sendEndHour, 1, 24),
      followUp1Days: clampNum(dto.followUp1Days, 1, 30),
      followUp2Days: clampNum(dto.followUp2Days, 1, 60),
      ...(dto.paused === 'false' ? { pauseReason: '' } : {}),
    };
    return this.settings.update(Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== undefined && k in DEFAULT_SETTINGS)));
  }

  @Post('telegram/test')
  async testTelegram() {
    return { ok: await this.telegram.send('Vault admin: Telegram alerts are working.') };
  }
}
