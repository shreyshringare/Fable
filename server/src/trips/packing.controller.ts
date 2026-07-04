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
import { CreatePackingItemDto, UpdatePackingItemDto } from './dto';

@Controller('trips/:tripId/packing')
@UseGuards(JwtAuthGuard)
export class PackingController {
  constructor(
    private readonly dbs: DbService,
    private readonly ws: WsService,
    private readonly access: AccessService,
  ) {}

  private parse(row: any) {
    return { ...row, packed: !!row.packed };
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    return (
      this.dbs.db
        .prepare('SELECT * FROM packing_items WHERE trip_id = ? ORDER BY created_at ASC')
        .all(tripId) as any[]
    ).map((r) => this.parse(r));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: CreatePackingItemDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const id = randomUUID();
    this.dbs.db
      .prepare(
        `INSERT INTO packing_items (id, trip_id, label, category, quantity, assigned_to_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        tripId,
        dto.label,
        dto.category ?? 'general',
        dto.quantity ?? 1,
        dto.assigned_to_user_id ?? null,
      );
    const item = this.parse(
      this.dbs.db.prepare('SELECT * FROM packing_items WHERE id = ?').get(id),
    );
    this.ws.broadcast(tripId, 'PACKING_UPDATED', { action: 'added', item });
    return item;
  }

  @Patch(':itemId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePackingItemDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM packing_items WHERE id = ? AND trip_id = ?')
      .get(itemId, tripId);
    if (!existing) throw new NotFoundException('Packing item not found');
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['label', 'category', 'quantity', 'assigned_to_user_id'] as const) {
      if ((dto as any)[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push((dto as any)[key]);
      }
    }
    if (dto.packed !== undefined) {
      fields.push('packed = ?');
      values.push(dto.packed ? 1 : 0);
    }
    if (fields.length) {
      this.dbs.db
        .prepare(`UPDATE packing_items SET ${fields.join(', ')} WHERE id = ?`)
        .run(...values, itemId);
    }
    const item = this.parse(
      this.dbs.db.prepare('SELECT * FROM packing_items WHERE id = ?').get(itemId),
    );
    this.ws.broadcast(tripId, 'PACKING_UPDATED', { action: 'updated', item });
    return item;
  }

  @Delete(':itemId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('itemId') itemId: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM packing_items WHERE id = ? AND trip_id = ?')
      .get(itemId, tripId);
    if (!existing) throw new NotFoundException('Packing item not found');
    this.dbs.db.prepare('DELETE FROM packing_items WHERE id = ?').run(itemId);
    this.ws.broadcast(tripId, 'PACKING_UPDATED', { action: 'deleted', item: { id: itemId } });
    return { ok: true };
  }
}
