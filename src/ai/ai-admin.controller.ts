import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { AiUsageService } from './usage.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AiAdminController {
  constructor(private readonly usage: AiUsageService) {}

  /** AI runs, tokens, estimated cost, fallbacks and latency, plus the daily budget. No message content is ever stored. */
  @Get('ai/usage')
  summary() {
    return this.usage.summary();
  }
}
