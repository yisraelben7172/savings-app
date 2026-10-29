import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { BookingLinksService } from './booking-links.service';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({ imports: [SearchModule], controllers: [TripsController], providers: [TripsService, BookingLinksService], exports: [TripsService] })
export class TripsModule {}
