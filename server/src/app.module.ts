import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as fs from 'fs';
import * as path from 'path';
import { DbModule } from './db/db.module';
import { WsModule } from './ws/ws.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TripsModule } from './trips/trips.module';
import { UploadsModule } from './uploads/uploads.module';
import { LoreModule } from './lore/lore.module';

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const clientDist =
  process.env.CLIENT_DIST || path.join(__dirname, '..', '..', 'client', 'dist');

const staticModules = [
  ServeStaticModule.forRoot({
    rootPath: UPLOAD_DIR,
    serveRoot: '/uploads',
    serveStaticOptions: { index: false },
  }),
  ...(fs.existsSync(clientDist)
    ? [
        ServeStaticModule.forRoot({
          rootPath: clientDist,
          exclude: ['/api*', '/uploads*', '/ws'],
        }),
      ]
    : []),
];

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'fable-dev-secret-change-me',
    }),
    ...staticModules,
    DbModule,
    WsModule,
    AuthModule,
    UsersModule,
    TripsModule,
    UploadsModule,
    LoreModule,
  ],
})
export class AppModule {}
