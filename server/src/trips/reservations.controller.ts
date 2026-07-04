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
import { CreateReservationDto, UpdateReservationDto } from './dto';

@Controller('trips/:tripId/reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(
    private readonly dbs: DbService,
    private readonly ws: WsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    return this.dbs.db
      .prepare(
        `SELECT * FROM reservations WHERE trip_id = ?
         ORDER BY start_datetime IS NULL, start_datetime ASC`,
      )
      .all(tripId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: CreateReservationDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const id = randomUUID();
    this.dbs.db
      .prepare(
        `INSERT INTO reservations
           (id, trip_id, type, title, confirmation_number, start_datetime, end_datetime, status, notes, cost, attachment_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        tripId,
        dto.type,
        dto.title,
        dto.confirmation_number ?? null,
        dto.start_datetime ?? null,
        dto.end_datetime ?? null,
        dto.status ?? 'confirmed',
        dto.notes ?? null,
        dto.cost ?? null,
        dto.attachment_url ?? null,
      );
    const reservation = this.dbs.db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    this.ws.broadcast(tripId, 'RESERVATION_UPDATED', { action: 'added', item: reservation });
    return reservation;
  }

  @Patch(':resId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('resId') resId: string,
    @Body() dto: UpdateReservationDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM reservations WHERE id = ? AND trip_id = ?')
      .get(resId, tripId);
    if (!existing) throw new NotFoundException('Reservation not found');
    const fields: string[] = [];
    const values: unknown[] = [];
    const updatable = [
      'type',
      'title',
      'confirmation_number',
      'start_datetime',
      'end_datetime',
      'status',
      'notes',
      'cost',
      'attachment_url',
    ] as const;
    for (const key of updatable) {
      if ((dto as any)[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push((dto as any)[key]);
      }
    }
    if (fields.length) {
      this.dbs.db
        .prepare(`UPDATE reservations SET ${fields.join(', ')} WHERE id = ?`)
        .run(...values, resId);
    }
    const reservation = this.dbs.db.prepare('SELECT * FROM reservations WHERE id = ?').get(resId);
    this.ws.broadcast(tripId, 'RESERVATION_UPDATED', { action: 'updated', item: reservation });
    return reservation;
  }

  @Delete(':resId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('resId') resId: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM reservations WHERE id = ? AND trip_id = ?')
      .get(resId, tripId);
    if (!existing) throw new NotFoundException('Reservation not found');
    this.dbs.db.prepare('DELETE FROM reservations WHERE id = ?').run(resId);
    this.ws.broadcast(tripId, 'RESERVATION_UPDATED', { action: 'deleted', item: { id: resId } });
    return { ok: true };
  }
}
