import type { OutboxStore, PendingChange, SyncEntity } from '../../features/sync/types';
import type { BatchRow, MedicineRow } from './rows';
import { systemClock, type Clock, type SqlDatabase } from './SqlDatabase';

interface PendingRow {
  entity: SyncEntity;
  entity_id: string;
  max_id: number;
}

/** Reads the trigger-maintained `sync_outbox` table (see migration 0002). */
export class SqliteOutboxStore implements OutboxStore {
  private readonly db: SqlDatabase;
  private readonly clock: Clock;

  constructor(db: SqlDatabase, clock: Clock = systemClock) {
    this.db = db;
    this.clock = clock;
  }

  async countPending(): Promise<number> {
    const rows = await this.db.select<{ pending: number }[]>(
      'SELECT COUNT(*) AS pending FROM (SELECT 1 FROM sync_outbox GROUP BY entity, entity_id)',
    );
    return Number(rows[0]?.pending ?? 0);
  }

  async listPending(limit: number): Promise<PendingChange[]> {
    const pending = await this.db.select<PendingRow[]>(
      `SELECT entity, entity_id, MAX(id) AS max_id
         FROM sync_outbox
        GROUP BY entity, entity_id
        ORDER BY MAX(attempts), CASE entity WHEN 'medicine' THEN 0 ELSE 1 END, MIN(id)
        LIMIT $1`,
      [limit],
    );

    const changes: PendingChange[] = [];
    for (const row of pending) {
      const change =
        row.entity === 'medicine'
          ? await this.medicineChange(row.entity_id, row.max_id)
          : await this.batchChange(row.entity_id, row.max_id);
      if (change) changes.push(change);
    }
    return changes;
  }

  async markSynced(change: PendingChange): Promise<void> {
    await this.db.execute('DELETE FROM sync_outbox WHERE entity = $1 AND entity_id = $2 AND id <= $3', [
      change.entity,
      change.id,
      change.upToOutboxId,
    ]);
  }

  async markFailed(change: PendingChange, reason: string): Promise<void> {
    await this.db.execute(
      `UPDATE sync_outbox SET attempts = attempts + 1, last_error = $1
        WHERE entity = $2 AND entity_id = $3 AND id <= $4`,
      [reason.slice(0, 500), change.entity, change.id, change.upToOutboxId],
    );
  }

  async getDeviceId(): Promise<string> {
    const existing = await this.getState('device_id');
    if (existing) return existing;
    const deviceId = this.clock.newId();
    await this.setState('device_id', deviceId);
    return deviceId;
  }

  async getState(key: string): Promise<string | null> {
    const rows = await this.db.select<{ value: string }[]>('SELECT value FROM sync_state WHERE key = $1', [key]);
    return rows[0]?.value ?? null;
  }

  async setState(key: string, value: string): Promise<void> {
    await this.db.execute(
      'INSERT INTO sync_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  private async medicineChange(id: string, upToOutboxId: number): Promise<PendingChange | null> {
    const rows = await this.db.select<MedicineRow[]>('SELECT * FROM medicines WHERE id = $1', [id]);
    const row = rows[0];
    if (!row) return null;
    return {
      entity: 'medicine',
      id: row.id,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      upToOutboxId,
      data: {
        name: row.name,
        genericName: row.generic_name,
        manufacturer: row.manufacturer,
        dosageForm: row.dosage_form,
        strength: row.strength,
        unit: row.unit,
        barcode: row.barcode,
        requiresPrescription: row.requires_prescription === 1,
        reorderLevel: row.reorder_level,
        rack: row.rack,
        shelf: row.shelf,
        drawer: row.drawer,
        notes: row.notes,
        createdAt: row.created_at,
      },
    };
  }

  private async batchChange(id: string, upToOutboxId: number): Promise<PendingChange | null> {
    const rows = await this.db.select<BatchRow[]>('SELECT * FROM medicine_batches WHERE id = $1', [id]);
    const row = rows[0];
    if (!row) return null;
    return {
      entity: 'medicine_batch',
      id: row.id,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      upToOutboxId,
      data: {
        medicineId: row.medicine_id,
        batchNumber: row.batch_number,
        expiryDate: row.expiry_date,
        quantity: row.quantity,
        purchasePriceMinor: row.purchase_price_minor,
        sellingPriceMinor: row.selling_price_minor,
        receivedAt: row.received_at,
        createdAt: row.created_at,
      },
    };
  }
}
