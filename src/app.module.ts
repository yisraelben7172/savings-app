import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { DealsModule } from './deals/deals.module';
import { CategoriesModule } from './categories/categories.module';
import { ClicksModule } from './clicks/clicks.module';
import { AssistantModule } from './assistant/assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    DealsModule,
    CategoriesModule,
    ClicksModule,
    AssistantModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
