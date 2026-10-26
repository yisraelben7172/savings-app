import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { AiAdminController } from './ai-admin.controller';
import { ANTHROPIC_CLIENT } from './client';
import { AiUsageService } from './usage.service';

@Module({
  controllers: [AiAdminController],
  providers: [
    AiUsageService,
    {
      provide: ANTHROPIC_CLIENT,
      // No key means no client: the assistant then answers with plain keyword search. The SDK retries transient
      // errors once, and every call also gets an explicit timeout from the assistant.
      useFactory: () => (process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 20_000 }) : null),
    },
  ],
  exports: [AiUsageService, ANTHROPIC_CLIENT],
})
export class AiModule {}
