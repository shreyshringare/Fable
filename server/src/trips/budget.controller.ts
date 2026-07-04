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
import { CreateBudgetItemDto, UpdateBudgetItemDto } from './dto';

@Controller('trips/:tripId/budget')
@UseGuards(JwtAuthGuard)
export class BudgetController {
  constructor(
    private readonly dbs: DbService,
    private readonly ws: WsService,
    private readonly access: AccessService,
  ) {}

  private parse(row: any) {
    return { ...row, split_among: JSON.parse(row.split_among || '[]') };
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    return (
      this.dbs.db
        .prepare('SELECT * FROM budget_items WHERE trip_id = ? ORDER BY created_at DESC')
        .all(tripId) as any[]
    ).map((r) => this.parse(r));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: CreateBudgetItemDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const id = randomUUID();
    this.dbs.db
      .prepare(
        `INSERT INTO budget_items (id, trip_id, category, label, amount, currency, paid_by_user_id, split_among)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        tripId,
        dto.category,
        dto.label,
        dto.amount,
        (dto.currency ?? 'USD').toUpperCase(),
        dto.paid_by_user_id ?? user.sub,
        JSON.stringify(dto.split_among ?? []),
      );
    const item = this.parse(this.dbs.db.prepare('SELECT * FROM budget_items WHERE id = ?').get(id));
    this.ws.broadcast(tripId, 'BUDGET_UPDATED', { action: 'added', item });
    return item;
  }

  @Patch(':itemId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateBudgetItemDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const existing = this.dbs.db
      .prepare('SELECT * FROM budget_items WHERE id = ? AND trip_id = ?')
      .get(itemId, tripId);
    if (!existing) throw new NotFoundException('Budget item not found');
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['category', 'label', 'amount', 'paid_by_user_id'] as const) {
      if ((dto as any)[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push((dto as any)[key]);
      }
    }
    if (dto.currency !== undefined) {
      fields.push('currency = ?');
      values.push(dto.currency.toUpperCase());
    }
    if (dto.split_among !== undefined) {
      fields.push('split_among = ?');
      values.push(JSON.stringify(dto.split_among));
    }
    if (fields.length) {
      this.dbs.db
        .prepare(`UPDATE budget_items SET ${fields.join(', ')} WHERE id = ?`)
        .run(...values, itemId);
    }
    const item = this.parse(
      this.dbs.db.prepare('SELECT * FROM budget_items WHERE id = ?').get(itemId),
    );
    this.ws.broadcast(tripId, 'BUDGET_UPDATED', { action: 'updated', item });
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
      .prepare('SELECT * FROM budget_items WHERE id = ? AND trip_id = ?')
      .get(itemId, tripId);
    if (!existing) throw new NotFoundException('Budget item not found');
    this.dbs.db.prepare('DELETE FROM budget_items WHERE id = ?').run(itemId);
    this.ws.broadcast(tripId, 'BUDGET_UPDATED', { action: 'deleted', item: { id: itemId } });
    return { ok: true };
  }
}
