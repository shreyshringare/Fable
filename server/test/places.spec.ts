// server/test/places.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

async function registerAndLogin(app: INestApplication, email: string, name: string) {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password: 'password123', name });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

describe('Places (integration)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let tripId: string;
  let dayId: string;
  let placeId: string;
  let place2Id: string;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await registerAndLogin(app, 'places-owner@test.com', 'Owner');
    viewerToken = await registerAndLogin(app, 'places-viewer@test.com', 'Viewer');

    const tr = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Places Trip', start_date: '2026-08-01', end_date: '2026-08-01' })
      .expect(201);
    tripId = tr.body.trip.id;
    dayId = tr.body.days[0].id;

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'places-viewer@test.com', role: 'viewer' });
  }, 30000);

  afterAll(async () => { await app.close(); });

  it('POST place → 201 with name and order_index 0', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/days/${dayId}/places`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Colosseum', lat: 41.8902, lng: 12.4922, category: 'sight' })
      .expect(201);
    expect(res.body.name).toBe('Colosseum');
    expect(res.body.order_index).toBe(0);
    expect(res.body.day_id).toBe(dayId);
    placeId = res.body.id;
  });

  it('POST second place → order_index 1', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/days/${dayId}/places`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Trevi Fountain', lat: 41.9009, lng: 12.4834 })
      .expect(201);
    expect(res.body.order_index).toBe(1);
    place2Id = res.body.id;
  });

  it('GET places for day → 200 ordered list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/days/${dayId}/places`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].order_index).toBeLessThanOrEqual(res.body[1].order_index);
  });

  it('viewer can GET places → 200', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/days/${dayId}/places`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
  });

  it('viewer cannot POST place → 403', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/days/${dayId}/places`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Hack' })
      .expect(403);
  });

  it('PATCH place → 200 updates name', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/days/${dayId}/places/${placeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Colosseum (Amphitheatrum Flavium)', notes: 'Book tickets' })
      .expect(200);
    expect(res.body.name).toBe('Colosseum (Amphitheatrum Flavium)');
    expect(res.body.notes).toBe('Book tickets');
  });

  it('POST /reorder → 201 swaps order_index', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/days/${dayId}/places/reorder`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ id: placeId, order_index: 1 }, { id: place2Id, order_index: 0 }] })
      .expect(201);
    const updated = res.body as any[];
    const p1 = updated.find((p: any) => p.id === placeId);
    const p2 = updated.find((p: any) => p.id === place2Id);
    expect(p1.order_index).toBe(1);
    expect(p2.order_index).toBe(0);
  });

  it('DELETE place → 200', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/trips/${tripId}/days/${dayId}/places/${placeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});
