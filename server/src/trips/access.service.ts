import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';

export type Role = 'owner' | 'editor' | 'viewer';
const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

@Injectable()
export class AccessService {
  constructor(private readonly dbs: DbService) {}

  /** Throws unless user is a member of the trip with at least `min` role. Returns actual role. */
  requireRole(tripId: string, userId: string, min: Role): Role {
    const trip = this.dbs.db.prepare('SELECT id FROM trips WHERE id = ?').get(tripId);
    if (!trip) throw new NotFoundException('Trip not found');
    const row = this.dbs.db
      .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
      .get(tripId, userId) as { role: Role } | undefined;
    if (!row) throw new ForbiddenException('Not a member of this trip');
    if (RANK[row.role] < RANK[min]) {
      throw new ForbiddenException(`Requires ${min} role`);
    }
    return row.role;
  }
}
