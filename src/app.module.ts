import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { RATE_BURST, RATE_DAILY } from './rate-limits';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { DealsModule } from './deals/deals.module';
import { CategoriesModule } from './categories/categories.module';
import { ClicksModule } from './clicks/clicks.module';
import { AssistantModule } from './assistant/assistant.module';
import { OutreachModule } from './outreach/outreach.module';
import { CatalogModule } from './catalog/catalog.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Per-IP limits, applied only where @UseGuards(ThrottlerGuard) is set (browser-facing, costly or abusable routes).
    // The website's server fetches catalog data from shared Vercel IPs, so catalog reads are not limited here.
    ThrottlerModule.forRoot([RATE_BURST, RATE_DAILY]),
    PrismaModule,
    DealsModule,
    CategoriesModule,
    ClicksModule,
    AssistantModule,
    OutreachModule,
    CatalogModule,
    AffiliateModule,
    SearchModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
