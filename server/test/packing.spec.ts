import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

async function registerAndLogin(app: INestApplication, email: string, name: string) {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password: 'password123', name });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

describe('Packing (integration)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let tripId: string;
  let itemId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await registerAndLogin(app, 'packing-owner@test.com', 'Owner');
    viewerToken = await registerAndLogin(app, 'packing-viewer@test.com', 'Viewer');

    const tr = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Packing Trip' })
      .expect(201);
    tripId = tr.body.trip.id;

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'packing-viewer@test.com', role: 'viewer' });
  }, 30000);

  afterAll(async () => { await app.close(); });

  it('POST /packing → 201 creates item', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/packing`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ label: 'Passport', category: 'documents', quantity: 1 })
      .expect(201);
    expect(res.body.label).toBe('Passport');
    expect(res.body.category).toBe('documents');
    expect(res.body.packed).toBe(false);
    itemId = res.body.id;
  });

  it('GET /packing → 200 lists items', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/packing`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.some((i: any) => i.id === itemId)).toBe(true);
  });

  it('viewer can GET → 200', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/packing`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
  });

  it('viewer cannot POST → 403', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/packing`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ label: 'Sunscreen' })
      .expect(403);
  });

  it('PATCH /packing/:itemId → 200 toggles packed', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/packing/${itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ packed: true })
      .expect(200);
    expect(res.body.packed).toBe(true);
  });

  it('DELETE /packing/:itemId → 200', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/trips/${tripId}/packing/${itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});
