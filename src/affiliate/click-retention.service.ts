import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Click events are kept for CLICK_RETENTION_DAYS (default 24 months), then deleted. Commission records are kept. */
@Injectable()
export class ClickRetentionService {
  private readonly log = new Logger(ClickRetentionService.name);
  constructor(private readonly prisma: PrismaService) {}

  retentionDays() {
    const n = Number(process.env.CLICK_RETENTION_DAYS);
    return Number.isFinite(n) && n >= 30 ? Math.floor(n) : 730;
  }

  async purge(now = new Date()) {
    const cutoff = new Date(now.getTime() - this.retentionDays() * 864e5);
    const { count } = await this.prisma.click.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return count;
  }

  @Cron('30 3 * * *', { timeZone: 'America/New_York' })
  async nightly() {
    try {
      const n = await this.purge();
      if (n) this.log.log(`Deleted ${n} clicks older than ${this.retentionDays()} days`);
    } catch (e) {
      this.log.warn(`Click retention failed: ${(e as Error).message}`);
    }
  }
}
