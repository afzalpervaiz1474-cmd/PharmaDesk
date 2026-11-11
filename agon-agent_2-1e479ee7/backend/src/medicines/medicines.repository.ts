import { Injectable } from '@nestjs/common';
import { Database } from '../database/database';
import type { BatchDataDto, MedicineDataDto } from './medicine.dto';

/** How an incoming change relates to what the server already holds. */
export type UpsertOutcome = 'applied' | 'stale' | 'foreign' | 'unknown_medicine';

export interface RecordVersion {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StoredChange extends RecordVersion {
  entity: 'medicine' | 'medicine_batch';
  serverSeq: number;
  data: Record<string, unknown>;
}

type Row = Record<string, unknown>;

const iso = (value: unknown): string => new Date(value as string | Date).toISOString();
const isoOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : iso(value));

const MEDICINE_COLUMNS = `id, name, generic_name, manufacturer, dosage_form, strength, unit, barcode,
  requires_prescription, reorder_level, rack, shelf, drawer, notes, created_at, updated_at, deleted_at,
  server_seq::text AS server_seq`;

const BATCH_COLUMNS = `id, medicine_id, batch_number, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, quantity,
  purchase_price_minor, selling_price_minor, to_char(received_at, 'YYYY-MM-DD') AS received_at,
  created_at, updated_at, deleted_at, server_seq::text AS server_seq`;

function medicineData(row: Row): Record<string, unknown> {
  return {
    name: row.name,
    genericName: row.generic_name,
    manufacturer: row.manufacturer,
    dosageForm: row.dosage_form,
    strength: row.strength,
    unit: row.unit,
    barcode: row.barcode,
    requiresPrescription: row.requires_prescription,
    reorderLevel: row.reorder_level,
    rack: row.rack,
    shelf: row.shelf,
    drawer: row.drawer,
    notes: row.notes,
    createdAt: iso(row.created_at),
  };
}

function batchData(row: Row): Record<string, unknown> {
  return {
    medicineId: row.medicine_id,
    batchNumber: row.batch_number,
    expiryDate: row.expiry_date,
    quantity: row.quantity,
    purchasePriceMinor: row.purchase_price_minor,
    sellingPriceMinor: row.selling_price_minor,
    receivedAt: row.received_at,
    createdAt: iso(row.created_at),
  };
}

/**
 * Cloud copy of the inventory. Every statement is scoped by `pharmacyId`,
 * which callers must take from the verified access token, never from input.
 */
@Injectable()
export class MedicinesRepository {
  constructor(private readonly database: Database) {}

  /** Live medicines with their live batches, in the shape the desktop UI uses. */
  async listWithBatches(pharmacyId: string): Promise<Record<string, unknown>[]> {
    const [medicines, batches] = await Promise.all([
      this.database.query<Row>(
        `SELECT ${MEDICINE_COLUMNS} FROM medicines WHERE pharmacy_id = $1 AND deleted_at IS NULL ORDER BY lower(name)`,
        [pharmacyId],
      ),
      this.database.query<Row>(
        `SELECT ${BATCH_COLUMNS} FROM medicine_batches
          WHERE pharmacy_id = $1 AND deleted_at IS NULL ORDER BY expiry_date, batch_number`,
        [pharmacyId],
      ),
    ]);
    const byMedicine = new Map<string, Record<string, unknown>[]>();
    for (const row of batches.rows) {
      const list = byMedicine.get(row.medicine_id as string) ?? [];
      list.push({ id: row.id, ...batchData(row), updatedAt: iso(row.updated_at) });
      byMedicine.set(row.medicine_id as string, list);
    }
    return medicines.rows.map((row) => ({
      id: row.id,
      ...medicineData(row),
      updatedAt: iso(row.updated_at),
      batches: byMedicine.get(row.id as string) ?? [],
    }));
  }

  /**
   * Inserts the medicine, or overwrites it only when the incoming version is
   * newer (last write wins on `updatedAt`).
   */
  async upsertMedicine(pharmacyId: string, version: RecordVersion, data: MedicineDataDto): Promise<UpsertOutcome> {
    const { rows } = await this.database.query(
      `INSERT INTO medicines (
         id, pharmacy_id, name, generic_name, manufacturer, dosage_form, strength, unit, barcode,
         requires_prescription, reorder_level, rack, shelf, drawer, notes, created_at, updated_at, deleted_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, generic_name = EXCLUDED.generic_name, manufacturer = EXCLUDED.manufacturer,
         dosage_form = EXCLUDED.dosage_form, strength = EXCLUDED.strength, unit = EXCLUDED.unit,
         barcode = EXCLUDED.barcode, requires_prescription = EXCLUDED.requires_prescription,
         reorder_level = EXCLUDED.reorder_level, rack = EXCLUDED.rack, shelf = EXCLUDED.shelf,
         drawer = EXCLUDED.drawer, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at,
         deleted_at = EXCLUDED.deleted_at, server_seq = nextval('sync_seq')
       WHERE medicines.pharmacy_id = EXCLUDED.pharmacy_id AND medicines.updated_at < EXCLUDED.updated_at
       RETURNING id`,
      [
        version.id, pharmacyId, data.name, data.genericName ?? null, data.manufacturer ?? null, data.dosageForm,
        data.strength ?? null, data.unit, data.barcode ?? null, data.requiresPrescription, data.reorderLevel,
        data.rack ?? null, data.shelf ?? null, data.drawer ?? null, data.notes ?? null, data.createdAt,
        version.updatedAt, version.deletedAt,
      ],
    );
    if (rows.length > 0) return 'applied';
    return (await this.ownsRecord('medicines', pharmacyId, version.id)) ? 'stale' : 'foreign';
  }

  async upsertBatch(pharmacyId: string, version: RecordVersion, data: BatchDataDto): Promise<UpsertOutcome> {
    if (!(await this.ownsRecord('medicines', pharmacyId, data.medicineId))) return 'unknown_medicine';
    const { rows } = await this.database.query(
      `INSERT INTO medicine_batches (
         id, pharmacy_id, medicine_id, batch_number, expiry_date, quantity, purchase_price_minor,
         selling_price_minor, received_at, created_at, updated_at, deleted_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         batch_number = EXCLUDED.batch_number, expiry_date = EXCLUDED.expiry_date, quantity = EXCLUDED.quantity,
         purchase_price_minor = EXCLUDED.purchase_price_minor, selling_price_minor = EXCLUDED.selling_price_minor,
         received_at = EXCLUDED.received_at, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at,
         server_seq = nextval('sync_seq')
       WHERE medicine_batches.pharmacy_id = EXCLUDED.pharmacy_id AND medicine_batches.updated_at < EXCLUDED.updated_at
       RETURNING id`,
      [
        version.id, pharmacyId, data.medicineId, data.batchNumber, data.expiryDate, data.quantity,
        data.purchasePriceMinor, data.sellingPriceMinor, data.receivedAt ?? null, data.createdAt,
        version.updatedAt, version.deletedAt,
      ],
    );
    if (rows.length > 0) return 'applied';
    return (await this.ownsRecord('medicine_batches', pharmacyId, version.id)) ? 'stale' : 'foreign';
  }

  /** Changes (including deletions) with `server_seq` greater than `cursor`, oldest first. */
  async changesSince(pharmacyId: string, cursor: number, limit: number): Promise<StoredChange[]> {
    const [medicines, batches] = await Promise.all([
      this.database.query<Row>(
        `SELECT ${MEDICINE_COLUMNS} FROM medicines
          WHERE pharmacy_id = $1 AND server_seq > $2::bigint ORDER BY server_seq LIMIT $3::int`,
        [pharmacyId, cursor, limit],
      ),
      this.database.query<Row>(
        `SELECT ${BATCH_COLUMNS} FROM medicine_batches
          WHERE pharmacy_id = $1 AND server_seq > $2::bigint ORDER BY server_seq LIMIT $3::int`,
        [pharmacyId, cursor, limit],
      ),
    ]);
    const changes: StoredChange[] = [
      ...medicines.rows.map((row) => toChange('medicine', row, medicineData(row))),
      ...batches.rows.map((row) => toChange('medicine_batch', row, batchData(row))),
    ];
    return changes.sort((a, b) => a.serverSeq - b.serverSeq).slice(0, limit);
  }

  private async ownsRecord(table: 'medicines' | 'medicine_batches', pharmacyId: string, id: string): Promise<boolean> {
    // `table` is a fixed literal from this file, never user input.
    const { rows } = await this.database.query(`SELECT 1 FROM ${table} WHERE id = $1 AND pharmacy_id = $2`, [
      id,
      pharmacyId,
    ]);
    return rows.length > 0;
  }
}

function toChange(entity: StoredChange['entity'], row: Row, data: Record<string, unknown>): StoredChange {
  return {
    entity,
    id: row.id as string,
    updatedAt: iso(row.updated_at),
    deletedAt: isoOrNull(row.deleted_at),
    serverSeq: Number(row.server_seq),
    data,
  };
}
