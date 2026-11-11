-- 0002 · Cloud copy of the inventory.
-- Mirrors the desktop SQLite schema (src-tauri/migrations/0001) with two
-- additions: pharmacy_id for tenancy and server_seq for incremental pulls.
-- Rows arrive through the sync API; ids are generated on the desktop.

CREATE SEQUENCE sync_seq;

CREATE TABLE medicines (
  id                    uuid PRIMARY KEY,
  pharmacy_id           uuid NOT NULL REFERENCES pharmacies (id) ON DELETE CASCADE,
  name                  text NOT NULL CHECK (length(trim(name)) > 0),
  generic_name          text,
  manufacturer          text,
  dosage_form           text NOT NULL,
  strength              text,
  unit                  text NOT NULL CHECK (length(trim(unit)) > 0),
  barcode               text,
  requires_prescription boolean NOT NULL DEFAULT false,
  reorder_level         integer NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  rack                  text,
  shelf                 text,
  drawer                text,
  notes                 text,
  created_at            timestamptz NOT NULL,
  updated_at            timestamptz NOT NULL,
  deleted_at            timestamptz,
  server_seq            bigint NOT NULL DEFAULT nextval('sync_seq')
);

CREATE INDEX medicines_pull_idx ON medicines (pharmacy_id, server_seq);

CREATE TABLE medicine_batches (
  id                   uuid PRIMARY KEY,
  pharmacy_id          uuid NOT NULL REFERENCES pharmacies (id) ON DELETE CASCADE,
  medicine_id          uuid NOT NULL REFERENCES medicines (id) ON DELETE CASCADE,
  batch_number         text NOT NULL CHECK (length(trim(batch_number)) > 0),
  expiry_date          date NOT NULL,
  quantity             integer NOT NULL CHECK (quantity >= 0),
  purchase_price_minor integer NOT NULL CHECK (purchase_price_minor >= 0),
  selling_price_minor  integer NOT NULL CHECK (selling_price_minor >= 0),
  received_at          date,
  created_at           timestamptz NOT NULL,
  updated_at           timestamptz NOT NULL,
  deleted_at           timestamptz,
  server_seq           bigint NOT NULL DEFAULT nextval('sync_seq')
);

CREATE INDEX medicine_batches_pull_idx ON medicine_batches (pharmacy_id, server_seq);
CREATE INDEX medicine_batches_medicine_idx ON medicine_batches (medicine_id);
CREATE INDEX medicine_batches_expiry_idx ON medicine_batches (pharmacy_id, expiry_date) WHERE deleted_at IS NULL;
