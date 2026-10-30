CREATE TABLE mini_sessions (
  session_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

ALTER TABLE orders ADD COLUMN session_hash TEXT;
ALTER TABLE orders ADD COLUMN title TEXT;
ALTER TABLE orders ADD COLUMN price INTEGER;
ALTER TABLE downloads ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';

CREATE INDEX orders_mini_session_idx
  ON orders(session_hash, id)
  WHERE session_hash IS NOT NULL;

CREATE INDEX mini_sessions_expires_at_idx
  ON mini_sessions(expires_at);
