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
import { CreatePlaceDto, ReorderDto, UpdatePlaceDto } from './dto';

@Controller('trips/:tripId/days/:dayId/places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(
    private readonly dbs: DbService,
    private readonly ws: WsService,
    private readonly access: AccessService,
  ) {}

  private requireDay(tripId: string, dayId: string) {
    const day = this.dbs.db
      .prepare('SELECT * FROM days WHERE id = ? AND trip_id = ?')
      .get(dayId, tripId);
    if (!day) throw new NotFoundException('Day not found');
    return day;
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    this.requireDay(tripId, dayId);
    return this.dbs.db
      .prepare('SELECT * FROM places WHERE day_id = ? ORDER BY order_index ASC')
      .all(dayId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreatePlaceDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    this.requireDay(tripId, dayId);
    const max = this.dbs.db
      .prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM places WHERE day_id = ?')
      .get(dayId) as { m: number };
    const id = randomUUID();
    this.dbs.db
      .prepare(
        `INSERT INTO places (id, day_id, trip_id, name, lat, lng, address, category, notes, order_index, photo_url, rating, hours, website)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        dayId,
        tripId,
        dto.name,
        dto.lat ?? null,
        dto.lng ?? null,
        dto.address ?? null,
        dto.category ?? 'other',
        dto.notes ?? null,
        max.m + 1,
        dto.photo_url ?? null,
        dto.rating ?? null,
        dto.hours ?? null,
        dto.website ?? null,
      );
    const place = this.dbs.db.prepare('SELECT * FROM places WHERE id = ?').get(id);
    this.ws.broadcast(tripId, 'PLACE_ADDED', place);
    return place;
  }

  @Post('reorder')
  reorder(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
    @Body() dto: ReorderDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    this.requireDay(tripId, dayId);
    const stmt = this.dbs.db.prepare(
      'UPDATE places SET order_index = ? WHERE id = ? AND trip_id = ?',
    );
    this.dbs.db.transaction(() => {
      for (const item of dto.items) stmt.run(item.order_index, item.id, tripId);
    })();
    const places = this.dbs.db
      .prepare('SELECT * FROM places WHERE day_id = ? ORDER BY order_index ASC')
      .all(dayId);
    this.ws.broadcast(tripId, 'PLACES_REORDERED', { dayId, places });
    return places;
  }

  @Patch(':placeId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
    @Param('placeId') placeId: string,
    @Body() dto: UpdatePlaceDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM places WHERE id = ? AND trip_id = ?')
      .get(placeId, tripId) as any;
    if (!existing) throw new NotFoundException('Place not found');

    const movingDay = dto.day_id !== undefined && dto.day_id !== existing.day_id;
    if (movingDay) this.requireDay(tripId, dto.day_id!);

    const fields: string[] = [];
    const values: unknown[] = [];
    const updatable = [
      'name',
      'lat',
      'lng',
      'address',
      'category',
      'notes',
      'photo_url',
      'rating',
      'hours',
      'website',
      'order_index',
      'day_id',
    ] as const;
    for (const key of updatable) {
      if ((dto as any)[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push((dto as any)[key]);
      }
    }
    if (movingDay && dto.order_index === undefined) {
      const max = this.dbs.db
        .prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM places WHERE day_id = ?')
        .get(dto.day_id!) as { m: number };
      fields.push('order_index = ?');
      values.push(max.m + 1);
    }
    if (fields.length) {
      this.dbs.db
        .prepare(`UPDATE places SET ${fields.join(', ')} WHERE id = ?`)
        .run(...values, placeId);
    }
    const place = this.dbs.db.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
    this.ws.broadcast(tripId, movingDay ? 'PLACE_MOVED' : 'PLACE_UPDATED', place);
    return place;
  }

  @Delete(':placeId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
    @Param('placeId') placeId: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM places WHERE id = ? AND trip_id = ?')
      .get(placeId, tripId);
    if (!existing) throw new NotFoundException('Place not found');
    this.dbs.db.prepare('DELETE FROM places WHERE id = ?').run(placeId);
    this.ws.broadcast(tripId, 'PLACE_DELETED', { id: placeId });
    return { ok: true };
  }
}
