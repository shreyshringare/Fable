import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

async function registerAndLogin(
  app: INestApplication,
  email: string,
  name: string,
): Promise<string> {
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password: 'password123', name });
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

describe('Trips (integration)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let viewerUserId: string;
  let tripId: string;

  beforeAll(async () => {
    app = await createTestApp();

    ownerToken = await registerAndLogin(app, 'owner@test.com', 'Owner');
    viewerToken = await registerAndLogin(app, 'viewer@test.com', 'Viewer');

    // Fetch viewer's user id from their trip list (empty, but /me endpoint works)
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${viewerToken}`);
    viewerUserId = meRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  it('POST /trips → 201 creates trip with auto-generated days', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Tokyo Adventure', start_date: '2026-08-01', end_date: '2026-08-03' })
      .expect(201);

    expect(res.body.trip.name).toBe('Tokyo Adventure');
    expect(res.body.members).toHaveLength(1);
    expect(res.body.days).toHaveLength(3); // Aug 1–3
    tripId = res.body.trip.id;
  });

  it('GET /trips → lists the owner\'s trip', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((t: any) => t.id === tripId)).toBe(true);
  });

  it('GET /trips/:id → returns full trip detail', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.trip.id).toBe(tripId);
    expect(res.body.members).toBeDefined();
    expect(res.body.days).toBeDefined();
    expect(res.body.places).toBeDefined();
  });

  it('PATCH /trips/:id → updates trip name', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Tokyo & Kyoto' })
      .expect(200);

    expect(res.body.name).toBe('Tokyo & Kyoto');
  });

  // ─── RBAC ────────────────────────────────────────────────────────────────────

  it('viewer cannot access trip before being added → 403', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);
  });

  it('viewer added to trip can GET but cannot DELETE → 403', async () => {
    // Owner adds viewer
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'viewer@test.com', role: 'viewer' })
      .expect(201);

    // Viewer can read
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    // Viewer cannot delete
    await request(app.getHttpServer())
      .delete(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);
  });

  // ─── Delete ──────────────────────────────────────────────────────────────────

  it('DELETE /trips/:id as owner → 200', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Temp Trip' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/trips/${createRes.body.trip.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
  });
});
