import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DbService } from '../db/db.service';
import { WsService } from '../ws/ws.service';
import { AccessService } from './access.service';
import { CreateTripDto, UpdateTripDto } from './dto';

function* dateRange(start: string, end: string) {
  const d = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (d <= stop) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

@Injectable()
export class TripsService {
  constructor(
    private readonly dbs: DbService,
    private readonly ws: WsService,
    private readonly access: AccessService,
  ) {}

  listForUser(userId: string) {
    return this.dbs.db
      .prepare(
        `SELECT t.*, tm.role,
                (SELECT COUNT(*) FROM trip_members m WHERE m.trip_id = t.id) AS member_count
         FROM trips t JOIN trip_members tm ON tm.trip_id = t.id
         WHERE tm.user_id = ?
         ORDER BY t.created_at DESC`,
      )
      .all(userId);
  }

  create(userId: string, dto: CreateTripDto) {
    const id = randomUUID();
    const tx = this.dbs.db.transaction(() => {
      this.dbs.db
        .prepare(
          `INSERT INTO trips (id, name, description, cover_image, start_date, end_date, owner_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          dto.name,
          dto.description ?? null,
          dto.cover_image ?? null,
          dto.start_date ?? null,
          dto.end_date ?? null,
          userId,
        );
      this.dbs.db
        .prepare('INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, ?)')
        .run(id, userId, 'owner');
      if (dto.start_date && dto.end_date) {
        const insertDay = this.dbs.db.prepare(
          'INSERT INTO days (id, trip_id, date) VALUES (?, ?, ?)',
        );
        for (const date of dateRange(dto.start_date, dto.end_date)) {
          insertDay.run(randomUUID(), id, date);
        }
      }
    });
    tx();
    return this.getDetail(id, userId);
  }

  /** Full trip state: trip, members, days, places, day notes. Used for initial load + WS re-sync. */
  getDetail(tripId: string, userId: string) {
    this.access.requireRole(tripId, userId, 'viewer');
    const trip = this.dbs.db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
    if (!trip) throw new NotFoundException('Trip not found');
    const members = this.dbs.db
      .prepare(
        `SELECT u.id, u.email, u.name, u.avatar_url, tm.role
         FROM trip_members tm JOIN users u ON u.id = tm.user_id
         WHERE tm.trip_id = ?`,
      )
      .all(tripId);
    const days = this.dbs.db
      .prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY date ASC')
      .all(tripId);
    const places = this.dbs.db
      .prepare('SELECT * FROM places WHERE trip_id = ? ORDER BY order_index ASC')
      .all(tripId);
    const notes = this.dbs.db
      .prepare(
        `SELECT dn.* FROM day_notes dn
         JOIN days d ON d.id = dn.day_id
         WHERE d.trip_id = ? ORDER BY dn.order_index ASC`,
      )
      .all(tripId);
    return { trip, members, days, places, notes };
  }

  update(tripId: string, userId: string, dto: UpdateTripDto) {
    this.access.requireRole(tripId, userId, 'editor');
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['name', 'description', 'cover_image', 'start_date', 'end_date'] as const) {
      if (dto[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(dto[key]);
      }
    }
    if (fields.length) {
      this.dbs.db
        .prepare(`UPDATE trips SET ${fields.join(', ')} WHERE id = ?`)
        .run(...values, tripId);
    }
    // Keep day rows in sync with the (possibly new) date range.
    const trip = this.dbs.db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId) as any;
    if (trip.start_date && trip.end_date) {
      const existing = new Set(
        (this.dbs.db.prepare('SELECT date FROM days WHERE trip_id = ?').all(tripId) as any[]).map(
          (d) => d.date,
        ),
      );
      const insertDay = this.dbs.db.prepare(
        'INSERT INTO days (id, trip_id, date) VALUES (?, ?, ?)',
      );
      for (const date of dateRange(trip.start_date, trip.end_date)) {
        if (!existing.has(date)) insertDay.run(randomUUID(), tripId, date);
      }
      // Drop out-of-range days only when they hold no content.
      this.dbs.db
        .prepare(
          `DELETE FROM days WHERE trip_id = ? AND (date < ? OR date > ?)
           AND id NOT IN (SELECT day_id FROM places)
           AND id NOT IN (SELECT day_id FROM day_notes)`,
        )
        .run(tripId, trip.start_date, trip.end_date);
    }
    this.ws.broadcast(tripId, 'TRIP_UPDATED', trip);
    return trip;
  }

  remove(tripId: string, userId: string) {
    const role = this.access.requireRole(tripId, userId, 'owner');
    if (role !== 'owner') throw new ForbiddenException('Only the owner can delete a trip');
    this.dbs.db.prepare('DELETE FROM trips WHERE id = ?').run(tripId);
    this.ws.broadcast(tripId, 'TRIP_DELETED', { id: tripId });
    return { ok: true };
  }
}
