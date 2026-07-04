import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DbService } from '../db/db.service';
import { WsService } from '../ws/ws.service';
import { AccessService } from './access.service';
import { CreateDayDto, UpdateDayDto } from './dto';

@Controller('trips/:tripId/days')
@UseGuards(JwtAuthGuard)
export class DaysController {
  constructor(
    private readonly dbs: DbService,
    private readonly ws: WsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    return this.dbs.db
      .prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY date ASC')
      .all(tripId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: CreateDayDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const id = randomUUID();
    this.dbs.db
      .prepare('INSERT INTO days (id, trip_id, date, notes) VALUES (?, ?, ?, ?)')
      .run(id, tripId, dto.date, dto.notes ?? null);
    const day = this.dbs.db.prepare('SELECT * FROM days WHERE id = ?').get(id);
    this.ws.broadcast(tripId, 'DAY_ADDED', day);
    return day;
  }

  @Patch(':dayId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
    @Body() dto: UpdateDayDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM days WHERE id = ? AND trip_id = ?')
      .get(dayId, tripId);
    if (!existing) throw new NotFoundException('Day not found');
    if (dto.date !== undefined) {
      this.dbs.db.prepare('UPDATE days SET date = ? WHERE id = ?').run(dto.date, dayId);
    }
    if (dto.notes !== undefined) {
      this.dbs.db.prepare('UPDATE days SET notes = ? WHERE id = ?').run(dto.notes, dayId);
    }
    const day = this.dbs.db.prepare('SELECT * FROM days WHERE id = ?').get(dayId);
    this.ws.broadcast(tripId, 'DAY_UPDATED', day);
    return day;
  }

  @Delete(':dayId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM days WHERE id = ? AND trip_id = ?')
      .get(dayId, tripId);
    if (!existing) throw new NotFoundException('Day not found');
    this.dbs.db.prepare('DELETE FROM days WHERE id = ?').run(dayId);
    this.ws.broadcast(tripId, 'DAY_DELETED', { id: dayId });
    return { ok: true };
  }
}
