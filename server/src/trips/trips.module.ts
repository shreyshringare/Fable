import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { BudgetController } from './budget.controller';
import { DaysController } from './days.controller';
import { MembersController } from './members.controller';
import { MessagesController } from './messages.controller';
import { NotesController } from './notes.controller';
import { PackingController } from './packing.controller';
import { PlacesController } from './places.controller';
import { ReservationsController } from './reservations.controller';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  controllers: [
    TripsController,
    MembersController,
    DaysController,
    PlacesController,
    NotesController,
    ReservationsController,
    BudgetController,
    PackingController,
    MessagesController,
  ],
  providers: [TripsService, AccessService],
})
export class TripsModule {}
