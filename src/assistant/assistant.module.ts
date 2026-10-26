import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SearchModule } from '../search/search.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({ imports: [AiModule, SearchModule], controllers: [AssistantController], providers: [AssistantService] })
export class AssistantModule {}
