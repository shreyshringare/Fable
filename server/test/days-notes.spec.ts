// server/test/days-notes.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

async function registerAndLogin(app: INestApplication, email: string, name: string) {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password: 'password123', name });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

describe('Days & Notes (integration)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let tripId: string;
  let dayId: string;
  let noteId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await registerAndLogin(app, 'days-owner@test.com', 'Owner');
    viewerToken = await registerAndLogin(app, 'days-viewer@test.com', 'Viewer');

    const tr = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Day Test Trip', start_date: '2026-08-01', end_date: '2026-08-01' })
      .expect(201);
    tripId = tr.body.trip.id;
    dayId = tr.body.days[0].id;

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'days-viewer@test.com', role: 'viewer' });
  }, 30000);

  afterAll(async () => { await app.close(); });

  it('GET /trips/:id/days → lists existing day', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/days`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((d: any) => d.id === dayId)).toBe(true);
  });

  it('POST /trips/:id/days → 201 creates day', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/days`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ date: '2026-09-01' })
      .expect(201);
    expect(res.body.date).toBe('2026-09-01');
  });

  it('PATCH /trips/:id/days/:dayId → updates notes', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/days/${dayId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ notes: 'Arrive early' })
      .expect(200);
    expect(res.body.notes).toBe('Arrive early');
  });

  it('viewer cannot PATCH day → 403', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/days/${dayId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ notes: 'hack' })
      .expect(403);
  });

  it('POST /trips/:id/days/:dayId/notes → 201 creates note', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/days/${dayId}/notes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'Check-in at noon', icon: '🏨' })
      .expect(201);
    expect(res.body.content).toBe('Check-in at noon');
    expect(res.body.day_id).toBe(dayId);
    noteId = res.body.id;
  });

  it('GET /trips/:id/days/:dayId/notes → 200 lists notes', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/days/${dayId}/notes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.some((n: any) => n.id === noteId)).toBe(true);
  });

  it('viewer can GET notes → 200', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/days/${dayId}/notes`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
  });

  it('PATCH note → 200 updates content', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/days/${dayId}/notes/${noteId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'Updated note' })
      .expect(200);
    expect(res.body.content).toBe('Updated note');
  });

  it('viewer cannot PATCH note → 403', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/days/${dayId}/notes/${noteId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ content: 'hack' })
      .expect(403);
  });

  it('DELETE note → 200', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/trips/${tripId}/days/${dayId}/notes/${noteId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});
