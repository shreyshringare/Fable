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
import { CreateNoteDto, ReorderDto, UpdateNoteDto } from './dto';

@Controller('trips/:tripId/days/:dayId/notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
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
      .prepare('SELECT * FROM day_notes WHERE day_id = ? ORDER BY order_index ASC')
      .all(dayId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreateNoteDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    this.requireDay(tripId, dayId);
    const max = this.dbs.db
      .prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM day_notes WHERE day_id = ?')
      .get(dayId) as { m: number };
    const id = randomUUID();
    this.dbs.db
      .prepare('INSERT INTO day_notes (id, day_id, content, icon, order_index) VALUES (?, ?, ?, ?, ?)')
      .run(id, dayId, dto.content, dto.icon ?? null, max.m + 1);
    const note = this.dbs.db.prepare('SELECT * FROM day_notes WHERE id = ?').get(id);
    this.ws.broadcast(tripId, 'NOTE_ADDED', note);
    return note;
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
      'UPDATE day_notes SET order_index = ? WHERE id = ? AND day_id = ?',
    );
    this.dbs.db.transaction(() => {
      for (const item of dto.items) stmt.run(item.order_index, item.id, dayId);
    })();
    const notes = this.dbs.db
      .prepare('SELECT * FROM day_notes WHERE day_id = ? ORDER BY order_index ASC')
      .all(dayId);
    this.ws.broadcast(tripId, 'NOTES_REORDERED', { dayId, notes });
    return notes;
  }

  @Patch(':noteId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM day_notes WHERE id = ? AND day_id = ?')
      .get(noteId, dayId);
    if (!existing) throw new NotFoundException('Note not found');
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['content', 'icon', 'order_index'] as const) {
      if (dto[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(dto[key]);
      }
    }
    if (fields.length) {
      this.dbs.db
        .prepare(`UPDATE day_notes SET ${fields.join(', ')} WHERE id = ?`)
        .run(...values, noteId);
    }
    const note = this.dbs.db.prepare('SELECT * FROM day_notes WHERE id = ?').get(noteId);
    this.ws.broadcast(tripId, 'NOTE_UPDATED', note);
    return note;
  }

  @Delete(':noteId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
    @Param('noteId') noteId: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM day_notes WHERE id = ? AND day_id = ?')
      .get(noteId, dayId);
    if (!existing) throw new NotFoundException('Note not found');
    this.dbs.db.prepare('DELETE FROM day_notes WHERE id = ?').run(noteId);
    this.ws.broadcast(tripId, 'NOTE_DELETED', { id: noteId, dayId });
    return { ok: true };
  }
}
