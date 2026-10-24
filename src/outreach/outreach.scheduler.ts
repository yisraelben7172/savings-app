import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutreachService } from './outreach.service';
import { SettingsService } from './settings.service';
import { TelegramService } from './telegram.service';

/** Background jobs. Note: Render's free plan sleeps when idle, which pauses these; the paid plan keeps them running. */
@Injectable()
export class OutreachScheduler {
  private readonly log = new Logger(OutreachScheduler.name);

  constructor(
    private readonly outreach: OutreachService,
    private readonly settings: SettingsService,
    private readonly telegram: TelegramService,
  ) {}

  @Cron('*/5 * * * *')
  async send() {
    await this.outreach.sendNext().catch((e) => this.log.warn(`sendNext: ${(e as Error).message}`));
  }

  @Cron('*/3 * * * *')
  async inbox() {
    await this.outreach.checkInbox();
  }

  /** Weekdays 8:00 Eastern: prepare today's emails and tell the owner they're waiting for approval. */
  @Cron('0 8 * * 1-5', { timeZone: 'America/New_York' })
  async morning() {
    try {
      const s = await this.settings.all();
      if (s.autoPrepare === 'true') await this.outreach.prepareQueue();
      const sum = await this.outreach.summary();
      if (sum.drafts || sum.unread) {
        const link = process.env.WEB_URL ? `\n${process.env.WEB_URL.replace(/\/$/, '')}/admin/queue` : '';
        await this.telegram.send(
          `Good morning. ${sum.drafts} outreach email${sum.drafts === 1 ? ' is' : 's are'} waiting for your approval` +
            (sum.unread ? `, and you have ${sum.unread} unread repl${sum.unread === 1 ? 'y' : 'ies'}.` : '.') + link,
        );
      }
    } catch (e) {
      this.log.warn(`morning: ${(e as Error).message}`);
    }
  }
}
