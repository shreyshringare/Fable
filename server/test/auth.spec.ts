import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, extractCookie } from './helpers';

const REFRESH_COOKIE = 'fable_rt';

describe('Auth (integration)', () => {
  let app: INestApplication;
  const BASE = '/api/v1/auth';

  const user = { email: 'alice@test.com', password: 'password123', name: 'Alice' };

  beforeAll(async () => {
    app = await createTestApp();
  }, 30000);

  afterAll(async () => {
    await app.close();
  }, 15000);

  // ─── Register ────────────────────────────────────────────────────────────────

  it('POST /register → 201 with user and accessToken', async () => {
    const res = await request(app.getHttpServer())
      .post(`${BASE}/register`)
      .send(user)
      .expect(201);

    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.name).toBe(user.name);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('POST /register duplicate email → 409', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/register`)
      .send(user)
      .expect(409);
  });

  // ─── Login ───────────────────────────────────────────────────────────────────

  it('POST /login → 200 with accessToken and refresh cookie', async () => {
    const res = await request(app.getHttpServer())
      .post(`${BASE}/login`)
      .send({ email: user.email, password: user.password })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(user.email);
    const cookie = extractCookie(res, REFRESH_COOKIE);
    expect(cookie).toBeDefined();
  });

  it('POST /login wrong password → 401', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/login`)
      .send({ email: user.email, password: 'wrong' })
      .expect(401);
  });

  // ─── Refresh ─────────────────────────────────────────────────────────────────

  it('POST /refresh with valid cookie → 200 new accessToken', async () => {
    const loginRes = await request(app.getHttpServer())
      .post(`${BASE}/login`)
      .send({ email: user.email, password: user.password });

    const cookie = extractCookie(loginRes, REFRESH_COOKIE) as string;

    const res = await request(app.getHttpServer())
      .post(`${BASE}/refresh`)
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
  });

  it('POST /refresh with no cookie → 401', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/refresh`)
      .expect(401);
  });

  // ─── Protected route ─────────────────────────────────────────────────────────

  it('GET /trips without auth → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/trips')
      .expect(401);
  });

  // ─── Logout ──────────────────────────────────────────────────────────────────

  it('POST /logout → 204 and token revoked', async () => {
    const loginRes = await request(app.getHttpServer())
      .post(`${BASE}/login`)
      .send({ email: user.email, password: user.password });

    const cookie = extractCookie(loginRes, REFRESH_COOKIE) as string;

    await request(app.getHttpServer())
      .post(`${BASE}/logout`)
      .set('Cookie', cookie)
      .expect(204);

    // Refresh after logout should fail (token revoked)
    await request(app.getHttpServer())
      .post(`${BASE}/refresh`)
      .set('Cookie', cookie)
      .expect(401);
  });
});
