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

describe('Attachments (integration)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let tripId: string;
  let resId: string;
  let attachId: string;

  beforeAll(async () => {
    app = await createTestApp();

    ownerToken = await registerAndLogin(app, 'owner@attach.com', 'AttachOwner');
    viewerToken = await registerAndLogin(app, 'viewer@attach.com', 'AttachViewer');

    const tripRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Doc Trip' })
      .expect(201);
    tripId = tripRes.body.trip.id;

    const resRes = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/reservations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'flight', title: 'ANA 123', status: 'confirmed' })
      .expect(201);
    resId = resRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'viewer@attach.com', role: 'viewer' })
      .expect(201);
  }, 30000);

  afterAll(async () => {
    await app.close();
  }, 15000);

  it('POST /reservations/:resId/attachments → 201 with correct shape', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/reservations/${resId}/attachments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'boarding-pass.pdf',
        url: '/uploads/documents/test-uuid.pdf',
        mime_type: 'application/pdf',
        size: 204800,
      })
      .expect(201);

    expect(res.body.name).toBe('boarding-pass.pdf');
    expect(res.body.reservation_id).toBe(resId);
    expect(res.body.trip_id).toBe(tripId);
    expect(res.body.size).toBe(204800);
    attachId = res.body.id;
  });

  it('GET /reservations/:resId/attachments → 200 array includes posted item', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/reservations/${resId}/attachments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((a: any) => a.id === attachId)).toBe(true);
  });

  it('GET /documents → 200 includes reservation_title and reservation_type', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/documents`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const item = res.body.find((a: any) => a.id === attachId);
    expect(item).toBeDefined();
    expect(item.reservation_title).toBe('ANA 123');
    expect(item.reservation_type).toBe('flight');
  });

  it('viewer GET /documents → 200', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/documents`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
  });

  it('viewer POST attachment → 403', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/reservations/${resId}/attachments`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        name: 'sneaky.pdf',
        url: '/uploads/documents/sneaky.pdf',
        mime_type: 'application/pdf',
        size: 1000,
      })
      .expect(403);
  });

  it('DELETE attachment → 200, gone from subsequent GET', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/trips/${tripId}/reservations/${resId}/attachments/${attachId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/reservations/${resId}/attachments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.find((a: any) => a.id === attachId)).toBeUndefined();
  });
});
