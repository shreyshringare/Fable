import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';
import { DbService } from '../src/db/db.service';

async function registerAndLogin(app: INestApplication, email: string, name: string) {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password: 'password123', name });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

const CACHED_LORE = {
  query: 'Colosseum Rome',
  about: 'An ancient amphitheatre in Rome.',
  image: null,
  official_website: null,
  facts: [
    { source_title: 'Colosseum', heading: 'History', text: 'Built in 70–80 AD.', url: 'https://en.wikipedia.org/wiki/Colosseum' },
  ],
};

describe('Lore (integration)', () => {
  let app: INestApplication;
  let token: string;
  let db: DbService;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DbService);
    token = await registerAndLogin(app, 'lore-user@test.com', 'Lore User');

    // Pre-warm cache so no real Wikipedia fetch occurs
    // Cache key format: v2|<query lowercase>|<lat>|<lng>
    const cacheKey = 'v2|colosseum rome||';
    db.db
      .prepare('INSERT OR REPLACE INTO lore_cache (key, payload, fetched_at) VALUES (?, ?, ?)')
      .run(cacheKey, JSON.stringify(CACHED_LORE), new Date().toISOString());
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /lore?q=Colosseum Rome → 200 with expected shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/lore?q=Colosseum%20Rome')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.query).toBe('Colosseum Rome');
    expect(res.body.about).toBe(CACHED_LORE.about);
    expect(Array.isArray(res.body.facts)).toBe(true);
    expect(res.body.facts[0].heading).toBe('History');
  });

  it('GET /lore without q → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/lore')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('GET /lore with bad lat → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/lore?q=Rome&lat=notanumber')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('unauthenticated → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/lore?q=Rome')
      .expect(401);
  });
});
