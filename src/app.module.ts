import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { DealsModule } from './deals/deals.module';
import { CategoriesModule } from './categories/categories.module';
import { ClicksModule } from './clicks/clicks.module';
import { AssistantModule } from './assistant/assistant.module';
import { OutreachModule } from './outreach/outreach.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    DealsModule,
    CategoriesModule,
    ClicksModule,
    AssistantModule,
    OutreachModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
