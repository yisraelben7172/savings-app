import type { GmailService } from '../src/outreach/gmail.service';
import { OutreachService } from '../src/outreach/outreach.service';
import { DEFAULT_SETTINGS, type SettingsService } from '../src/outreach/settings.service';
import type { TelegramService } from '../src/outreach/telegram.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const WEDNESDAY_2PM_ET = new Date('2026-10-28T18:00:00Z');
const SATURDAY_2PM_ET = new Date('2026-10-31T18:00:00Z');

type Email = { id: string; status: string; partnerId: string; toEmail: string; step: number; subject: string; body: string; messageId: string | null; threadId: string | null; partner?: { id: string; status: string } };

function setup(opts: { settings?: Partial<typeof DEFAULT_SETTINGS>; approved?: Email | null; sentToday?: number; lastSentAt?: Date | null; suppressed?: boolean; gmail?: boolean } = {}) {
  const settings = { ...DEFAULT_SETTINGS, postalAddress: 'PO Box 1, New York, NY', ...opts.settings };
  const approved = opts.approved === undefined
    ? { id: 'e1', status: 'APPROVED', partnerId: 'p1', toEmail: 'a@b.test', step: 0, subject: 'Hi', body: 'Body', messageId: null, threadId: null, partner: { id: 'p1', status: 'NEW' } }
    : opts.approved;

  const outreachEmail = {
    count: jest.fn().mockResolvedValue(opts.sentToday ?? 0),
    findFirst: jest.fn(async ({ where }: { where: { status?: string; threadId?: string } }) => {
      if (where.status === 'SENT') return opts.lastSentAt ? { sentAt: opts.lastSentAt } : null;
      if (where.status === 'APPROVED') return approved;
      return null;
    }),
    findUniqueOrThrow: jest.fn(async () => approved),
    update: jest.fn(async (a: unknown) => a),
    updateMany: jest.fn(async () => ({ count: 1 })),
    create: jest.fn(async (a: unknown) => a),
  };
  const prisma = {
    outreachEmail,
    partner: { update: jest.fn(async (a: unknown) => a), updateMany: jest.fn(async () => ({ count: 1 })), findFirst: jest.fn(), findMany: jest.fn(async () => []) },
    suppression: { findUnique: jest.fn(async () => (opts.suppressed ? { email: 'a@b.test' } : null)), upsert: jest.fn() },
    inboundEmail: { findMany: jest.fn(async () => []), create: jest.fn() },
    emailTemplate: { count: jest.fn(async () => 3), findMany: jest.fn(async () => []), findFirst: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  } as unknown as PrismaService & { outreachEmail: typeof outreachEmail };

  const gmail = {
    configured: opts.gmail ?? true,
    sender: 'hello@out.test',
    send: jest.fn(async () => ({ id: 'g1', threadId: 't1', messageId: '<m1@mail>' })),
    listInbox: jest.fn(async () => []),
    get: jest.fn(),
  } as unknown as GmailService & { send: jest.Mock; listInbox: jest.Mock; get: jest.Mock };
  const telegram = { configured: true, send: jest.fn(async () => true) } as unknown as TelegramService & { send: jest.Mock };
  const settingsSvc = { all: jest.fn(async () => settings), update: jest.fn(), getState: jest.fn(), setState: jest.fn() } as unknown as SettingsService;

  return { svc: new OutreachService(prisma, gmail, telegram, settingsSvc), prisma, gmail, telegram };
}

describe('outreach sending rules', () => {
  beforeEach(() => jest.useFakeTimers({ now: WEDNESDAY_2PM_ET }));
  afterEach(() => jest.useRealTimers());

  it('sends one approved email during business hours and marks it sent', async () => {
    const { svc, gmail, prisma } = setup();
    await svc.sendNext();
    expect(gmail.send).toHaveBeenCalledTimes(1);
    expect(prisma.outreachEmail.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'APPROVED' } }));
    expect(prisma.outreachEmail.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e1' }, data: expect.objectContaining({ status: 'SENT', gmailId: 'g1' }) }));
  });

  it('only ever picks APPROVED emails, never drafts', async () => {
    const { svc, prisma } = setup();
    await svc.sendNext();
    const statuses = prisma.outreachEmail.findFirst.mock.calls.map(([a]) => (a as { where: { status: string } }).where.status);
    expect(statuses).not.toContain('DRAFT');
  });

  it.each([
    ['no postal address', { settings: { postalAddress: '' } }],
    ['paused', { settings: { paused: 'true' } }],
    ['Gmail not connected', { gmail: false }],
    ['daily limit reached', { sentToday: 20 }],
    ['too soon after the last send', { lastSentAt: new Date(WEDNESDAY_2PM_ET.getTime() - 60_000) }],
    ['nothing approved', { approved: null }],
  ])('does not send when %s', async (_label, opts) => {
    const { svc, gmail } = setup(opts as Parameters<typeof setup>[0]);
    await svc.sendNext();
    expect(gmail.send).not.toHaveBeenCalled();
  });

  it('does not send on weekends', async () => {
    jest.setSystemTime(SATURDAY_2PM_ET);
    const { svc, gmail } = setup();
    expect(await svc.blockedReason()).toMatch(/weekend/);
    await svc.sendNext();
    expect(gmail.send).not.toHaveBeenCalled();
  });

  it('skips instead of sending to opted-out or suppressed addresses', async () => {
    for (const opts of [{ suppressed: true }, { approved: { id: 'e1', status: 'APPROVED', partnerId: 'p1', toEmail: 'a@b.test', step: 0, subject: 's', body: 'b', messageId: null, threadId: null, partner: { id: 'p1', status: 'OPTED_OUT' } } }]) {
      const { svc, gmail, prisma } = setup(opts);
      await svc.sendNext();
      expect(gmail.send).not.toHaveBeenCalled();
      expect(prisma.outreachEmail.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { status: 'SKIPPED' } });
    }
  });

  it('records a failed send without marking it sent, and alerts the owner', async () => {
    const { svc, gmail, prisma, telegram } = setup();
    gmail.send.mockRejectedValueOnce(new Error('Gmail API 500'));
    await svc.sendNext();
    expect(prisma.outreachEmail.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(telegram.send).toHaveBeenCalled();
  });
});

describe('outreach drafting', () => {
  it('creates follow-ups as drafts that still need approval', async () => {
    jest.useFakeTimers({ now: WEDNESDAY_2PM_ET });
    const { svc, prisma } = setup();
    const sentAt = new Date(WEDNESDAY_2PM_ET.getTime() - 5 * 864e5);
    (prisma.emailTemplate.findMany as jest.Mock).mockResolvedValue([
      { id: 't0', step: 0, subject: 'S', body: 'B' },
      { id: 't1', step: 1, subject: 'Re: S', body: 'F1' },
    ]);
    (prisma.partner.findMany as jest.Mock).mockImplementation(async ({ where }: { where: { status: string } }) =>
      where.status === 'CONTACTED'
        ? [{ id: 'p1', name: 'Glow', email: 'a@b.test', status: 'CONTACTED', emails: [{ status: 'SENT', step: 0, sentAt, threadId: 't', messageId: '<m>' }] }]
        : [],
    );
    (prisma.outreachEmail.count as jest.Mock).mockResolvedValue(1);
    const r = await svc.prepareQueue();
    expect(r.followUps).toBe(1);
    const data = (prisma.outreachEmail.create as jest.Mock).mock.calls[0][0].data;
    expect(data.step).toBe(1);
    expect(data.status).toBeUndefined(); // defaults to DRAFT in the schema
    expect(data.threadId).toBe('t');
    jest.useRealTimers();
  });
});

describe('inbox handling', () => {
  function message(body: string, from = 'Sam <sam@glow.test>') {
    return {
      id: 'g9', threadId: 't1', internalDate: String(WEDNESDAY_2PM_ET.getTime()), snippet: body.slice(0, 50),
      payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: from }, { name: 'Subject', value: 'Re: Featuring Glow' }], body: { data: Buffer.from(body).toString('base64url') } },
    };
  }

  it('turns an opt-out reply into a permanent do-not-email entry and stops follow-ups', async () => {
    const { svc, prisma, gmail, telegram } = setup();
    gmail.listInbox.mockResolvedValue([{ id: 'g9', threadId: 't1' }]);
    gmail.get.mockResolvedValue(message('Please remove me from your list.'));
    (prisma.outreachEmail.findFirst as jest.Mock).mockResolvedValue({ toEmail: 'sam@glow.test', partner: { id: 'p1', name: 'Glow', status: 'CONTACTED' } });
    await svc.checkInbox();
    expect(prisma.partner.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'OPTED_OUT' } });
    expect(prisma.suppression.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'sam@glow.test' } }));
    expect(prisma.outreachEmail.updateMany).toHaveBeenCalledWith({ where: { partnerId: 'p1', status: { in: ['DRAFT', 'APPROVED'] } }, data: { status: 'SKIPPED' } });
    expect(prisma.inboundEmail.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'optout', partnerId: 'p1' }) }));
    expect(telegram.send).toHaveBeenCalled();
  });

  it('marks a normal reply as replied and alerts the owner', async () => {
    const { svc, prisma, gmail, telegram } = setup();
    gmail.listInbox.mockResolvedValue([{ id: 'g9', threadId: 't1' }]);
    gmail.get.mockResolvedValue(message('Thanks! Happy to chat. Here is our program link.\n\nOn Mon, Vault wrote:\n> old text'));
    (prisma.outreachEmail.findFirst as jest.Mock).mockResolvedValue({ toEmail: 'sam@glow.test', partner: { id: 'p1', name: 'Glow', status: 'CONTACTED' } });
    await svc.checkInbox();
    expect(prisma.partner.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'REPLIED' } });
    expect(prisma.suppression.upsert).not.toHaveBeenCalled();
    const created = (prisma.inboundEmail.create as jest.Mock).mock.calls[0][0].data;
    expect(created.kind).toBe('reply');
    expect(created.body).not.toContain('old text'); // quoted history stripped
    expect(telegram.send.mock.calls[0][0]).toContain('New reply from Glow');
  });

  it('never processes the same Gmail message twice', async () => {
    const { svc, prisma, gmail } = setup();
    gmail.listInbox.mockResolvedValue([{ id: 'g9', threadId: 't1' }]);
    (prisma.inboundEmail.findMany as jest.Mock).mockResolvedValue([{ gmailId: 'g9' }]);
    await svc.checkInbox();
    expect(gmail.get).not.toHaveBeenCalled();
    expect(prisma.inboundEmail.create).not.toHaveBeenCalled();
  });
});
