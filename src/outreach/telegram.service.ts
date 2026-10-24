import { Injectable, Logger } from '@nestjs/common';

/** Phone alerts through a Telegram bot (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID). Silent if not set up. */
@Injectable()
export class TelegramService {
  private readonly log = new Logger(TelegramService.name);

  get configured() {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  }

  async send(text: string): Promise<boolean> {
    if (!this.configured) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000), disable_web_page_preview: true }),
      });
      if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return true;
    } catch (e) {
      this.log.warn((e as Error).message);
      return false;
    }
  }
}
