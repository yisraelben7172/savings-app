import { Module } from '@nestjs/common';
import { CatalogAdminController } from './catalog-admin.controller';
import { IngestionService } from './ingestion.service';

@Module({
  controllers: [CatalogAdminController],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class CatalogModule {}
