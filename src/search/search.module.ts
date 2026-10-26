import { Module } from '@nestjs/common';
import { DealsModule } from '../deals/deals.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({ imports: [DealsModule], controllers: [SearchController], providers: [SearchService], exports: [SearchService] })
export class SearchModule {}
