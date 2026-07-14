# Fable: Test Coverage + Code Hardening Design

**Date:** 2026-07-14  
**Status:** Approved

---

## Goal

Establish full integration-test coverage for all server endpoints currently untested, add client-side unit and component tests, then harden three concrete code quality issues found during review.

---

## Scope

Two test files exist (`auth.spec.ts`, `trips.spec.ts`). Everything else is uncovered. Three hardening issues were identified.

Out of scope: new features, schema changes, UI redesigns.

---

## Phase 1 — Server Integration Tests

All new spec files live in `server/test/`. Each reuses `createTestApp()` + `TestDbService` (in-memory SQLite) from `test/helpers.ts`. Each file owns its own `beforeAll` / `afterAll` lifecycle.

### 1a. `places.spec.ts` + `days.spec.ts`
- POST place to a day, verify response shape
- GET places for trip (scoped to day)
- PATCH place order (drag-and-drop reorder)
- DELETE place
- POST day note, GET day note, PATCH day note
- RBAC: viewer cannot mutate; editor/owner can

### 1b. `members.spec.ts`
- Owner invites user by email → 201, member appears in trip
- Owner changes role (viewer → editor) → 200
- Non-owner cannot invite → 403
- Owner removes member → 200, member loses access
- Owner cannot remove self → 400 or 403

### 1c. `budget.spec.ts`
- POST expense → 201 with correct split logic
- GET expenses for trip → 200, array
- PATCH expense → 200
- DELETE expense → 200
- Viewer cannot POST → 403

### 1d. `packing.spec.ts`
- POST item with category + quantity + assignee → 201
- GET items → 200
- PATCH item (toggle checked, change assignee) → 200
- DELETE item → 200
- Viewer cannot mutate → 403

### 1e. `reservations.spec.ts`
- POST reservation (flight/hotel/etc.) → 201
- GET reservations for trip → 200
- PATCH reservation → 200
- DELETE reservation → 200
- Viewer cannot mutate → 403

### 1f. `messages.spec.ts`
- GET `/trips/:id/messages` → 200, paginated (after pagination hardening)
- Viewer cannot send via REST if endpoint exists
- Invalid trip → 403/404

### 1g. `lore.spec.ts`
- GET `/lore?place=Rome` → 200, has `summary` field
- Second identical call → same response (cache hit; verify by spying on `LoreService` internal fetch — not by response time)
- Unknown place → graceful 200 with empty/null lore, not 500

---

## Phase 2 — Client Tests

### 2a. Utility unit tests (vitest, no DOM)

Files to test in `client/src/lib/`:
- Date helpers: `dateRange(start, end)` returns correct array of ISO strings
- Currency formatting util (if exists): correct symbol + rounding
- `ApiError` class: `status` and `message` fields set correctly
- Toast store: `push` adds item, auto-dismiss fires, `dismiss` removes by id

Test files land in `client/src/__tests__/` or co-located as `*.test.ts`.

### 2b. React component tests (vitest + @testing-library/react)

Install: `@testing-library/react`, `@testing-library/user-event`, `jsdom` (vitest environment).

Components to test:
- **`LoginPage`** — renders form, submit with valid creds calls `api.post`, shows error toast on failure
- **`BudgetTab`** — renders expense list from props, total calculation displayed correctly
- **`ToastContainer`** (if it exists as a component) — renders toasts from store, dismiss works

Mocks: `vi.mock('../lib/api')` for HTTP calls. No real network in component tests.

---

## Phase 3 — Code Hardening

### 3a. Rate limiter isolation

**Problem:** `buckets` is a module-level `Map`. It persists across test runs in the same process, causing test pollution. In production it resets on every server restart, making it bypassable by restarting the process.

**Fix:** Move `buckets` inside the `AuthRateLimitGuard` class as an instance property. The cleanup `setInterval` moves to the constructor. Each NestJS DI instance (including test instances) gets its own clean bucket.

No API change. No behavior change in production (singleton guard = one instance anyway).

### 3b. WebSocket token exposure

**Problem:** WS connection passes JWT as a URL query param (`/ws?token=...`). This appears in server access logs, proxy logs, and browser history.

**Fix:** Accept the token in the **first message frame** instead of the URL.

Protocol change:
1. Client connects to `/ws` with no token in URL.
2. Server immediately expects a `{"type":"AUTH","token":"<jwt>"}` frame within 5 seconds.
3. Server authenticates, sets up `WsClient`, then proceeds as today.
4. If no AUTH frame within 5 seconds, server closes with `4001`.

Update `WsService.attach()` and the client's `ws.ts` lib accordingly. Existing WS event handling unchanged after authentication.

### 3c. Message pagination

**Problem:** `GET /trips/:id/messages` returns all messages with no limit — unbounded as chat grows.

**Fix:** Add cursor-based pagination.

- Query param: `?before=<messageId>&limit=<n>` (default limit 50, max 100)
- Response: `{ messages: [...], nextCursor: "<id> | null" }`
- Messages returned newest-first (DESC by `created_at`), client reverses for display.
- `messages.spec.ts` tests the pagination boundary.

---

## Architecture

No new modules, no schema changes for phases 1–2. Phase 3 changes:
- `rate-limit.guard.ts` — instance variable refactor
- `ws.service.ts` — auth-on-first-frame logic
- `messages.controller.ts` + `trips.service.ts` — pagination query + response shape
- `client/src/lib/ws.ts` — send AUTH frame on open

---

## Testing Strategy

- Server: Jest + Supertest integration tests against in-memory SQLite (`TestDbService`)
- Client utilities: vitest, Node environment
- Client components: vitest + jsdom + @testing-library/react
- All tests must pass `npm test` in their respective workspace
- CI: existing `npm run test` scripts cover both

---

## Success Criteria

- `server/test/` has 9 spec files (7 new + 2 existing), all green
- `client/src/` has test files covering utilities + 3 components
- `AuthRateLimitGuard` has no module-level mutable state
- WS connections do not put JWT in URL
- `GET /trips/:id/messages` accepts `?before&limit`, returns cursor
- `npm test` green in both workspaces
