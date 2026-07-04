CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  start_date TEXT,
  end_date TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE trip_members (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
  PRIMARY KEY (trip_id, user_id)
);

CREATE TABLE days (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  notes TEXT
);
CREATE INDEX idx_days_trip ON days(trip_id);

CREATE TABLE places (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat REAL,
  lng REAL,
  address TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  notes TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  photo_url TEXT,
  rating REAL,
  hours TEXT
);
CREATE INDEX idx_places_day ON places(day_id);
CREATE INDEX idx_places_trip ON places(trip_id);

CREATE TABLE day_notes (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  icon TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_day_notes_day ON day_notes(day_id);

CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('flight','accommodation','restaurant','transport')),
  title TEXT NOT NULL,
  confirmation_number TEXT,
  start_datetime TEXT,
  end_datetime TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  cost REAL,
  attachment_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reservations_trip ON reservations(trip_id);

CREATE TABLE budget_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  paid_by_user_id TEXT REFERENCES users(id),
  split_among TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_budget_trip ON budget_items(trip_id);

CREATE TABLE packing_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  quantity INTEGER NOT NULL DEFAULT 1,
  packed INTEGER NOT NULL DEFAULT 0,
  assigned_to_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_packing_trip ON packing_items(trip_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_messages_trip ON messages(trip_id, created_at);
