import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTripDto, UpdateTripDto } from './dto';
import { TripsService } from './trips.service';

@Controller('trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.trips.listForUser(user.sub);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) {
    return this.trips.create(user.sub, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.getDetail(id, user.sub);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTripDto) {
    return this.trips.update(id, user.sub, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.remove(id, user.sub);
  }
}
