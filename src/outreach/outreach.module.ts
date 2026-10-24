import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { GmailService } from './gmail.service';
import { OutreachScheduler } from './outreach.scheduler';
import { OutreachService } from './outreach.service';
import { SettingsService } from './settings.service';
import { TelegramService } from './telegram.service';
import { UnsubscribeController } from './unsubscribe.controller';

@Module({
  controllers: [AdminController, UnsubscribeController],
  providers: [OutreachService, GmailService, TelegramService, SettingsService, OutreachScheduler],
})
export class OutreachModule {}
