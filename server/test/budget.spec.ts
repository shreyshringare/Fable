import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

async function registerAndLogin(app: INestApplication, email: string, name: string) {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password: 'password123', name });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

describe('Budget (integration)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let tripId: string;
  let itemId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await registerAndLogin(app, 'budget-owner@test.com', 'Owner');
    viewerToken = await registerAndLogin(app, 'budget-viewer@test.com', 'Viewer');

    const tr = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Budget Trip' })
      .expect(201);
    tripId = tr.body.trip.id;

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'budget-viewer@test.com', role: 'viewer' });
  }, 30000);

  afterAll(async () => { await app.close(); });

  it('POST /budget → 201 creates expense', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/budget`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ category: 'food', label: 'Dinner', amount: 45.50, currency: 'USD' })
      .expect(201);
    expect(res.body.label).toBe('Dinner');
    expect(res.body.amount).toBe(45.50);
    expect(res.body.category).toBe('food');
    expect(Array.isArray(res.body.split_among)).toBe(true);
    itemId = res.body.id;
  });

  it('GET /budget → 200 lists items', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/budget`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.some((i: any) => i.id === itemId)).toBe(true);
  });

  it('viewer can GET → 200', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/budget`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
  });

  it('viewer cannot POST → 403', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/budget`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ category: 'food', label: 'Lunch', amount: 20 })
      .expect(403);
  });

  it('PATCH /budget/:itemId → 200 updates amount', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/budget/${itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 60.00 })
      .expect(200);
    expect(res.body.amount).toBe(60.00);
  });

  it('DELETE /budget/:itemId → 200', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/trips/${tripId}/budget/${itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});
