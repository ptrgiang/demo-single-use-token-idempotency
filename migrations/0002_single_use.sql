ALTER TABLE downloads ADD COLUMN used_at TEXT;
ALTER TABLE downloads ADD COLUMN idempotency_key TEXT;
ALTER TABLE downloads ADD COLUMN policy_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX downloads_active_grants_idx
  ON downloads(order_id, expires_at)
  WHERE used_at IS NULL;
