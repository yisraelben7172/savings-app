import { Module } from '@nestjs/common';
import { ClicksController } from './clicks.controller';

@Module({ controllers: [ClicksController] })
export class ClicksModule {}
