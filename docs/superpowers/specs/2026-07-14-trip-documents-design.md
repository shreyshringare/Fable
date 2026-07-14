# Fable: Trip Documents Design

**Date:** 2026-07-14
**Status:** Approved

---

## Goal

Allow trip members to upload files (tickets, confirmations, visas, insurance) attached to individual reservations, and view all trip documents in one aggregated sidebar.

---

## Scope

Multi-file attachments per reservation. Aggregated "All Documents" sidebar in the Reservations tab. RBAC: editors/owners upload and delete; viewers download only.

Out of scope: cloud storage, file preview/rendering, attachments on places or packing items, Word/Excel formats.

---

## Data Model

New migration `server/migrations/004_reservation_attachments.sql`:

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

Existing `attachment_url` column on `reservations` is left in place for backward compatibility and is not used by this feature.

---

## API

### Upload (existing endpoint, extended)

`POST /api/v1/uploads/documents` — add `'documents'` to `KINDS` in `uploads.controller.ts`. Returns `{ url: '/uploads/documents/<uuid>.<ext>' }`. Accepts images and PDFs, max 10 MB (same as existing filter).

### Attachment CRUD

All routes require JWT auth. `requireRole` uses existing `AccessService`.

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| `POST` | `/trips/:tripId/reservations/:resId/attachments` | editor | Save attachment metadata to DB; broadcast `DOCUMENTS_UPDATED` |
| `GET` | `/trips/:tripId/reservations/:resId/attachments` | viewer | List attachments for one reservation |
| `DELETE` | `/trips/:tripId/reservations/:resId/attachments/:id` | editor | Delete DB row + file from disk; broadcast `DOCUMENTS_UPDATED` |

Request body for POST:
```json
{ "name": "boarding-pass.pdf", "url": "/uploads/documents/uuid.pdf", "mime_type": "application/pdf", "size": 204800 }
```

### Aggregated sidebar endpoint

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| `GET` | `/trips/:tripId/documents` | viewer | All attachments for the trip, each row includes `reservation_title` and `reservation_type` for sidebar grouping |

Response shape:
```json
[
  {
    "id": "...",
    "reservation_id": "...",
    "reservation_title": "ANA 123",
    "reservation_type": "flight",
    "name": "boarding-pass.pdf",
    "url": "/uploads/documents/uuid.pdf",
    "mime_type": "application/pdf",
    "size": 204800,
    "uploaded_by": "user-id",
    "created_at": "..."
  }
]
```

---

## WebSocket

`DOCUMENTS_UPDATED` event broadcast to the trip room on every POST and DELETE. Payload: `{ action: 'added' | 'deleted', reservationId: string, item: ReservationAttachment | { id: string } }`.

---

## Client

### Types (`client/src/types.ts`)

New interface:
```typescript
interface ReservationAttachment {
  id: string;
  reservation_id: string;
  trip_id: string;
  uploaded_by: string;
  name: string;
  url: string;
  mime_type: string;
  size: number;
  created_at: string;
}
```

`Reservation` interface gets an optional field: `attachments?: ReservationAttachment[]`

### Zustand store (`client/src/store/trip.ts`)

- `GET /trips/:id` response extended: each reservation object includes its `attachments` array (server joins them)
- `applyEvent` handles `DOCUMENTS_UPDATED`: patches the matching reservation's `attachments` array in place

### `ReservationsTab.tsx`

Each reservation card gets an attachments row below existing content:
- File icon + filename for each attachment; clicking opens URL in new tab
- Upload button (paperclip icon) visible to editors/owners only — triggers `<input type="file" accept="image/*,.pdf">`, calls `POST /uploads/documents` then `POST .../attachments`
- Delete button per attachment (editors/owners only)

An **"All Documents"** button in the Reservations tab header opens `DocumentsSidebar`.

### `DocumentsSidebar.tsx` (new component)

Slide-in panel from the right. Triggered by "All Documents" button in the Reservations tab header.

- Calls `GET /trips/:tripId/documents` on open
- Lists attachments grouped by reservation (header: `<type emoji> <reservation_title>`)
- Each row: file icon, name, size. Clicking opens file in new tab.
- Editors/owners see a delete button per row (calls DELETE endpoint)
- Close button or clicking backdrop dismisses it

---

## File Deletion

When `DELETE .../attachments/:id` is called, the server:
1. Looks up the attachment row to get the `url`
2. Derives the filesystem path: `path.join(UPLOAD_DIR, url.replace('/uploads/', ''))`
3. Deletes the file with `fs.unlink` (swallow ENOENT — file already gone is not an error)
4. Deletes the DB row
5. Broadcasts `DOCUMENTS_UPDATED`

---

## Server Files

| File | Change |
|------|--------|
| `server/migrations/004_reservation_attachments.sql` | New migration |
| `server/src/uploads/uploads.controller.ts` | Add `'documents'` to `KINDS` |
| `server/src/trips/attachments.controller.ts` | New controller (POST, GET, DELETE per reservation; GET aggregated) |
| `server/src/trips/dto.ts` | Add `CreateAttachmentDto` |
| `server/src/trips/trips.module.ts` | Register `AttachmentsController` |

## Client Files

| File | Change |
|------|--------|
| `client/src/types.ts` | Add `ReservationAttachment` interface; extend `Reservation` |
| `client/src/store/trip.ts` | Load attachments with reservations; handle `DOCUMENTS_UPDATED` event |
| `client/src/components/ReservationsTab.tsx` | Add attachments row + upload button per card; add "All Documents" button |
| `client/src/components/DocumentsSidebar.tsx` | New slide-in sidebar component |

---

## Testing

`server/test/attachments.spec.ts` — integration tests using `createTestApp()` + in-memory SQLite:

1. POST attachment → 201, appears in GET for that reservation
2. GET aggregated `/documents` → includes `reservation_title` and `reservation_type`
3. Viewer GET → 200
4. Viewer POST → 403
5. DELETE → 200, gone from subsequent GET
6. POST to non-existent reservation → 404

---

## RBAC Summary

| Action | Viewer | Editor | Owner |
|--------|--------|--------|-------|
| GET attachments | ✓ | ✓ | ✓ |
| GET /documents | ✓ | ✓ | ✓ |
| POST attachment | ✗ | ✓ | ✓ |
| DELETE attachment | ✗ | ✓ | ✓ |
