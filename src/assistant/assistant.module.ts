import { Module } from '@nestjs/common';
import { DealsModule } from '../deals/deals.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({ imports: [DealsModule], controllers: [AssistantController], providers: [AssistantService] })
export class AssistantModule {}
