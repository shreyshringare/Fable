# Trip Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-file attachments to reservations (tickets, confirmations, PDFs) with a per-card upload UI and an "All Documents" slide-in sidebar that aggregates every file across the trip.

**Architecture:** New `reservation_attachments` DB table (migration 004). New `AttachmentsController` registered in `TripsModule` handles CRUD + aggregated list. Existing Multer upload endpoint extended with a `documents` kind. Client stores documents in Zustand as a flat `documents[]` array and handles `DOCUMENTS_UPDATED` WS events. `ReservationsTab` renders per-reservation attachment rows; new `DocumentsSidebar` component renders the aggregated list.

**Tech Stack:** NestJS 10, better-sqlite3, Multer (disk), Vitest 2 (client — no new component tests this cycle), Jest 29 + Supertest (server integration tests)

---

## File Map

**New server files:**
- `server/migrations/004_reservation_attachments.sql`
- `server/src/trips/attachments.controller.ts`
- `server/test/attachments.spec.ts`

**Modified server files:**
- `server/src/uploads/uploads.controller.ts` — add `'documents'` to `KINDS`
- `server/src/trips/dto.ts` — add `CreateAttachmentDto`
- `server/src/trips/trips.module.ts` — register `AttachmentsController`

**New client files:**
- `client/src/components/DocumentsSidebar.tsx`

**Modified client files:**
- `client/src/types.ts` — add `ReservationAttachment` interface
- `client/src/store/trip.ts` — add `documents` state, fetch on load, handle WS event
- `client/src/components/ReservationsTab.tsx` — attachment rows + upload + sidebar trigger

---

## Task 1: DB migration + extend upload kinds

**Files:**
- Create: `server/migrations/004_reservation_attachments.sql`
- Modify: `server/src/uploads/uploads.controller.ts`

Context: `TestDbService` auto-runs every `.sql` file in `server/migrations/` sorted alphabetically. Adding the migration file is sufficient for tests to pick it up. The uploads controller has a `KINDS` constant that gates which subdirectories are allowed.

- [ ] **Step 1: Write the failing test (verify table exists via server integration)**

This table is exercised by Task 3's spec file. Write a placeholder to confirm the migration runs without crashing — actually this is confirmed by the test app starting successfully in Task 3. For now just create the migration file.

- [ ] **Step 2: Create `server/migrations/004_reservation_attachments.sql`**

```sql
CREATE TABLE reservation_attachments (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_res_attachments_res ON reservation_attachments(reservation_id);
CREATE INDEX idx_res_attachments_trip ON reservation_attachments(trip_id);
```

- [ ] **Step 3: Add `'documents'` to KINDS in uploads controller**

Read `server/src/uploads/uploads.controller.ts`. Find:

```typescript
const KINDS = ['covers', 'places', 'reservations', 'avatars'];
```

Replace with:

```typescript
const KINDS = ['covers', 'places', 'reservations', 'avatars', 'documents'];
```

- [ ] **Step 4: Confirm existing server tests still pass**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server 2>&1 | tail -5
```

Expected: 65 passed, 65 total.

- [ ] **Step 5: Commit**

```bash
git add server/migrations/004_reservation_attachments.sql server/src/uploads/uploads.controller.ts
git commit -m "feat: add reservation_attachments migration and documents upload kind"
```

---

## Task 2: CreateAttachmentDto + AttachmentsController + module registration

**Files:**
- Modify: `server/src/trips/dto.ts`
- Create: `server/src/trips/attachments.controller.ts`
- Modify: `server/src/trips/trips.module.ts`

Context:
- Existing DTO pattern in `dto.ts`: class-validator decorators, `@IsString()`, `@IsInt()`, `@IsOptional()`, etc.
- `UPLOAD_DIR` is exported from `server/src/app.module.ts` — import it to build the disk path for deletion.
- `AccessService.requireRole(tripId, userId, minRole)` throws `ForbiddenException` if role insufficient.
- `WsService.broadcast(tripId, eventType, payload)` sends to all trip room members.
- Controller base path `'trips/:tripId'` — NestJS merges `@Param('tripId')` automatically.

- [ ] **Step 1: Add `CreateAttachmentDto` to `server/src/trips/dto.ts`**

Read `server/src/trips/dto.ts` first. Append at the end of the file:

```typescript
// ---------- Attachments ----------
export class CreateAttachmentDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  url: string;

  @IsString()
  @MinLength(1)
  mime_type: string;

  @IsInt()
  @Min(1)
  size: number;
}
```

`@IsInt` and `@Min` are already imported in the file. `@IsString` and `@MinLength` are already imported too.

- [ ] **Step 2: Create `server/src/trips/attachments.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { UPLOAD_DIR } from '../app.module';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DbService } from '../db/db.service';
import { WsService } from '../ws/ws.service';
import { AccessService } from './access.service';
import { CreateAttachmentDto } from './dto';

@Controller('trips/:tripId')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(
    private readonly dbs: DbService,
    private readonly ws: WsService,
    private readonly access: AccessService,
  ) {}

  /** All attachments across all reservations — used by the sidebar. */
  @Get('documents')
  listAll(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    return this.dbs.db
      .prepare(
        `SELECT ra.*, r.title AS reservation_title, r.type AS reservation_type
         FROM reservation_attachments ra
         JOIN reservations r ON r.id = ra.reservation_id
         WHERE ra.trip_id = ?
         ORDER BY ra.created_at DESC`,
      )
      .all(tripId);
  }

  /** Attachments for one reservation. */
  @Get('reservations/:resId/attachments')
  list(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('resId') resId: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'viewer');
    this.requireReservation(resId, tripId);
    return this.dbs.db
      .prepare(
        'SELECT * FROM reservation_attachments WHERE reservation_id = ? ORDER BY created_at ASC',
      )
      .all(resId);
  }

  @Post('reservations/:resId/attachments')
  create(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('resId') resId: string,
    @Body() dto: CreateAttachmentDto,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    this.requireReservation(resId, tripId);
    const id = randomUUID();
    this.dbs.db
      .prepare(
        `INSERT INTO reservation_attachments
           (id, reservation_id, trip_id, uploaded_by, name, url, mime_type, size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, resId, tripId, user.sub, dto.name, dto.url, dto.mime_type, dto.size);
    const item = this.dbs.db
      .prepare('SELECT * FROM reservation_attachments WHERE id = ?')
      .get(id) as any;
    this.ws.broadcast(tripId, 'DOCUMENTS_UPDATED', { action: 'added', reservationId: resId, item });
    return item;
  }

  @Delete('reservations/:resId/attachments/:id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Param('resId') resId: string,
    @Param('id') id: string,
  ) {
    this.access.requireRole(tripId, user.sub, 'editor');
    const row = this.dbs.db
      .prepare(
        'SELECT * FROM reservation_attachments WHERE id = ? AND reservation_id = ?',
      )
      .get(id, resId) as { url: string } | undefined;
    if (!row) throw new NotFoundException('Attachment not found');
    // Remove file from disk; ENOENT is fine (already deleted or never on disk in tests).
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, row.url.replace(/^\/uploads\//, '')));
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
    this.dbs.db.prepare('DELETE FROM reservation_attachments WHERE id = ?').run(id);
    this.ws.broadcast(tripId, 'DOCUMENTS_UPDATED', {
      action: 'deleted',
      reservationId: resId,
      item: { id },
    });
    return { ok: true };
  }

  private requireReservation(resId: string, tripId: string) {
    const res = this.dbs.db
      .prepare('SELECT id FROM reservations WHERE id = ? AND trip_id = ?')
      .get(resId, tripId);
    if (!res) throw new NotFoundException('Reservation not found');
  }
}
```

- [ ] **Step 3: Register `AttachmentsController` in `server/src/trips/trips.module.ts`**

Read `server/src/trips/trips.module.ts`. Add the import and add to controllers array:

```typescript
import { AttachmentsController } from './attachments.controller';

@Module({
  controllers: [
    TripsController,
    MembersController,
    DaysController,
    PlacesController,
    NotesController,
    ReservationsController,
    BudgetController,
    PackingController,
    MessagesController,
    AttachmentsController,   // ← add this
  ],
  providers: [TripsService, AccessService],
})
export class TripsModule {}
```

- [ ] **Step 4: Build-check the server**

```bash
cd "D:/Projects/SDE Projects/Fable/server"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. If `@IsInt` or `@Min` aren't imported in `dto.ts` already, add them to the import line at the top.

- [ ] **Step 5: Commit**

```bash
git add server/src/trips/dto.ts server/src/trips/attachments.controller.ts server/src/trips/trips.module.ts
git commit -m "feat: add AttachmentsController with CRUD and aggregated documents endpoint"
```

---

## Task 3: Server integration tests

**Files:**
- Create: `server/test/attachments.spec.ts`

Context: Follow the pattern in `server/test/budget.spec.ts`. `createTestApp()` from `./helpers` starts a full NestJS app with in-memory SQLite (which auto-runs all migrations including 004). Tests run sequentially in one `describe` block sharing `beforeAll` state. `attachId` is set in the POST test and used in later tests — Jest runs `it` blocks in declaration order within a `describe`.

The DELETE test calls the API for a file at URL `/uploads/documents/uuid.pdf`. That file doesn't exist on disk, but `attachments.controller.ts` swallows `ENOENT`, so the test passes.

- [ ] **Step 1: Write `server/test/attachments.spec.ts`**

```typescript
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

    // Create a trip
    const tripRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Doc Trip' })
      .expect(201);
    tripId = tripRes.body.trip.id;

    // Create a reservation
    const resRes = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/reservations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'flight', title: 'ANA 123', status: 'confirmed' })
      .expect(201);
    resId = resRes.body.id;

    // Add viewer
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
```

- [ ] **Step 2: Run the new spec**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server -- --testPathPattern="attachments" 2>&1 | tail -15
```

Expected: 6 passed, 6 total.

- [ ] **Step 3: Run full server test suite**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server 2>&1 | tail -5
```

Expected: 71 passed, 71 total (65 existing + 6 new).

- [ ] **Step 4: Commit**

```bash
git add server/test/attachments.spec.ts
git commit -m "test: add attachments integration tests"
```

---

## Task 4: Client types + Zustand store update

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/store/trip.ts`

Context:
- Read `client/src/store/trip.ts` in full before editing — the `load` function makes parallel API calls; you need to add a `documents` call there. The `applyEvent` switch handles WS events; add a `DOCUMENTS_UPDATED` case.
- The store's `empty` constant holds the initial state shape — add `documents: []` there.
- `documents` is a flat array of `ReservationAttachment`; `ReservationsTab` will filter by `reservation_id` when rendering per-card.

- [ ] **Step 1: Add `ReservationAttachment` to `client/src/types.ts`**

Read `client/src/types.ts`. After the `Reservation` interface, add:

```typescript
export interface ReservationAttachment {
  id: string;
  reservation_id: string;
  trip_id: string;
  uploaded_by: string;
  name: string;
  url: string;
  mime_type: string;
  size: number;
  created_at: string;
  // Present only in GET /trips/:id/documents (aggregated endpoint)
  reservation_title?: string;
  reservation_type?: string;
}
```

- [ ] **Step 2: Read `client/src/store/trip.ts` in full**

You need to see the full `load` function and the full `applyEvent` switch to edit them correctly.

- [ ] **Step 3: Add `documents` to the store interface and `empty` constant**

In the `TripState` interface, add:
```typescript
documents: ReservationAttachment[];
```

In the `empty` constant (or wherever the initial state is set), add:
```typescript
documents: [] as ReservationAttachment[],
```

Add `ReservationAttachment` to the imports from `'../types'`.

- [ ] **Step 4: Extend `load` to fetch documents**

In the `load` function, add a parallel call to `GET /trips/:tripId/documents`:

```typescript
// Existing pattern (other calls already in Promise.all or sequential):
const documents = await api.get<ReservationAttachment[]>(`/trips/${tripId}/documents`);
set({ documents });
```

If `load` uses `Promise.all`, add the documents fetch to the array. If it's sequential, add it after the existing calls and before `set({ loading: false })`.

- [ ] **Step 5: Handle `DOCUMENTS_UPDATED` in `applyEvent`**

In the `applyEvent` switch, add:

```typescript
case 'DOCUMENTS_UPDATED': {
  const { action, item } = p;
  if (action === 'added') {
    set({ documents: [...s.documents, item] });
  } else if (action === 'deleted') {
    set({ documents: s.documents.filter((d) => d.id !== item.id) });
  }
  break;
}
```

- [ ] **Step 6: Run client tests to confirm no regressions**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=client 2>&1 | tail -5
```

Expected: all existing tests pass (26 passing).

- [ ] **Step 7: Commit**

```bash
git add client/src/types.ts client/src/store/trip.ts
git commit -m "feat: add ReservationAttachment type and documents store slice"
```

---

## Task 5: ReservationsTab — per-card attachment UI

**Files:**
- Modify: `client/src/components/ReservationsTab.tsx`

Context:
- Read `client/src/components/ReservationsTab.tsx` in full before editing.
- The component already has `const { reservations, tripId, trip } = useTripStore()`. Add `documents` to that destructure.
- Each reservation is rendered in a loop (likely `sorted.map((r) => ...)`). Add an attachments section inside each card.
- Upload flow: `<input type="file" accept="image/*,.pdf">` → on change, call `POST /uploads/documents` (returns `{ url }`), then call `POST /trips/${tripId}/reservations/${r.id}/attachments` with the metadata. The Multer endpoint already serves files statically at `/uploads/...`.
- `canEdit` prop controls whether upload/delete buttons show.
- Add an "All Documents" button in the header next to "Export .ics" — it sets `showDocs` state to open `DocumentsSidebar`.

- [ ] **Step 1: Read `client/src/components/ReservationsTab.tsx` in full**

- [ ] **Step 2: Add `documents` to store destructure and `showDocs` state**

At the top of the component function, change:
```typescript
const { reservations, tripId, trip } = useTripStore();
```
to:
```typescript
const { reservations, tripId, trip, documents } = useTripStore();
```

Add state:
```typescript
const [showDocs, setShowDocs] = useState(false);
const [uploadingFor, setUploadingFor] = useState<string | null>(null);
```

Add the import for `DocumentsSidebar` at the top of the file:
```typescript
import DocumentsSidebar from './DocumentsSidebar';
```

- [ ] **Step 3: Add "All Documents" button to the header**

Find the header `<div>` containing the "Export .ics" button. Add the "All Documents" button next to it:

```tsx
<button className="btn-secondary" onClick={() => setShowDocs(true)}>
  📎 All Documents
</button>
```

- [ ] **Step 4: Add upload handler**

Add this function inside the component (after `remove`):

```typescript
async function uploadFile(resId: string, file: File) {
  setUploadingFor(resId);
  try {
    const form = new FormData();
    form.append('file', file);
    const { url } = await api.upload('/uploads/documents', form);
    await api.post(`/trips/${tripId}/reservations/${resId}/attachments`, {
      name: file.name,
      url,
      mime_type: file.type,
      size: file.size,
    });
  } finally {
    setUploadingFor(null);
  }
}

async function removeAttachment(resId: string, attachId: string) {
  await api.delete(`/trips/${tripId}/reservations/${resId}/attachments/${attachId}`);
}
```

Note: `api.upload` may not exist yet — check `client/src/lib/api.ts`. If the `api` object doesn't have an `upload` method, add one to `api.ts`:

```typescript
upload: async <T = any>(path: string, body: FormData): Promise<T> => {
  return request<T>(path, { method: 'POST', body });
},
```

(The existing `request` function in `api.ts` handles `FormData` body — it skips the `Content-Type: application/json` header when body is `FormData`, which is what `fetch` requires for multipart.)

If `request` always sets `Content-Type: application/json`, you need to check and skip that header for `FormData`. Read `api.ts` before deciding.

- [ ] **Step 5: Add attachment section to each reservation card**

Inside the `sorted.map((r) => ...)` render, after the existing card content and before the closing `</div>` of the card, add:

```tsx
{/* Attachments */}
{(() => {
  const resAttachments = documents.filter((d) => d.reservation_id === r.id);
  return (
    <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2">
      {resAttachments.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-2">
          {resAttachments.map((a) => (
            <div key={a.id} className="flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs">
              <span>{a.mime_type === 'application/pdf' ? '📄' : '🖼️'}</span>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="max-w-[120px] truncate text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {a.name}
              </a>
              {canEdit && (
                <button
                  onClick={() => removeAttachment(r.id, a.id)}
                  className="ml-1 text-gray-400 hover:text-red-600"
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <label className="cursor-pointer text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
          {uploadingFor === r.id ? 'Uploading…' : '📎 Attach file'}
          <input
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            disabled={uploadingFor !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(r.id, file);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
})()}
```

- [ ] **Step 6: Render DocumentsSidebar**

At the end of the component's return, just before the closing `</div>`:

```tsx
{showDocs && <DocumentsSidebar tripId={tripId!} onClose={() => setShowDocs(false)} canEdit={canEdit} />}
```

- [ ] **Step 7: Run client tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=client 2>&1 | tail -5
```

Expected: all 26 tests still pass.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/ReservationsTab.tsx client/src/lib/api.ts
git commit -m "feat: add per-reservation attachment upload UI"
```

---

## Task 6: DocumentsSidebar component

**Files:**
- Create: `client/src/components/DocumentsSidebar.tsx`

Context:
- Reads `documents` from the Zustand store (already loaded in Task 4 — no API call needed on open).
- Groups by reservation using `reservation_title` and `reservation_type` fields from the aggregated store state.
- `canEdit` prop controls delete buttons.
- Slide-in panel from the right: `fixed inset-y-0 right-0 w-80 bg-white shadow-xl z-50` with a backdrop.
- Clicking the backdrop (or the ✕ button) calls `onClose`.

Type emoji map (same as `ReservationsTab`):
```typescript
const TYPE_ICON: Record<string, string> = {
  flight: '✈️',
  accommodation: '🏨',
  restaurant: '🍽️',
  transport: '🚆',
};
```

- [ ] **Step 1: Create `client/src/components/DocumentsSidebar.tsx`**

```tsx
import { useTripStore } from '../store/trip';
import { api } from '../lib/api';
import type { ReservationAttachment } from '../types';

const TYPE_ICON: Record<string, string> = {
  flight: '✈️',
  accommodation: '🏨',
  restaurant: '🍽️',
  transport: '🚆',
};

interface Props {
  tripId: string;
  canEdit: boolean;
  onClose: () => void;
}

export default function DocumentsSidebar({ tripId, canEdit, onClose }: Props) {
  const { documents, reservations } = useTripStore();

  // Group attachments by reservation_id
  const groups = reservations
    .map((r) => ({
      reservation: r,
      attachments: documents.filter((d) => d.reservation_id === r.id),
    }))
    .filter((g) => g.attachments.length > 0);

  async function remove(resId: string, attachId: string) {
    await api.delete(`/trips/${tripId}/reservations/${resId}/attachments/${attachId}`);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col bg-white shadow-xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="font-bold">All Documents</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {groups.length === 0 && (
            <p className="text-center text-sm text-gray-400">
              No documents yet. Attach files to reservations to see them here.
            </p>
          )}
          {groups.map(({ reservation: r, attachments }) => (
            <div key={r.id} className="mb-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {TYPE_ICON[r.type] ?? '📋'} {r.title}
              </p>
              <div className="space-y-1">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"
                  >
                    <span className="text-base">
                      {a.mime_type === 'application/pdf' ? '📄' : '🖼️'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {a.name}
                      </a>
                      <p className="text-xs text-gray-400">{formatSize(a.size)}</p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => remove(r.id, a.id)}
                        className="shrink-0 text-gray-400 hover:text-red-600"
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Run client tests**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=client 2>&1 | tail -5
```

Expected: 26 tests still pass.

- [ ] **Step 3: Run full server test suite for final check**

```bash
cd "D:/Projects/SDE Projects/Fable"
npm run test --workspace=server 2>&1 | tail -5
```

Expected: 71 passed.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/DocumentsSidebar.tsx
git commit -m "feat: add DocumentsSidebar component for aggregated trip documents"
```

---

## Self-review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| `reservation_attachments` table | Task 1 |
| `'documents'` upload kind | Task 1 |
| POST/GET/DELETE per-reservation endpoints | Task 2 |
| GET `/documents` aggregated with `reservation_title` | Task 2 |
| `DOCUMENTS_UPDATED` WS broadcast | Task 2 |
| Editor+ to upload/delete; viewer read-only | Task 2 (requireRole checks) |
| File deletion from disk on DELETE | Task 2 (`fs.unlinkSync`) |
| 6 integration tests | Task 3 |
| `ReservationAttachment` type | Task 4 |
| Zustand `documents` state + load + applyEvent | Task 4 |
| Per-card attachments row + upload button | Task 5 |
| "All Documents" button in header | Task 5 |
| `DocumentsSidebar` slide-in panel | Task 6 |
| Grouped by reservation with type emoji | Task 6 |
| File size display | Task 6 (`formatSize`) |

All spec requirements covered. ✓
