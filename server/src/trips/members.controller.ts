import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DbService } from '../db/db.service';
import { WsService } from '../ws/ws.service';
import { AccessService } from './access.service';
import { InviteMemberDto, UpdateMemberDto } from './dto';

@Controller('trips/:tripId/members')
@UseGuards(JwtAuthGuard)
export class MembersController {
  constructor(
    private readonly dbs: DbService,
    private readonly ws: WsService,
    private readonly access: AccessService,
  ) {}

  private listMembers(tripId: string) {
    return this.dbs.db
      .prepare(
        `SELECT u.id, u.email, u.name, u.avatar_url, tm.role
         FROM trip_members tm JOIN users u ON u.id = tm.user_id
         WHERE tm.trip_id = ?`,
      )
      .all(tripId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    return this.listMembers(tripId);
  }

  @Post()
  invite(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: InviteMemberDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'owner');
    const invitee = this.dbs.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(dto.email.toLowerCase()) as { id: string } | undefined;
    if (!invitee) throw new NotFoundException('No user with that email');
    const existing = this.dbs.db
      .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
      .get(tripId, invitee.id);
    if (existing) throw new ConflictException('Already a member');
    this.dbs.db
      .prepare('INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, ?)')
      .run(tripId, invitee.id, dto.role);
    const members = this.listMembers(tripId);
    this.ws.broadcast(tripId, 'MEMBERS_UPDATED', { members });
    return members;
  }

  @Patch(':uid')
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('uid') uid: string,
    @Body() dto: UpdateMemberDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'owner');
    const target = this.dbs.db
      .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
      .get(tripId, uid) as { role: string } | undefined;
    if (!target) throw new NotFoundException('Not a member');
    if (target.role === 'owner') throw new BadRequestException('Cannot change the owner role');
    this.dbs.db
      .prepare('UPDATE trip_members SET role = ? WHERE trip_id = ? AND user_id = ?')
      .run(dto.role, tripId, uid);
    const members = this.listMembers(tripId);
    this.ws.broadcast(tripId, 'MEMBERS_UPDATED', { members });
    return members;
  }

  @Delete(':uid')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('uid') uid: string,
  ) {
    // Owner can remove anyone (except themselves); members can leave.
    const target = this.dbs.db
      .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
      .get(tripId, uid) as { role: string } | undefined;
    if (!target) throw new NotFoundException('Not a member');
    if (target.role === 'owner') throw new BadRequestException('Owner cannot be removed');
    if (uid !== user.sub) {
      this.access.requireRole(tripId, user.sub, 'owner');
    } else {
      this.access.requireRole(tripId, user.sub, 'viewer');
    }
    this.dbs.db
      .prepare('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?')
      .run(tripId, uid);
    const members = this.listMembers(tripId);
    this.ws.broadcast(tripId, 'MEMBERS_UPDATED', { members });
    return members;
  }
}
