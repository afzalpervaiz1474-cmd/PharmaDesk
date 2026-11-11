-- 0002 · Synchronisation bookkeeping (local SQLite database).
--
-- sync_outbox is a "dirty list": one row per local write, holding only which
-- record changed. The current state of the record is read when it is pushed.
-- Triggers fill the outbox inside the same statement as the write itself, so
-- a change can never be saved without also being queued for sync.

CREATE TABLE sync_outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entity     TEXT NOT NULL CHECK (entity IN ('medicine', 'medicine_batch')),
  entity_id  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX idx_sync_outbox_entity ON sync_outbox (entity, entity_id);

-- Small key/value store: device_id, last_push_at, (later) last_pull_cursor.
CREATE TABLE sync_state (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TRIGGER trg_medicines_outbox_insert AFTER INSERT ON medicines
BEGIN
  INSERT INTO sync_outbox (entity, entity_id) VALUES ('medicine', NEW.id);
END;

CREATE TRIGGER trg_medicines_outbox_update AFTER UPDATE ON medicines
BEGIN
  INSERT INTO sync_outbox (entity, entity_id) VALUES ('medicine', NEW.id);
END;

CREATE TRIGGER trg_batches_outbox_insert AFTER INSERT ON medicine_batches
BEGIN
  INSERT INTO sync_outbox (entity, entity_id) VALUES ('medicine_batch', NEW.id);
END;

CREATE TRIGGER trg_batches_outbox_update AFTER UPDATE ON medicine_batches
BEGIN
  INSERT INTO sync_outbox (entity, entity_id) VALUES ('medicine_batch', NEW.id);
END;
