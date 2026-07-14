import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DbService } from '../db/db.service';
import { AccessService } from './access.service';

@Controller('trips/:tripId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly dbs: DbService,
    private readonly access: AccessService,
  ) {}

  /** Chat history with cursor-based pagination. Creation is via WebSocket only. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    const take = Math.min(Number(limit) || 50, 100);
    const fetchCount = take + 1;
    const rows = before
      ? this.dbs.db
          .prepare(
            `SELECT m.*, u.name AS user_name, u.avatar_url AS user_avatar
             FROM messages m JOIN users u ON u.id = m.user_id
             WHERE m.trip_id = ? AND m.created_at < ?
             ORDER BY m.created_at DESC LIMIT ?`,
          )
          .all(tripId, before, fetchCount)
      : this.dbs.db
          .prepare(
            `SELECT m.*, u.name AS user_name, u.avatar_url AS user_avatar
             FROM messages m JOIN users u ON u.id = m.user_id
             WHERE m.trip_id = ?
             ORDER BY m.created_at DESC LIMIT ?`,
          )
          .all(tripId, fetchCount);

    const hasMore = rows.length > take;
    const page = (rows as any[]).slice(0, take).reverse();
    const nextCursor = hasMore ? (rows[take - 1] as any).created_at : null;

    return { messages: page, nextCursor };
  }
}
