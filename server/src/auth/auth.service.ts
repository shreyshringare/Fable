import {
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { DbService } from '../db/db.service';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

const REFRESH_TTL_DAYS = 30;

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly dbs: DbService,
    private readonly jwt: JwtService,
  ) {}

  onModuleInit() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;
    const existing = this.dbs.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email.toLowerCase());
    if (existing) return;
    this.dbs.db
      .prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), email.toLowerCase(), bcrypt.hashSync(password, 10), 'Admin');
    // eslint-disable-next-line no-console
    console.log(`Seeded admin user ${email}`);
  }

  private publicUser(row: any): PublicUser {
    return { id: row.id, email: row.email, name: row.name, avatar_url: row.avatar_url };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private issueTokens(user: PublicUser) {
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      { expiresIn: '15m' },
    );
    const jti = randomUUID();
    const refreshToken = this.jwt.sign(
      { sub: user.id, jti },
      { expiresIn: `${REFRESH_TTL_DAYS}d` },
    );
    const expiresAt = new Date(
      Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    this.dbs.db
      .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .run(jti, user.id, this.hashToken(refreshToken), expiresAt);
    return { accessToken, refreshToken };
  }

  register(email: string, password: string, name: string) {
    const normalized = email.toLowerCase();
    const existing = this.dbs.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(normalized);
    if (existing) throw new ConflictException('Email already registered');
    const id = randomUUID();
    this.dbs.db
      .prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
      .run(id, normalized, bcrypt.hashSync(password, 10), name);
    const user: PublicUser = { id, email: normalized, name, avatar_url: null };
    return { user, ...this.issueTokens(user) };
  }

  login(email: string, password: string) {
    const row = this.dbs.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.toLowerCase()) as any;
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const user = this.publicUser(row);
    return { user, ...this.issueTokens(user) };
  }

  refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    let payload: { sub: string; jti: string };
    try {
      payload = this.jwt.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const row = this.dbs.db
      .prepare('SELECT * FROM refresh_tokens WHERE id = ?')
      .get(payload.jti) as any;
    if (!row || row.token_hash !== this.hashToken(refreshToken)) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      this.dbs.db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(payload.jti);
      throw new UnauthorizedException('Refresh token expired');
    }
    // Rotate: revoke old, issue new pair.
    this.dbs.db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(payload.jti);
    const userRow = this.dbs.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(payload.sub) as any;
    if (!userRow) throw new UnauthorizedException('User not found');
    const user = this.publicUser(userRow);
    return { user, ...this.issueTokens(user) };
  }

  logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    try {
      const payload = this.jwt.verify<{ jti: string }>(refreshToken);
      this.dbs.db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(payload.jti);
    } catch {
      /* already invalid — nothing to revoke */
    }
  }
}
