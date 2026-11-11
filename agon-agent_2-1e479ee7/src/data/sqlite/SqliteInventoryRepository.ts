import type { BatchInput, MedicineBatch, MedicineInput, MedicineWithBatches } from '../../domain/types';
import { ConflictError, NotFoundError, RepositoryError } from '../errors';
import type { InventoryRepository } from '../InventoryRepository';
import { batchFromRow, medicineFromRow, type BatchRow, type MedicineRow } from './rows';
import { systemClock, type Clock, type SqlDatabase } from './SqlDatabase';

/** Translates SQLite constraint failures into messages a pharmacist can act on. */
function mapSqliteError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('UNIQUE constraint failed') && message.includes('medicines.barcode')) {
    return new ConflictError('Another medicine already uses this barcode.', 'barcode');
  }
  if (message.includes('UNIQUE constraint failed') && message.includes('medicine_batches.batch_number')) {
    return new ConflictError('This medicine already has a batch with that batch number.', 'batchNumber');
  }
  if (message.includes('CHECK constraint failed')) {
    return new RepositoryError('The local database rejected this record because a value is missing or out of range.');
  }
  return new RepositoryError(`Local database error: ${message}`);
}

/**
 * Inventory stored in the local SQLite database (desktop app).
 *
 * Notes
 * - Every write also lands in `sync_outbox` through database triggers
 *   (see migration 0002); this class does not need to know about sync.
 * - Statements run one at a time. Registering a medicine with an opening
 *   batch is therefore two writes: if the second fails the medicine exists
 *   with no stock, and the error is reported to the caller.
 */
export class SqliteInventoryRepository implements InventoryRepository {
  private readonly db: SqlDatabase;
  private readonly clock: Clock;

  constructor(db: SqlDatabase, clock: Clock = systemClock) {
    this.db = db;
    this.clock = clock;
  }

  async listMedicines(): Promise<MedicineWithBatches[]> {
    const [medicineRows, batchRows] = await Promise.all([
      this.db.select<MedicineRow[]>(
        'SELECT * FROM medicines WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE',
      ),
      this.db.select<BatchRow[]>(
        'SELECT * FROM medicine_batches WHERE deleted_at IS NULL ORDER BY expiry_date, batch_number',
      ),
    ]);

    const batchesByMedicine = new Map<string, MedicineBatch[]>();
    for (const row of batchRows) {
      const list = batchesByMedicine.get(row.medicine_id) ?? [];
      list.push(batchFromRow(row));
      batchesByMedicine.set(row.medicine_id, list);
    }
    return medicineRows.map((row) => ({
      ...medicineFromRow(row),
      batches: batchesByMedicine.get(row.id) ?? [],
    }));
  }

  async createMedicine(input: MedicineInput, openingBatch: BatchInput | null): Promise<MedicineWithBatches> {
    const id = this.clock.newId();
    const timestamp = this.clock.now().toISOString();
    await this.run(
      `INSERT INTO medicines (
         id, name, generic_name, manufacturer, dosage_form, strength, unit, barcode,
         requires_prescription, reorder_level, rack, shelf, drawer, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [id, ...medicineValues(input), timestamp, timestamp],
    );
    const batches = openingBatch ? [await this.addBatch(id, openingBatch)] : [];
    const medicine = await this.findMedicineRow(id);
    return { ...medicineFromRow(medicine), batches };
  }

  async updateMedicine(id: string, input: MedicineInput): Promise<void> {
    const result = await this.run(
      `UPDATE medicines SET
         name = $2, generic_name = $3, manufacturer = $4, dosage_form = $5, strength = $6, unit = $7,
         barcode = $8, requires_prescription = $9, reorder_level = $10, rack = $11, shelf = $12,
         drawer = $13, notes = $14, updated_at = $15
       WHERE id = $1 AND deleted_at IS NULL`,
      [id, ...medicineValues(input), this.clock.now().toISOString()],
    );
    if (result.rowsAffected === 0) throw new NotFoundError('This medicine no longer exists.');
  }

  async deleteMedicine(id: string): Promise<void> {
    const timestamp = this.clock.now().toISOString();
    await this.run(
      'UPDATE medicine_batches SET deleted_at = $1, updated_at = $1 WHERE medicine_id = $2 AND deleted_at IS NULL',
      [timestamp, id],
    );
    const result = await this.run(
      'UPDATE medicines SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL',
      [timestamp, id],
    );
    if (result.rowsAffected === 0) throw new NotFoundError('This medicine no longer exists.');
  }

  async addBatch(medicineId: string, input: BatchInput): Promise<MedicineBatch> {
    await this.findMedicineRow(medicineId);
    const id = this.clock.newId();
    const timestamp = this.clock.now().toISOString();
    await this.run(
      `INSERT INTO medicine_batches (
         id, medicine_id, batch_number, expiry_date, quantity, purchase_price_minor,
         selling_price_minor, received_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        medicineId,
        input.batchNumber,
        input.expiryDate,
        input.quantity,
        input.purchasePriceMinor,
        input.sellingPriceMinor,
        input.receivedAt,
        timestamp,
        timestamp,
      ],
    );
    return {
      id,
      medicineId,
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async deleteBatch(batchId: string): Promise<void> {
    const timestamp = this.clock.now().toISOString();
    const result = await this.run(
      'UPDATE medicine_batches SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL',
      [timestamp, batchId],
    );
    if (result.rowsAffected === 0) throw new NotFoundError('This batch no longer exists.');
  }

  private async findMedicineRow(id: string): Promise<MedicineRow> {
    const rows = await this.db.select<MedicineRow[]>(
      'SELECT * FROM medicines WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (rows.length === 0) throw new NotFoundError('This medicine no longer exists.');
    return rows[0];
  }

  private async run(query: string, values: unknown[]): Promise<{ rowsAffected: number }> {
    try {
      return await this.db.execute(query, values);
    } catch (error) {
      throw mapSqliteError(error);
    }
  }
}

/** Column values in the order used by the INSERT and UPDATE statements above. */
function medicineValues(input: MedicineInput): unknown[] {
  return [
    input.name,
    input.genericName,
    input.manufacturer,
    input.dosageForm,
    input.strength,
    input.unit,
    input.barcode,
    input.requiresPrescription ? 1 : 0,
    input.reorderLevel,
    input.rack,
    input.shelf,
    input.drawer,
    input.notes,
  ];
}
