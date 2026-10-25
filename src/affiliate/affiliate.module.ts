import { Module } from '@nestjs/common';
import { AffiliateAdminController } from './affiliate-admin.controller';
import { ClickRetentionService } from './click-retention.service';
import { CommissionImportService } from './commission-import.service';

@Module({
  controllers: [AffiliateAdminController],
  providers: [CommissionImportService, ClickRetentionService],
  exports: [ClickRetentionService],
})
export class AffiliateModule {}
