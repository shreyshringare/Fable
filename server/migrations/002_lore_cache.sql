CREATE TABLE lore_cache (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
