import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({ imports: [SearchModule], controllers: [PlansController], providers: [PlansService] })
export class PlansModule {}
