import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { UPLOAD_DIR } from '../app.module';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DbService } from '../db/db.service';
import { WsService } from '../ws/ws.service';
import { AccessService } from './access.service';
import { CreateAttachmentDto } from './dto';

@Controller('trips/:tripId')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(
    private readonly dbs: DbService,
    private readonly ws: WsService,
    private readonly access: AccessService,
  ) {}

  /** All attachments across all reservations — used by the sidebar. */
  @Get('documents')
  listAll(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    return this.dbs.db
      .prepare(
        `SELECT ra.*, r.title AS reservation_title, r.type AS reservation_type
         FROM reservation_attachments ra
         JOIN reservations r ON r.id = ra.reservation_id
         WHERE ra.trip_id = ?
         ORDER BY ra.created_at DESC`,
      )
      .all(tripId);
  }

  /** Attachments for one reservation. */
  @Get('reservations/:resId/attachments')
  list(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('resId') resId: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    this.requireReservation(resId, tripId);
    return this.dbs.db
      .prepare(
        'SELECT * FROM reservation_attachments WHERE reservation_id = ? ORDER BY created_at ASC',
      )
      .all(resId);
  }

  @Post('reservations/:resId/attachments')
  create(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('resId') resId: string,
    @Body() dto: CreateAttachmentDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    this.requireReservation(resId, tripId);
    const id = randomUUID();
    this.dbs.db
      .prepare(
        `INSERT INTO reservation_attachments
           (id, reservation_id, trip_id, uploaded_by, name, url, mime_type, size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, resId, tripId, user.sub, dto.name, dto.url, dto.mime_type, dto.size);
    const item = this.dbs.db
      .prepare('SELECT * FROM reservation_attachments WHERE id = ?')
      .get(id) as any;
    this.ws.broadcast(tripId, 'DOCUMENTS_UPDATED', { action: 'added', reservationId: resId, item });
    return item;
  }

  @Delete('reservations/:resId/attachments/:id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('resId') resId: string,
    @Param('id') id: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const row = this.dbs.db
      .prepare(
        'SELECT * FROM reservation_attachments WHERE id = ? AND reservation_id = ?',
      )
      .get(id, resId) as { url: string } | undefined;
    if (!row) throw new NotFoundException('Attachment not found');
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, row.url.replace(/^\/uploads\//, '')));
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
    this.dbs.db.prepare('DELETE FROM reservation_attachments WHERE id = ?').run(id);
    this.ws.broadcast(tripId, 'DOCUMENTS_UPDATED', {
      action: 'deleted',
      reservationId: resId,
      item: { id },
    });
    return { ok: true };
  }

  private requireReservation(resId: string, tripId: string) {
    const res = this.dbs.db
      .prepare('SELECT id FROM reservations WHERE id = ? AND trip_id = ?')
      .get(resId, tripId);
    if (!res) throw new NotFoundException('Reservation not found');
  }
}
