-- 0001 · Medicines and their stock batches (local SQLite database).
--
-- Conventions
--   * ids are UUID strings generated on the device, so rows can be created offline.
--   * money is stored as integer minor units (e.g. paise / cents).
--   * dates are ISO 'YYYY-MM-DD', timestamps are ISO 8601 UTC strings.
--   * rows are soft-deleted (deleted_at) so deletions can be synchronised later.

CREATE TABLE medicines (
  id                    TEXT PRIMARY KEY NOT NULL,
  name                  TEXT NOT NULL CHECK (length(trim(name)) > 0),
  generic_name          TEXT,
  manufacturer          TEXT,
  dosage_form           TEXT NOT NULL,
  strength              TEXT,
  unit                  TEXT NOT NULL CHECK (length(trim(unit)) > 0),
  barcode               TEXT,
  requires_prescription INTEGER NOT NULL DEFAULT 0 CHECK (requires_prescription IN (0, 1)),
  reorder_level         INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  rack                  TEXT,
  shelf                 TEXT,
  drawer                TEXT,
  notes                 TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT
);

CREATE INDEX idx_medicines_name ON medicines (name COLLATE NOCASE) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_medicines_barcode ON medicines (barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE medicine_batches (
  id                   TEXT PRIMARY KEY NOT NULL,
  medicine_id          TEXT NOT NULL REFERENCES medicines (id),
  batch_number         TEXT NOT NULL CHECK (length(trim(batch_number)) > 0),
  expiry_date          TEXT NOT NULL
                         CHECK (expiry_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  quantity             INTEGER NOT NULL CHECK (quantity >= 0),
  purchase_price_minor INTEGER NOT NULL CHECK (purchase_price_minor >= 0),
  selling_price_minor  INTEGER NOT NULL CHECK (selling_price_minor >= 0),
  received_at          TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  deleted_at           TEXT
);

CREATE INDEX idx_batches_medicine ON medicine_batches (medicine_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_batches_expiry ON medicine_batches (expiry_date) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_batches_medicine_batch_number
  ON medicine_batches (medicine_id, batch_number)
  WHERE deleted_at IS NULL;
