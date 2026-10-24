import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmailStatus, PartnerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GmailService, header, stripQuoted, textBody } from './gmail.service';
import { buildRawEmail, OPT_OUT, parseAddress, renderTemplate, unsubscribeUrl, withFooter } from './mail-format';
import { SettingsService } from './settings.service';
import { TelegramService } from './telegram.service';

const DAY = 864e5;
const STOPPED: PartnerStatus[] = ['REPLIED', 'PARTNERED', 'DECLINED', 'OPTED_OUT', 'BOUNCED'];

export const DEFAULT_TEMPLATES = [
  {
    name: 'First email',
    step: 0,
    subject: 'Featuring {{brand}} on Vault',
    body: `Hi {{firstName}},

I run Vault, a new US deals site and app that shows shoppers verified prices from stores we've checked, with price history so they can buy at the right moment. We only list trusted stores, and we never run coupon spam.

We'd love to feature {{brand}}'s {{category}} deals. Do you run an affiliate program we can join, or is there a better person to talk to about a partnership?

Happy to share more about our audience.`,
  },
  {
    name: 'Follow-up 1',
    step: 1,
    subject: 'Re: Featuring {{brand}} on Vault',
    body: `Hi {{firstName}},

Just bringing this back to the top of your inbox. Is an affiliate partnership with {{brand}} something you'd consider? If someone else handles this, I'd be grateful for a pointer.`,
  },
  {
    name: 'Follow-up 2',
    step: 2,
    subject: 'Re: Featuring {{brand}} on Vault',
    body: `Hi {{firstName}},

I'll leave it here so I don't crowd your inbox. If a partnership with Vault makes sense later, just reply to this email and I'll pick it up.`,
  },
];

@Injectable()
export class OutreachService {
  private readonly log = new Logger(OutreachService.name);
  private sending = false;
  private checking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmail: GmailService,
    private readonly telegram: TelegramService,
    private readonly settings: SettingsService,
  ) {}

  async ensureTemplates() {
    if ((await this.prisma.emailTemplate.count()) === 0) await this.prisma.emailTemplate.createMany({ data: DEFAULT_TEMPLATES });
  }

  // ---------- partners ----------

  listPartners(status?: PartnerStatus, q?: string) {
    const where: Prisma.PartnerWhereInput = {};
    if (status) where.status = status;
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { network: { contains: q, mode: 'insensitive' } }];
    return this.prisma.partner.findMany({ where, orderBy: [{ updatedAt: 'desc' }], take: 500 });
  }

  async partner(id: string) {
    const p = await this.prisma.partner.findUnique({
      where: { id },
      include: { emails: { orderBy: { createdAt: 'asc' } }, inbound: { orderBy: { receivedAt: 'asc' } } },
    });
    if (!p) throw new NotFoundException('Partner not found');
    return p;
  }

  async createPartners(rows: Prisma.PartnerCreateManyInput[]) {
    const clean = rows.map((r) => ({ ...r, email: r.email?.trim().toLowerCase() || null })).filter((r) => r.name?.trim());
    const existing = new Set(
      (await this.prisma.partner.findMany({ where: { email: { in: clean.map((r) => r.email).filter((e): e is string => !!e) } }, select: { email: true } })).map((p) => p.email),
    );
    const fresh = clean.filter((r) => !r.email || !existing.has(r.email));
    await this.prisma.partner.createMany({ data: fresh });
    return { added: fresh.length, skipped: clean.length - fresh.length };
  }

  async updatePartner(id: string, data: Prisma.PartnerUpdateInput) {
    if (typeof data.email === 'string') data.email = data.email.trim().toLowerCase() || null;
    const p = await this.prisma.partner.update({ where: { id }, data });
    if (STOPPED.includes(p.status)) await this.cancelPending(p.id);
    if (p.status === 'OPTED_OUT' && p.email) await this.suppress(p.email, 'manual');
    return p;
  }

  deletePartner(id: string) {
    return this.prisma.partner.delete({ where: { id } });
  }

  // ---------- templates ----------

  async templates() {
    await this.ensureTemplates();
    return this.prisma.emailTemplate.findMany({ orderBy: [{ step: 'asc' }, { createdAt: 'asc' }] });
  }

  createTemplate(data: { name: string; step: number; subject: string; body: string }) {
    return this.prisma.emailTemplate.create({ data });
  }

  updateTemplate(id: string, data: Partial<{ name: string; step: number; subject: string; body: string }>) {
    return this.prisma.emailTemplate.update({ where: { id }, data });
  }

  deleteTemplate(id: string) {
    return this.prisma.emailTemplate.delete({ where: { id } });
  }

  // ---------- queue ----------

  async queue() {
    const [pending, recent] = await Promise.all([
      this.prisma.outreachEmail.findMany({
        where: { status: { in: ['DRAFT', 'APPROVED'] } },
        include: { partner: { select: { id: true, name: true, network: true, status: true } } },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.outreachEmail.findMany({
        where: { status: { in: ['SENT', 'FAILED'] } },
        include: { partner: { select: { id: true, name: true } } },
        orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
        take: 25,
      }),
    ]);
    return { pending, recent };
  }

  private async isSuppressed(email: string) {
    return Boolean(await this.prisma.suppression.findUnique({ where: { email: email.toLowerCase() } }));
  }

  /** Creates a first-email draft for each partner (skips anyone already emailed, opted out or without an address). */
  async draftFirstEmails(partnerIds: string[], templateId?: string) {
    await this.ensureTemplates();
    const template = templateId
      ? await this.prisma.emailTemplate.findUnique({ where: { id: templateId } })
      : await this.prisma.emailTemplate.findFirst({ where: { step: 0 }, orderBy: { createdAt: 'asc' } });
    if (!template) throw new BadRequestException('Template not found');
    const partners = await this.prisma.partner.findMany({ where: { id: { in: partnerIds }, status: 'NEW', email: { not: null } }, include: { emails: { select: { id: true } } } });
    let created = 0;
    for (const p of partners) {
      if (p.emails.length || (await this.isSuppressed(p.email!))) continue;
      await this.prisma.outreachEmail.create({
        data: { partnerId: p.id, templateId: template.id, step: 0, toEmail: p.email!, subject: renderTemplate(template.subject, p), body: renderTemplate(template.body, p) },
      });
      created++;
    }
    return { created, skipped: partnerIds.length - created };
  }

  /** Weekday-morning job (also a button): drafts due follow-ups, then first emails for new partners up to the daily limit. */
  async prepareQueue() {
    await this.ensureTemplates();
    const s = await this.settings.all();
    const now = Date.now();
    const templates = await this.prisma.emailTemplate.findMany({ orderBy: { createdAt: 'asc' } });
    const forStep = (n: number) => templates.find((t) => t.step === n);
    let followUps = 0;

    const contacted = await this.prisma.partner.findMany({
      where: { status: 'CONTACTED' },
      include: { emails: { orderBy: { createdAt: 'desc' } } },
    });
    for (const p of contacted) {
      if (p.emails.some((e) => e.status === 'DRAFT' || e.status === 'APPROVED')) continue;
      const last = p.emails.find((e) => e.status === 'SENT');
      if (!last?.sentAt || last.step >= 2 || !p.email || (await this.isSuppressed(p.email))) continue;
      const wait = Number(last.step === 0 ? s.followUp1Days : s.followUp2Days) * DAY;
      const t = forStep(last.step + 1);
      if (!t || now - last.sentAt.getTime() < wait) continue;
      await this.prisma.outreachEmail.create({
        data: {
          partnerId: p.id, templateId: t.id, step: last.step + 1, toEmail: p.email,
          subject: renderTemplate(t.subject, p), body: renderTemplate(t.body, p), threadId: last.threadId, messageId: last.messageId,
        },
      });
      followUps++;
    }

    const pendingCount = await this.prisma.outreachEmail.count({ where: { status: { in: ['DRAFT', 'APPROVED'] } } });
    const room = Math.max(0, Number(s.dailyLimit) - pendingCount);
    const fresh = room
      ? await this.prisma.partner.findMany({ where: { status: 'NEW', email: { not: null }, emails: { none: {} } }, orderBy: { createdAt: 'asc' }, take: room, select: { id: true } })
      : [];
    const first = fresh.length ? await this.draftFirstEmails(fresh.map((p) => p.id)) : { created: 0 };
    return { followUps, firstEmails: first.created };
  }

  async editEmail(id: string, data: { subject?: string; body?: string }) {
    const e = await this.prisma.outreachEmail.findUnique({ where: { id } });
    if (!e || !['DRAFT', 'APPROVED'].includes(e.status)) throw new BadRequestException('Only unsent emails can be edited');
    return this.prisma.outreachEmail.update({ where: { id }, data: { subject: data.subject, body: data.body } });
  }

  setEmailStatus(id: string, status: Extract<EmailStatus, 'APPROVED' | 'SKIPPED' | 'DRAFT'>) {
    return this.prisma.outreachEmail.updateMany({
      where: { id, status: { in: ['DRAFT', 'APPROVED'] } },
      data: { status, approvedAt: status === 'APPROVED' ? new Date() : null },
    });
  }

  approveAll() {
    return this.prisma.outreachEmail.updateMany({ where: { status: 'DRAFT' }, data: { status: 'APPROVED', approvedAt: new Date() } });
  }

  private cancelPending(partnerId: string) {
    return this.prisma.outreachEmail.updateMany({ where: { partnerId, status: { in: ['DRAFT', 'APPROVED'] } }, data: { status: 'SKIPPED' } });
  }

  private async suppress(email: string, reason: string) {
    const e = email.trim().toLowerCase();
    await this.prisma.suppression.upsert({ where: { email: e }, update: { reason }, create: { email: e, reason } });
  }

  // ---------- sending ----------

  /** Why sending is blocked right now, or null if it may send. */
  async blockedReason() {
    const s = await this.settings.all();
    if (s.paused === 'true') return s.pauseReason ? `Paused: ${s.pauseReason}` : 'Paused';
    if (!this.gmail.configured) return 'Gmail is not connected';
    if (!s.postalAddress.trim()) return 'Add your postal address in Settings (required by law)';
    const { hour, weekday } = easternNow();
    if (weekday === 0 || weekday === 6) return 'Outside business hours (weekend)';
    if (hour < Number(s.sendStartHour) || hour >= Number(s.sendEndHour)) return 'Outside business hours';
    return null;
  }

  /** Runs every few minutes: sends at most one approved email, spread across business hours. */
  async sendNext() {
    if (this.sending) return;
    this.sending = true;
    try {
      if (await this.blockedReason()) return;
      const s = await this.settings.all();
      const limit = Math.max(1, Number(s.dailyLimit));
      const since = new Date(Date.now() - DAY);
      const sentToday = await this.prisma.outreachEmail.count({ where: { status: 'SENT', sentAt: { gte: since } } });
      if (sentToday >= limit) return;
      const windowMin = (Number(s.sendEndHour) - Number(s.sendStartHour)) * 60;
      const gapMin = Math.max(6, Math.floor(windowMin / limit));
      const last = await this.prisma.outreachEmail.findFirst({ where: { status: 'SENT' }, orderBy: { sentAt: 'desc' }, select: { sentAt: true } });
      if (last?.sentAt && Date.now() - last.sentAt.getTime() < gapMin * 60_000) return;

      const next = await this.prisma.outreachEmail.findFirst({ where: { status: 'APPROVED' }, orderBy: [{ step: 'desc' }, { approvedAt: 'asc' }], include: { partner: true } });
      if (!next) return;
      if (STOPPED.includes(next.partner.status) || (await this.isSuppressed(next.toEmail))) {
        await this.prisma.outreachEmail.update({ where: { id: next.id }, data: { status: 'SKIPPED' } });
        return;
      }
      await this.deliver(next.id);
    } finally {
      this.sending = false;
    }
  }

  private async deliver(id: string) {
    const e = await this.prisma.outreachEmail.findUniqueOrThrow({ where: { id } });
    const s = await this.settings.all();
    const unsub = unsubscribeUrl(e.toEmail);
    try {
      const raw = buildRawEmail({
        fromName: s.fromName,
        fromEmail: this.gmail.sender,
        to: e.toEmail,
        subject: e.subject,
        text: withFooter(e.body, s.signature, s.postalAddress, unsub),
        unsubscribeUrl: unsub,
        inReplyTo: e.step > 0 ? e.messageId : null,
      });
      const sent = await this.gmail.send(raw, e.step > 0 ? e.threadId : null);
      await this.prisma.$transaction([
        this.prisma.outreachEmail.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), gmailId: sent.id, threadId: sent.threadId, messageId: sent.messageId || e.messageId, error: null } }),
        this.prisma.partner.updateMany({ where: { id: e.partnerId, status: 'NEW' }, data: { status: 'CONTACTED' } }),
        this.prisma.partner.update({ where: { id: e.partnerId }, data: { lastContactedAt: new Date() } }),
      ]);
    } catch (err) {
      const msg = (err as Error).message.slice(0, 500);
      this.log.warn(`Send failed for ${e.toEmail}: ${msg}`);
      await this.prisma.outreachEmail.update({ where: { id }, data: { status: 'FAILED', error: msg } });
      await this.telegram.send(`Vault outreach: an email to ${e.toEmail} failed to send.\n${msg}`);
    }
  }

  // ---------- inbox ----------

  /** Runs every few minutes: pulls new mail from the outreach inbox, links replies to partners, alerts the owner. */
  async checkInbox() {
    if (!this.gmail.configured || this.checking) return { added: 0 };
    this.checking = true;
    let added = 0;
    try {
      const list = await this.gmail.listInbox('in:inbox newer_than:7d');
      const known = new Set(
        (await this.prisma.inboundEmail.findMany({ where: { gmailId: { in: list.map((m) => m.id) } }, select: { gmailId: true } })).map((m) => m.gmailId),
      );
      for (const item of list.reverse()) {
        if (known.has(item.id)) continue;
        const m = await this.gmail.get(item.id);
        const from = parseAddress(header(m, 'From'));
        if (from.email === this.gmail.sender) continue;
        if (await this.ingest(m, from)) added++;
      }
      await this.settings.setState('lastInboxCheck', new Date().toISOString());
    } catch (e) {
      this.log.warn(`Inbox check failed: ${(e as Error).message}`);
    } finally {
      this.checking = false;
    }
    return { added };
  }

  private async ingest(m: Awaited<ReturnType<GmailService['get']>>, from: { name: string | null; email: string }) {
    const subject = header(m, 'Subject') || '(no subject)';
    const text = stripQuoted(textBody(m)).slice(0, 20000);
    const receivedAt = new Date(Number(m.internalDate) || Date.now());
    const ours = await this.prisma.outreachEmail.findFirst({ where: { threadId: m.threadId }, include: { partner: true } });
    const isBounce = /mailer-daemon|postmaster/i.test(from.email);
    let partner = ours?.partner ?? (await this.prisma.partner.findFirst({ where: { email: from.email } }));
    let kind = 'other';

    if (isBounce) {
      kind = 'bounce';
      const failed = (header(m, 'X-Failed-Recipients') || ours?.toEmail || '').toLowerCase();
      if (failed) await this.suppress(failed, 'bounce');
      if (!partner && failed) partner = await this.prisma.partner.findFirst({ where: { email: failed } });
      if (partner) {
        await this.prisma.partner.update({ where: { id: partner.id }, data: { status: 'BOUNCED' } });
        await this.cancelPending(partner.id);
      }
      await this.checkBounceRate();
    } else if (partner) {
      kind = OPT_OUT.test(text.slice(0, 600)) ? 'optout' : 'reply';
      const status: PartnerStatus = kind === 'optout' ? 'OPTED_OUT' : ['PARTNERED', 'DECLINED'].includes(partner.status) ? partner.status : 'REPLIED';
      await this.prisma.partner.update({ where: { id: partner.id }, data: { status } });
      await this.cancelPending(partner.id);
      if (kind === 'optout') await this.suppress(from.email, 'optout');
    }

    await this.prisma.inboundEmail.create({
      data: { gmailId: m.id, threadId: m.threadId, partnerId: partner?.id, fromEmail: from.email, fromName: from.name, subject, snippet: (m.snippet ?? text).slice(0, 240), body: text, kind, receivedAt },
    });

    const who = partner?.name ?? from.name ?? from.email;
    const link = process.env.WEB_URL ? `\n${process.env.WEB_URL.replace(/\/$/, '')}/admin/inbox` : '';
    if (kind === 'reply') await this.telegram.send(`New reply from ${who}\n${subject}\n\n${text.slice(0, 500)}${link}`);
    else if (kind === 'optout') await this.telegram.send(`${who} asked not to be emailed again. They're on the do-not-email list now.${link}`);
    else if (kind === 'other') await this.telegram.send(`New email from ${who}\n${subject}${link}`);
    return true;
  }

  /** Pauses sending if more than 3% of the last 50 emails bounced (at least 2 bounces). */
  private async checkBounceRate() {
    const recent = await this.prisma.outreachEmail.findMany({ where: { status: 'SENT' }, orderBy: { sentAt: 'desc' }, take: 50, select: { partner: { select: { status: true } } } });
    const bounced = recent.filter((r) => r.partner.status === 'BOUNCED').length;
    if (bounced >= 2 && bounced / Math.max(recent.length, 1) > 0.03) {
      const s = await this.settings.all();
      if (s.paused === 'true') return;
      await this.settings.update({ paused: 'true', pauseReason: `${bounced} of the last ${recent.length} emails bounced. Check your contact list, then resume.` });
      await this.telegram.send(`Vault outreach paused itself: ${bounced} of the last ${recent.length} emails bounced. Clean up the contact list, then resume in Settings.`);
    }
  }

  listInbox(unreadOnly: boolean) {
    return this.prisma.inboundEmail.findMany({
      where: unreadOnly ? { read: false } : {},
      include: { partner: { select: { id: true, name: true, status: true } } },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
  }

  markRead(id: string, read = true) {
    return this.prisma.inboundEmail.update({ where: { id }, data: { read } });
  }

  // ---------- opt-out link ----------

  async optOut(email: string) {
    const e = email.trim().toLowerCase();
    await this.suppress(e, 'optout');
    const partners = await this.prisma.partner.findMany({ where: { email: e } });
    for (const p of partners) {
      await this.prisma.partner.update({ where: { id: p.id }, data: { status: 'OPTED_OUT' } });
      await this.cancelPending(p.id);
    }
    if (partners.length) await this.telegram.send(`${partners[0].name} unsubscribed from outreach emails.`);
  }

  // ---------- summary ----------

  async summary() {
    const [byStatus, drafts, approved, sent24h, unread, lastCheck, blocked] = await Promise.all([
      this.prisma.partner.groupBy({ by: ['status'], _count: true }),
      this.prisma.outreachEmail.count({ where: { status: 'DRAFT' } }),
      this.prisma.outreachEmail.count({ where: { status: 'APPROVED' } }),
      this.prisma.outreachEmail.count({ where: { status: 'SENT', sentAt: { gte: new Date(Date.now() - DAY) } } }),
      this.prisma.inboundEmail.count({ where: { read: false } }),
      this.settings.getState('lastInboxCheck'),
      this.blockedReason(),
    ]);
    return {
      partners: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      drafts, approved, sent24h, unread, lastInboxCheck: lastCheck,
      sendingStatus: blocked ?? 'Sending',
      gmailConnected: this.gmail.configured,
      gmailSender: this.gmail.sender || null,
      telegramConnected: this.telegram.configured,
    };
  }
}

/** Current hour and weekday (0 = Sunday) in US Eastern time. */
export function easternNow() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? 'Mon');
  return { hour, weekday };
}
