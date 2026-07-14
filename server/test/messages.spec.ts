import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';
import { DbService } from '../src/db/db.service';
import { randomUUID } from 'crypto';

async function registerAndLogin(app: INestApplication, email: string, name: string) {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password: 'password123', name });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

describe('Messages (integration)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let tripId: string;
  let ownerId: string;
  let db: DbService;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DbService);

    ownerToken = await registerAndLogin(app, 'msg-owner@test.com', 'Owner');
    viewerToken = await registerAndLogin(app, 'msg-viewer@test.com', 'Viewer');

    const ownerMe = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${ownerToken}`);
    ownerId = ownerMe.body.id;

    const tr = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Messages Trip' })
      .expect(201);
    tripId = tr.body.trip.id;

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'msg-viewer@test.com', role: 'viewer' });

    // Seed 5 messages directly in DB
    for (let i = 0; i < 5; i++) {
      const ts = new Date(Date.now() - (5 - i) * 1000).toISOString();
      db.db
        .prepare('INSERT INTO messages (id, trip_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), tripId, ownerId, `Message ${i}`, ts);
    }
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /messages → 200 returns { messages, nextCursor }', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages).toHaveLength(5);
    expect(res.body).toHaveProperty('nextCursor');
    expect(res.body.messages[0]).toHaveProperty('content');
    expect(res.body.messages[0]).toHaveProperty('user_name');
  });

  it('GET /messages?limit=2 → returns 2 messages and nextCursor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/messages?limit=2`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.nextCursor).not.toBeNull();
  });

  it('viewer can GET → 200', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/messages`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
  });

  it('unauthenticated → 401', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/messages`)
      .expect(401);
  });
});
