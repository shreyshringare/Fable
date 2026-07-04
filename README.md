# 🧭 Fable

Self-hosted, real-time collaborative travel planner. Plan trips with friends: shared
itineraries, drag-and-drop day planning, live maps, budgets that settle themselves,
packing lists, trip chat — and **Lore**, which surfaces the myths, legends and fiction
behind every place you visit.

## Features

- **Trips & days** — create a trip, get a day-by-day itinerary generated from your dates
- **Day planner** — drag-and-drop places within and across days (@dnd-kit)
- **Place search** — OpenStreetMap/Nominatim search or drop a pin on the map (no API key)
- **Interactive map** — Leaflet with marker clustering, numbered route polyline, marker↔card highlighting
- **Real-time collaboration** — every change broadcasts over WebSocket to all trip members instantly; presence avatars show who's viewing
- **Members & roles** — invite by email as owner / editor / viewer (viewers can't mutate)
- **Reservations** — flights, stays, dining, transport on a color-coded timeline
- **Budget** — multi-currency expenses, category pie chart, per-person balances, minimal-transaction settle-up
- **Packing list** — categories, quantities, assignees, live-synced checkboxes, progress bar
- **Weather** — Open-Meteo 16-day forecast per day card, seasonal averages beyond the horizon
- **Lore** 📜 — mythology, folklore, fiction appearances and history for any place, sourced from Wikipedia and cached locally
- **Trip chat** — real-time messages per trip
- **PWA** — installable, offline shell caching, dark mode, mobile-responsive

## Stack

| Layer    | Tech |
| -------- | ---- |
| Backend  | NestJS, better-sqlite3 (raw SQL migrations), JWT (15m access + 30d httpOnly refresh), `ws` |
| Frontend | React 18, Vite, TypeScript, Zustand, Tailwind CSS, Leaflet, Recharts, date-fns |
| Data     | SQLite file, local uploads directory — nothing leaves your server |
| Free APIs | OpenStreetMap tiles + Nominatim, Open-Meteo, Wikipedia |

## Quick start (development)

```bash
npm install

# Terminal 1 — API on :3000
npm run dev:server

# Terminal 2 — client on :5173 (proxies /api, /uploads, /ws)
npm run dev:client
```

Open http://localhost:5173 and register an account.

## Production (Docker)

```bash
# .env
JWT_SECRET=change-me-to-something-long
ADMIN_EMAIL=you@example.com      # optional seed user
ADMIN_PASSWORD=super-secret      # optional

docker compose up -d --build
```

Serves everything on **http://localhost:3000**. Data persists in `./data` (SQLite)
and `./uploads` (images/PDFs).

## Manual production build

```bash
npm run build      # builds server (tsc) + client (vite)
npm start          # node server/dist/main.js — serves API + client + uploads
```

## Environment variables

| Var | Default | Purpose |
| --- | ------- | ------- |
| `PORT` | `3000` | HTTP + WebSocket port |
| `JWT_SECRET` | dev fallback | signing key for access/refresh tokens — **set in production** |
| `DATA_DIR` | `./data` | SQLite location |
| `UPLOAD_DIR` | `./uploads` | uploaded files |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | seed an admin account on first boot |

## API

REST base: `/api/v1` — auth, trips, members, days, places (+reorder), day notes,
reservations, budget, packing, messages (read), uploads, lore.
Mutations broadcast typed events (`PLACE_ADDED`, `BUDGET_UPDATED`, `MESSAGE_SENT`, …)
over `/ws` to every connected member of the trip room; clients apply patches to a
Zustand store and re-sync over REST on reconnect.

## License

MIT
