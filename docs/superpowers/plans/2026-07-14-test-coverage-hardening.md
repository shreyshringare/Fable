# Test Coverage + Code Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add integration tests for all 7 untested server feature areas, add client utility + component tests, and fix 3 concrete code quality issues (rate-limit isolation, WS token in URL, message pagination).

**Architecture:** Server tests use Jest + Supertest against an in-memory SQLite DB (`TestDbService`). Client utility tests use vitest in Node. Client component tests use vitest + jsdom + @testing-library/react with `vi.mock` for network/heavy deps. Hardening changes are isolated to 3 files on the server and 1 on the client.

**Tech Stack:** NestJS 10, better-sqlite3, Jest 29, Supertest 7, Vitest 2, @testing-library/react, jsdom

---

## File Map

**New files:**
- `server/test/days-notes.spec.ts` — days + day-notes CRUD + RBAC
- `server/test/places.spec.ts` — places CRUD + reorder + RBAC
- `server/test/members.spec.ts` — invite / role-change / remove + RBAC
- `server/test/budget.spec.ts` — budget-item CRUD + RBAC
- `server/test/packing.spec.ts` — packing-item CRUD + RBAC
- `server/test/reservations.spec.ts` — reservation CRUD + RBAC
- `server/test/messages.spec.ts` — message history GET + pagination
- `server/test/lore.spec.ts` — lore cache hit + shape validation
- `client/src/__tests__/api-error.test.ts` — ApiError class + `api` error parsing
- `client/src/__tests__/toast.test.ts` — toast store push/dismiss
- `client/src/__tests__/LoginPage.test.tsx` — renders form, shows error on failure

**Modified files:**
- `client/vite.config.ts` — add `test: { environment: 'jsdom', globals: true }` section
- `client/package.json` — add `@testing-library/react`, `@testing-library/user-event`, `jsdom` to devDependencies
- `server/src/auth/rate-limit.guard.ts` — move `buckets` Map to instance property
- `server/src/ws/ws.service.ts` — auth-on-first-frame (5 s timeout)
- `client/src/lib/ws.ts` — send `AUTH` frame on open instead of token in URL
- `server/src/trips/messages.controller.ts` — lower limits (50/100), return `{ messages, nextCursor }`

---

## Task 1: Days + Day-Notes integration tests

**Files:**
- Create: `server/test/days-notes.spec.ts`

Helper pattern: every spec file registers its own users and creates a fresh trip in `beforeAll`. Tests then run in order, using shared `tripId` / `dayId` state. This matches the existing `auth.spec.ts` / `trips.spec.ts` pattern.

- [ ] **Step 1: Write the spec file**

```typescript
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

    // Create trip with auto-generated day (Aug 1 only)
    const tr = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Day Test Trip', start_date: '2026-08-01', end_date: '2026-08-01' })
      .expect(201);
    tripId = tr.body.trip.id;
    dayId = tr.body.days[0].id;

    // Add viewer to trip
    const viewerMe = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${viewerToken}`);
    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'days-viewer@test.com', role: 'viewer' });
  }, 30000);

  afterAll(async () => { await app.close(); });

  // ─── Days ────────────────────────────────────────────────────────────────────

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

  // ─── Notes ───────────────────────────────────────────────────────────────────

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
```

- [ ] **Step 2: Run and verify it fails (no server running)**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server -- --testPathPattern=days-notes
```
Expected: Tests run and pass (happy path — these all hit real NestJS + in-memory SQLite).

- [ ] **Step 3: Commit**

```bash
cd "D:/Projects/SDE Projects/Fable"
git add server/test/days-notes.spec.ts
git commit -m "test: add days + day-notes integration tests"
```

---

## Task 2: Places integration tests

**Files:**
- Create: `server/test/places.spec.ts`

- [ ] **Step 1: Write the spec file**

```typescript
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

  it('POST /reorder → 200 swaps order_index', async () => {
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
```

- [ ] **Step 2: Run tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server -- --testPathPattern=places
```
Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/test/places.spec.ts
git commit -m "test: add places integration tests"
```

---

## Task 3: Members integration tests

**Files:**
- Create: `server/test/members.spec.ts`

- [ ] **Step 1: Write the spec file**

```typescript
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
  let editorToken: string;
  let viewerToken: string;
  let tripId: string;
  let viewerUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken  = await registerAndLogin(app, 'mem-owner@test.com', 'Owner');
    editorToken = await registerAndLogin(app, 'mem-editor@test.com', 'Editor');
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
      .send({ email: 'mem-editor@test.com', role: 'editor' })
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
```

- [ ] **Step 2: Run tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server -- --testPathPattern=members
```
Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/test/members.spec.ts
git commit -m "test: add members integration tests"
```

---

## Task 4: Budget integration tests

**Files:**
- Create: `server/test/budget.spec.ts`

- [ ] **Step 1: Write the spec file**

```typescript
// server/test/budget.spec.ts
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
```

- [ ] **Step 2: Run tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server -- --testPathPattern=budget
```
Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/test/budget.spec.ts
git commit -m "test: add budget integration tests"
```

---

## Task 5: Packing integration tests

**Files:**
- Create: `server/test/packing.spec.ts`

- [ ] **Step 1: Write the spec file**

```typescript
// server/test/packing.spec.ts
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
```

- [ ] **Step 2: Run tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server -- --testPathPattern=packing
```
Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/test/packing.spec.ts
git commit -m "test: add packing integration tests"
```

---

## Task 6: Reservations integration tests

**Files:**
- Create: `server/test/reservations.spec.ts`

- [ ] **Step 1: Write the spec file**

```typescript
// server/test/reservations.spec.ts
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
```

- [ ] **Step 2: Run tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server -- --testPathPattern=reservations
```
Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/test/reservations.spec.ts
git commit -m "test: add reservations integration tests"
```

---

## Task 7: Messages integration tests

**Files:**
- Create: `server/test/messages.spec.ts`

Note: Messages are created via WebSocket (`SEND_MESSAGE`), not REST. The test inserts messages directly into the DB via `DbService` to set up state, then verifies the REST `GET` endpoint.

- [ ] **Step 1: Write the spec file**

```typescript
// server/test/messages.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';
import { DbService } from '../src/db/db.service';
import { randomUUID } from 'crypto';

async function registerAndLogin(app: INestApplication, email: string, name: string) {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password: 'password123', name });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

describe('Messages (integration)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let tripId: string;
  let ownerId: string;
  let db: DbService;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DbService);

    ownerToken = await registerAndLogin(app, 'msg-owner@test.com', 'Owner');
    viewerToken = await registerAndLogin(app, 'msg-viewer@test.com', 'Viewer');

    const ownerMe = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${ownerToken}`);
    ownerId = ownerMe.body.id;

    const tr = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Messages Trip' })
      .expect(201);
    tripId = tr.body.trip.id;

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'msg-viewer@test.com', role: 'viewer' });

    // Seed 5 messages directly in DB (bypasses WebSocket)
    for (let i = 0; i < 5; i++) {
      const ts = new Date(Date.now() - (5 - i) * 1000).toISOString();
      db.db
        .prepare('INSERT INTO messages (id, trip_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), tripId, ownerId, `Message ${i}`, ts);
    }
  }, 30000);

  afterAll(async () => { await app.close(); });

  it('GET /messages → 200 returns array of messages', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    // After hardening (Task 13) this will be { messages, nextCursor }.
    // Before hardening it's a plain array — test the plain-array shape here.
    const msgs = Array.isArray(res.body) ? res.body : res.body.messages;
    expect(msgs).toHaveLength(5);
    expect(msgs[0]).toHaveProperty('content');
    expect(msgs[0]).toHaveProperty('user_name');
  });

  it('GET /messages?limit=2 → returns only 2', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/messages?limit=2`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const msgs = Array.isArray(res.body) ? res.body : res.body.messages;
    expect(msgs).toHaveLength(2);
  });

  it('viewer can GET → 200', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/messages`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
  });

  it('unauthenticated → 401', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/messages`)
      .expect(401);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server -- --testPathPattern=messages
```
Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/test/messages.spec.ts
git commit -m "test: add messages integration tests"
```

---

## Task 8: Lore integration tests

**Files:**
- Create: `server/test/lore.spec.ts`

The lore service checks the `lore_cache` SQLite table before fetching Wikipedia. Tests pre-insert a cache row so no real HTTP call is made — fast and deterministic.

- [ ] **Step 1: Write the spec file**

```typescript
// server/test/lore.spec.ts
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
    db.db
      .prepare('INSERT OR REPLACE INTO lore_cache (key, payload, fetched_at) VALUES (?, ?, ?)')
      .run('Colosseum Rome', JSON.stringify(CACHED_LORE), new Date().toISOString());
  }, 30000);

  afterAll(async () => { await app.close(); });

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
```

- [ ] **Step 2: Run tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server -- --testPathPattern=lore
```
Expected: All 4 tests pass (cache hit means no HTTP to Wikipedia).

- [ ] **Step 3: Commit**

```bash
git add server/test/lore.spec.ts
git commit -m "test: add lore integration tests (cache hit, validation)"
```

---

## Task 9: Client utility tests

**Files:**
- Create: `client/src/__tests__/api-error.test.ts`
- Create: `client/src/__tests__/toast.test.ts`

Note: `client/src/lib/currency.test.ts` already exists and passes. These new files add coverage for `ApiError` and the toast store.

- [ ] **Step 1: Write api-error.test.ts**

```typescript
// client/src/__tests__/api-error.test.ts
import { describe, it, expect } from 'vitest';
import { ApiError } from '../lib/api';

describe('ApiError', () => {
  it('sets status and message', () => {
    const err = new ApiError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err instanceof Error).toBe(true);
  });

  it('is instanceof ApiError', () => {
    const err = new ApiError(500, 'Server error');
    expect(err instanceof ApiError).toBe(true);
  });
});
```

- [ ] **Step 2: Write toast.test.ts**

The toast store uses `setTimeout` for auto-dismiss. Use vitest fake timers.

```typescript
// client/src/__tests__/toast.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useToastStore } from '../store/toast';

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('push adds a toast', () => {
    useToastStore.getState().push('Something failed');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toBe('Something failed');
    expect(useToastStore.getState().toasts[0].kind).toBe('error');
  });

  it('push with kind=success sets kind', () => {
    useToastStore.getState().push('Saved!', 'success');
    expect(useToastStore.getState().toasts[0].kind).toBe('success');
  });

  it('dismiss removes by id', () => {
    useToastStore.getState().push('First');
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-dismisses after 4500ms', () => {
    useToastStore.getState().push('Temporary');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4500);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('keeps at most last 4 toasts (slice -3 + new)', () => {
    for (let i = 0; i < 5; i++) useToastStore.getState().push(`msg ${i}`);
    // slice(-3) keeps last 3 existing, then adds new = 4 total
    expect(useToastStore.getState().toasts.length).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 3: Run client tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=client
```
Expected: All tests pass (currency.test.ts + api-error.test.ts + toast.test.ts).

- [ ] **Step 4: Commit**

```bash
git add client/src/__tests__/api-error.test.ts client/src/__tests__/toast.test.ts
git commit -m "test: add ApiError and toast store unit tests"
```

---

## Task 10: Setup jsdom + component tests (LoginPage)

**Files:**
- Modify: `client/vite.config.ts` — add `test` section
- Modify: `client/package.json` — add testing-library deps
- Create: `client/src/__tests__/LoginPage.test.tsx`

- [ ] **Step 1: Install testing-library packages**

```bash
cd "D:/Projects/SDE Projects/Fable/client"
npm install --save-dev @testing-library/react @testing-library/user-event jsdom
```

- [ ] **Step 2: Update vite.config.ts to add test section**

Open `client/vite.config.ts` and add `test` to `defineConfig`:

```typescript
// client/vite.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.FABLE_API_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Fable — Trip Planner',
        short_name: 'Fable',
        description: 'Collaborative travel planning with maps, budgets and lore',
        theme_color: '#4f46e5',
        background_color: '#f9fafb',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/ws/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-maplibre': ['maplibre-gl'],
          'vendor-recharts': ['recharts'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
      '/ws': { target: apiTarget.replace('http', 'ws'), ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 3: Write LoginPage.test.tsx**

`LoginPage` imports `Globe` (a heavy 3D component) and uses `react-router-dom` hooks. Both need mocking.

```typescript
// client/src/__tests__/LoginPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';

// Globe uses maplibre-gl / WebGL — not available in jsdom
vi.mock('../components/Globe', () => ({ default: () => <div data-testid="globe-mock" /> }));

// Mock the api module so no real HTTP calls are made
vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  api: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock auth store to start unauthenticated
vi.mock('../store/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: null,
    setSession: vi.fn(),
    booted: true,
  })),
}));

import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as any).mockReturnValue({ user: null, setSession: vi.fn(), booted: true });
  });

  it('renders email and password inputs', () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows error message when login fails', async () => {
    (api.post as any).mockRejectedValueOnce({ message: 'Invalid credentials' });
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), 'bad@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('calls api.post with email and password on submit', async () => {
    const setSession = vi.fn();
    (useAuthStore as any).mockReturnValue({ user: null, setSession, booted: true });
    (api.post as any).mockResolvedValueOnce({ user: { id: '1', email: 'test@test.com', name: 'Test' }, accessToken: 'tok' });

    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'test@test.com', password: 'password123' });
    });
    expect(setSession).toHaveBeenCalledWith(
      { id: '1', email: 'test@test.com', name: 'Test' },
      'tok'
    );
  });
});
```

- [ ] **Step 4: Run client tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=client
```
Expected: currency + api-error + toast + LoginPage all pass.

- [ ] **Step 5: Commit**

```bash
git add client/vite.config.ts client/package.json client/src/__tests__/LoginPage.test.tsx
git commit -m "test: add jsdom setup and LoginPage component tests"
```

---

## Task 11: Harden rate-limit guard (instance property)

**Files:**
- Modify: `server/src/auth/rate-limit.guard.ts`

**Problem:** `buckets` is a module-level `Map`. It persists across test suites in the same Node process, causing test pollution. Each `createTestApp()` gets a fresh `AuthRateLimitGuard` instance but they all share the same Map.

**Fix:** Move `buckets` and the cleanup interval into the class instance.

- [ ] **Step 1: Rewrite rate-limit.guard.ts**

```typescript
// server/src/auth/rate-limit.guard.ts
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

/** Simple in-memory rate limiter for credential endpoints (per IP + route). */
@Injectable()
export class AuthRateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly buckets = new Map<string, Bucket>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    // Sweep expired buckets once per window to prevent unbounded growth.
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, b] of this.buckets) {
        if (b.resetAt < now) this.buckets.delete(k);
      }
    }, WINDOW_MS).unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    const key = `${ip}:${req.route?.path ?? req.url}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > MAX_ATTEMPTS) {
      throw new HttpException(
        'Too many attempts, try again in a minute',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
```

- [ ] **Step 2: Run full server test suite to confirm no regressions**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server
```
Expected: All existing + new spec files pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/auth/rate-limit.guard.ts
git commit -m "fix: move rate-limit buckets to instance property (test isolation + OnModuleDestroy cleanup)"
```

---

## Task 12: Harden WebSocket auth (token off URL, first-frame AUTH)

**Files:**
- Modify: `server/src/ws/ws.service.ts`
- Modify: `client/src/lib/ws.ts`

**Problem:** `new WebSocket('/ws?token=<jwt>')` puts the JWT in the URL, visible in server access logs, proxy logs, and browser history.

**Fix:** Connect to `/ws` with no token. Server waits up to 5 seconds for an `{"type":"AUTH","token":"<jwt>"}` frame. On success, normal session begins. On timeout or bad token, close with code 4001.

- [ ] **Step 1: Update ws.service.ts**

Replace the `wss.on('connection', ...)` handler. The rest of the file (heartbeat, `onMessage`, `broadcast`, etc.) stays identical.

```typescript
// server/src/ws/ws.service.ts  — full file
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { DbService } from '../db/db.service';

interface WsClient {
  ws: WebSocket;
  userId: string;
  name: string;
  avatarUrl: string | null;
  trips: Set<string>;
  alive: boolean;
}

const AUTH_TIMEOUT_MS = 5_000;

@Injectable()
export class WsService {
  private clients = new Set<WsClient>();

  constructor(
    private readonly jwt: JwtService,
    private readonly dbs: DbService,
  ) {}

  attach(server: HttpServer) {
    const wss = new WebSocketServer({ server, path: '/ws' });

    const heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
    }, 30_000);
    heartbeat.unref();
    wss.on('close', () => clearInterval(heartbeat));

    wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      // Wait for first AUTH frame before creating a WsClient.
      const authTimeout = setTimeout(() => {
        ws.close(4001, 'auth timeout');
      }, AUTH_TIMEOUT_MS);

      ws.once('message', (raw) => {
        clearTimeout(authTimeout);
        let msg: { type?: string; token?: string };
        try {
          msg = JSON.parse(String(raw));
        } catch {
          ws.close(4001, 'bad auth frame');
          return;
        }
        if (msg.type !== 'AUTH' || typeof msg.token !== 'string') {
          ws.close(4001, 'bad auth frame');
          return;
        }
        let payload: { sub: string };
        try {
          payload = this.jwt.verify(msg.token);
        } catch {
          ws.close(4001, 'unauthorized');
          return;
        }
        const user = this.dbs.db
          .prepare('SELECT id, name, avatar_url FROM users WHERE id = ?')
          .get(payload.sub) as { id: string; name: string; avatar_url: string | null } | undefined;
        if (!user) {
          ws.close(4001, 'unauthorized');
          return;
        }
        const client: WsClient = {
          ws,
          userId: user.id,
          name: user.name,
          avatarUrl: user.avatar_url,
          trips: new Set(),
          alive: true,
        };
        this.clients.add(client);
        ws.on('pong', () => { client.alive = true; });
        ws.on('message', (data) => {
          try {
            this.onMessage(client, JSON.parse(String(data)));
          } catch {
            /* ignore malformed frames */
          }
        });
        ws.on('close', () => {
          const trips = [...client.trips];
          this.clients.delete(client);
          trips.forEach((t) => this.sendPresence(t));
        });
      });
    });
  }

  private memberRole(tripId: string, userId: string): string | null {
    const row = this.dbs.db
      .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
      .get(tripId, userId) as { role: string } | undefined;
    return row ? row.role : null;
  }

  private onMessage(client: WsClient, msg: any) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'JOIN_TRIP': {
        if (typeof msg.tripId !== 'string') return;
        if (!this.memberRole(msg.tripId, client.userId)) return;
        client.trips.add(msg.tripId);
        this.sendPresence(msg.tripId);
        break;
      }
      case 'LEAVE_TRIP': {
        if (typeof msg.tripId !== 'string') return;
        client.trips.delete(msg.tripId);
        this.sendPresence(msg.tripId);
        break;
      }
      case 'TYPING': {
        if (typeof msg.tripId !== 'string' || !client.trips.has(msg.tripId)) return;
        this.broadcast(msg.tripId, 'TYPING', { userId: client.userId, name: client.name });
        break;
      }
      case 'SEND_MESSAGE': {
        if (typeof msg.tripId !== 'string') return;
        const role = this.memberRole(msg.tripId, client.userId);
        if (!role || role === 'viewer') return;
        const content = String(msg.content ?? '').trim().slice(0, 2000);
        if (!content) return;
        const id = randomUUID();
        this.dbs.db
          .prepare('INSERT INTO messages (id, trip_id, user_id, content) VALUES (?, ?, ?, ?)')
          .run(id, msg.tripId, client.userId, content);
        const message = this.dbs.db
          .prepare(
            `SELECT m.*, u.name AS user_name, u.avatar_url AS user_avatar
             FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
          )
          .get(id);
        this.broadcast(msg.tripId, 'MESSAGE_SENT', message);
        break;
      }
      default:
        break;
    }
  }

  sendPresence(tripId: string) {
    const users = new Map<string, { id: string; name: string; avatar_url: string | null }>();
    for (const c of this.clients) {
      if (c.trips.has(tripId)) {
        users.set(c.userId, { id: c.userId, name: c.name, avatar_url: c.avatarUrl });
      }
    }
    this.broadcast(tripId, 'PRESENCE', { users: [...users.values()] });
  }

  broadcast(tripId: string, type: string, payload: unknown) {
    const data = JSON.stringify({ type, tripId, payload });
    for (const c of this.clients) {
      if (c.trips.has(tripId) && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(data);
      }
    }
  }
}
```

- [ ] **Step 2: Update client/src/lib/ws.ts `connect()` method**

Change the WebSocket URL (remove token) and send an AUTH frame in `onopen`.

The `connect()` method currently reads:
```typescript
this.ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
this.ws.onopen = () => { ... };
```

Change it to:
```typescript
this.ws = new WebSocket(`${proto}://${location.host}/ws`);
this.ws.onopen = () => {
  // Authenticate via first frame — token never touches the URL/logs
  this.ws!.send(JSON.stringify({ type: 'AUTH', token }));
  const wasRetry = this.retry > 0;
  this.retry = 0;
  if (this.tripId) {
    this.send({ type: 'JOIN_TRIP', tripId: this.tripId });
    if (wasRetry) useTripStore.getState().reload();
  }
};
```

Open `client/src/lib/ws.ts` and apply this change. Only the `connect()` method body changes; everything else stays identical.

- [ ] **Step 3: Run all tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server
npm run test --workspace=client
```
Expected: All tests pass (WS is not tested via integration tests — manual verification needed when dev server is running).

- [ ] **Step 4: Commit**

```bash
git add server/src/ws/ws.service.ts client/src/lib/ws.ts
git commit -m "fix: move WS auth from URL query param to first-frame AUTH message"
```

---

## Task 13: Harden messages pagination (lower limits, add nextCursor)

**Files:**
- Modify: `server/src/trips/messages.controller.ts`

**Current state:** default limit=100, max=200, response is a plain array.  
**Target:** default limit=50, max=100, response is `{ messages: [...], nextCursor: string | null }` where `nextCursor` is the `created_at` of the oldest returned message when more exist.

The `nextCursor` is determined by fetching `take + 1` rows. If we get more than `take`, there are more pages. Return only `take`, set `nextCursor` to the `created_at` of the last (oldest) row in the result.

- [ ] **Step 1: Rewrite messages.controller.ts**

```typescript
// server/src/trips/messages.controller.ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DbService } from '../db/db.service';
import { AccessService } from './access.service';

@Controller('trips/:tripId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly dbs: DbService,
    private readonly access: AccessService,
  ) {}

  /** Chat history with cursor-based pagination. Creation is via WebSocket only. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    const take = Math.min(Number(limit) || 50, 100);
    // Fetch one extra to detect whether a next page exists.
    const fetchCount = take + 1;
    const rows = before
      ? this.dbs.db
          .prepare(
            `SELECT m.*, u.name AS user_name, u.avatar_url AS user_avatar
             FROM messages m JOIN users u ON u.id = m.user_id
             WHERE m.trip_id = ? AND m.created_at < ?
             ORDER BY m.created_at DESC LIMIT ?`,
          )
          .all(tripId, before, fetchCount)
      : this.dbs.db
          .prepare(
            `SELECT m.*, u.name AS user_name, u.avatar_url AS user_avatar
             FROM messages m JOIN users u ON u.id = m.user_id
             WHERE m.trip_id = ?
             ORDER BY m.created_at DESC LIMIT ?`,
          )
          .all(tripId, fetchCount);

    const hasMore = rows.length > take;
    const page = (rows as any[]).slice(0, take).reverse(); // chronological order
    const nextCursor = hasMore ? (rows[take - 1] as any).created_at : null;

    return { messages: page, nextCursor };
  }
}
```

- [ ] **Step 2: Update messages.spec.ts assertions to match new shape**

The messages spec (Task 7) already handles both shapes via `Array.isArray(res.body) ? res.body : res.body.messages`. After this task, the response is always the new shape. Update the spec to assert on the new shape directly:

In `server/test/messages.spec.ts`, replace both assertions that use `Array.isArray`:

```typescript
// Replace the two existing list assertions with:
it('GET /messages → 200 returns { messages, nextCursor }', async () => {
  const res = await request(app.getHttpServer())
    .get(`/api/v1/trips/${tripId}/messages`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .expect(200);
  expect(Array.isArray(res.body.messages)).toBe(true);
  expect(res.body.messages).toHaveLength(5);
  expect(res.body).toHaveProperty('nextCursor');
  expect(res.body.messages[0]).toHaveProperty('content');
  expect(res.body.messages[0]).toHaveProperty('user_name');
});

it('GET /messages?limit=2 → returns 2 messages and a nextCursor', async () => {
  const res = await request(app.getHttpServer())
    .get(`/api/v1/trips/${tripId}/messages?limit=2`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .expect(200);
  expect(res.body.messages).toHaveLength(2);
  expect(res.body.nextCursor).not.toBeNull();
});
```

- [ ] **Step 3: Run all tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server
npm run test --workspace=client
```
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/trips/messages.controller.ts server/test/messages.spec.ts
git commit -m "fix: lower message pagination limits (50/100), return { messages, nextCursor }"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] places + days + notes — Tasks 1 + 2
- [x] members — Task 3
- [x] budget — Task 4
- [x] packing — Task 5
- [x] reservations — Task 6
- [x] messages REST + pagination — Tasks 7 + 13
- [x] lore cache hit — Task 8
- [x] client utility tests — Task 9
- [x] client component tests + jsdom — Task 10
- [x] rate-limit guard isolation — Task 11
- [x] WS auth first-frame — Task 12
- [x] message nextCursor pagination — Task 13

**Placeholder scan:** No TBDs, no "handle edge cases", no "similar to Task N" patterns. All code blocks show exact implementation.

**Type consistency:**
- `createTestApp` and `registerAndLogin` — identical signature used in all 8 server specs ✓
- `DbService.db` used directly in messages.spec.ts and lore.spec.ts (matches the real class) ✓
- `{ messages, nextCursor }` shape defined once in controller and matched exactly in messages.spec.ts Task 13 assertions ✓
- `WsClient` interface unchanged — only the auth handshake sequence changes ✓
