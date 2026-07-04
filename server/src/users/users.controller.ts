import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DbService } from '../db/db.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly dbs: DbService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    const row = this.dbs.db
      .prepare('SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ?')
      .get(user.sub);
    if (!row) throw new NotFoundException('User not found');
    return row;
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    if (dto.name !== undefined) {
      this.dbs.db.prepare('UPDATE users SET name = ? WHERE id = ?').run(dto.name, user.sub);
    }
    if (dto.avatar_url !== undefined) {
      this.dbs.db
        .prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
        .run(dto.avatar_url, user.sub);
    }
    return this.me(user);
  }
}
