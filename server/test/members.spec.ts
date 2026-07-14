// server/test/members.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

async function registerAndLogin(app: INestApplication, email: string, name: string) {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password: 'password123', name });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

describe('Members (integration)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let tripId: string;
  let viewerUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken  = await registerAndLogin(app, 'mem-owner@test.com', 'Owner');
    viewerToken = await registerAndLogin(app, 'mem-viewer@test.com', 'Viewer');

    const tr = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Members Trip' })
      .expect(201);
    tripId = tr.body.trip.id;

    const viewerMe = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${viewerToken}`);
    viewerUserId = viewerMe.body.id;
  }, 30000);

  afterAll(async () => { await app.close(); });

  it('GET /members → 200, owner is the only member', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].role).toBe('owner');
  });

  it('POST /members → 201 invites viewer', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'mem-viewer@test.com', role: 'viewer' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toHaveLength(2);
    const viewer = res.body.find((m: any) => m.id === viewerUserId);
    expect(viewer.role).toBe('viewer');
  });

  it('POST /members duplicate → 409', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'mem-viewer@test.com', role: 'viewer' })
      .expect(409);
  });

  it('non-owner cannot invite → 403', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ email: 'anyone@test.com', role: 'editor' })
      .expect(403);
  });

  it('PATCH /members/:userId → owner promotes viewer to editor', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/members/${viewerUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'editor' })
      .expect(200);
    const updated = (res.body as any[]).find((m: any) => m.id === viewerUserId);
    expect(updated.role).toBe('editor');
  });

  it('DELETE /members/:userId → owner removes member', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/trips/${tripId}/members/${viewerUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    // Former member can no longer access trip
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);
  });
});
