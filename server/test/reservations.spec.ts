import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

async function registerAndLogin(app: INestApplication, email: string, name: string) {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password: 'password123', name });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

describe('Reservations (integration)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let tripId: string;
  let resId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await registerAndLogin(app, 'res-owner@test.com', 'Owner');
    viewerToken = await registerAndLogin(app, 'res-viewer@test.com', 'Viewer');

    const tr = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Reservations Trip' })
      .expect(201);
    tripId = tr.body.trip.id;

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'res-viewer@test.com', role: 'viewer' });
  }, 30000);

  afterAll(async () => { await app.close(); });

  it('POST /reservations → 201 creates flight reservation', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/reservations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'flight',
        title: 'NYC → Rome',
        confirmation_number: 'AA123',
        start_datetime: '2026-08-01T08:00:00.000Z',
        cost: 650,
      })
      .expect(201);
    expect(res.body.title).toBe('NYC → Rome');
    expect(res.body.type).toBe('flight');
    expect(res.body.status).toBe('confirmed');
    resId = res.body.id;
  });

  it('GET /reservations → 200 lists reservations', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/reservations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.some((r: any) => r.id === resId)).toBe(true);
  });

  it('viewer can GET → 200', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/reservations`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
  });

  it('viewer cannot POST → 403', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/reservations`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ type: 'flight', title: 'Hack' })
      .expect(403);
  });

  it('PATCH /reservations/:resId → 200 updates status', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/reservations/${resId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'pending' })
      .expect(200);
    expect(res.body.status).toBe('pending');
  });

  it('DELETE /reservations/:resId → 200', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/trips/${tripId}/reservations/${resId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});
