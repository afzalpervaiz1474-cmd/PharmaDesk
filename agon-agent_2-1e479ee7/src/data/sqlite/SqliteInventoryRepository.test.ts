import { beforeEach, describe, expect, it } from 'vitest';
import type { BatchInput, MedicineInput } from '../../domain/types';
import { ConflictError, NotFoundError, RepositoryError } from '../errors';
import { SqliteInventoryRepository } from './SqliteInventoryRepository';
import { SqliteOutboxStore } from './SqliteOutboxStore';
import { createTestClock, createTestDatabase } from './testDatabase';

const paracetamol: MedicineInput = {
  name: 'Paracetamol',
  genericName: 'Acetaminophen',
  manufacturer: null,
  dosageForm: 'tablet',
  strength: '500 mg',
  unit: 'strip',
  barcode: '8900000000017',
  requiresPrescription: false,
  reorderLevel: 20,
  rack: 'A',
  shelf: '2',
  drawer: null,
  notes: null,
};

const openingBatch: BatchInput = {
  batchNumber: 'PCM-2401',
  expiryDate: '2028-03-31',
  quantity: 120,
  purchasePriceMinor: 850,
  sellingPriceMinor: 1200,
  receivedAt: '2026-11-01',
};

describe('SQLite migrations + SqliteInventoryRepository', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let repository: SqliteInventoryRepository;
  let outbox: SqliteOutboxStore;

  beforeEach(() => {
    db = createTestDatabase();
    const clock = createTestClock();
    repository = new SqliteInventoryRepository(db, clock);
    outbox = new SqliteOutboxStore(db, clock);
  });

  it('applies the migrations to an empty database', async () => {
    const tables = await db.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((table) => table.name)).toEqual([
      'medicine_batches',
      'medicines',
      'sync_outbox',
      'sync_state',
    ]);
    expect(await repository.listMedicines()).toEqual([]);
  });

  it('registers a medicine with an opening batch and reads it back', async () => {
    const created = await repository.createMedicine(paracetamol, openingBatch);
    expect(created.requiresPrescription).toBe(false);
    expect(created.batches).toHaveLength(1);

    const [listed] = await repository.listMedicines();
    expect(listed).toMatchObject({ ...paracetamol, id: created.id });
    expect(listed.batches[0]).toMatchObject({ ...openingBatch, medicineId: created.id });
  });

  it('lists medicines alphabetically, ignoring case, with batches by expiry', async () => {
    await repository.createMedicine({ ...paracetamol, name: 'zinc', barcode: null }, null);
    const first = await repository.createMedicine({ ...paracetamol, name: 'Amoxicillin', barcode: null }, null);
    await repository.addBatch(first.id, { ...openingBatch, batchNumber: 'LATE', expiryDate: '2029-01-31' });
    await repository.addBatch(first.id, { ...openingBatch, batchNumber: 'SOON', expiryDate: '2027-01-31' });

    const listed = await repository.listMedicines();
    expect(listed.map((medicine) => medicine.name)).toEqual(['Amoxicillin', 'zinc']);
    expect(listed[0].batches.map((batch) => batch.batchNumber)).toEqual(['SOON', 'LATE']);
  });

  it('updates a medicine', async () => {
    const created = await repository.createMedicine(paracetamol, null);
    await repository.updateMedicine(created.id, { ...paracetamol, reorderLevel: 50, requiresPrescription: true });
    const [listed] = await repository.listMedicines();
    expect(listed.reorderLevel).toBe(50);
    expect(listed.requiresPrescription).toBe(true);
    expect(listed.updatedAt > listed.createdAt).toBe(true);
  });

  it('rejects a duplicate barcode with a field-level conflict', async () => {
    await repository.createMedicine(paracetamol, null);
    const attempt = repository.createMedicine({ ...paracetamol, name: 'Copy' }, null);
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toMatchObject({ field: 'barcode' });
  });

  it('rejects a duplicate batch number for the same medicine', async () => {
    const created = await repository.createMedicine(paracetamol, openingBatch);
    const attempt = repository.addBatch(created.id, openingBatch);
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toMatchObject({ field: 'batchNumber' });
  });

  it('lets database CHECK constraints stop invalid values that bypass the form', async () => {
    const created = await repository.createMedicine(paracetamol, null);
    await expect(repository.addBatch(created.id, { ...openingBatch, quantity: -1 })).rejects.toBeInstanceOf(
      RepositoryError,
    );
    await expect(repository.addBatch(created.id, { ...openingBatch, expiryDate: 'soon' })).rejects.toBeInstanceOf(
      RepositoryError,
    );
  });

  it('soft-deletes a medicine with its batches and frees the barcode', async () => {
    const created = await repository.createMedicine(paracetamol, openingBatch);
    await repository.deleteMedicine(created.id);

    expect(await repository.listMedicines()).toEqual([]);
    const kept = await db.select<{ deleted_at: string | null }[]>('SELECT deleted_at FROM medicines');
    expect(kept).toHaveLength(1);
    expect(kept[0].deleted_at).not.toBeNull();

    await expect(repository.createMedicine(paracetamol, null)).resolves.toBeDefined();
  });

  it('reports missing records instead of failing silently', async () => {
    await expect(repository.updateMedicine('missing', paracetamol)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repository.deleteMedicine('missing')).rejects.toBeInstanceOf(NotFoundError);
    await expect(repository.deleteBatch('missing')).rejects.toBeInstanceOf(NotFoundError);
    await expect(repository.addBatch('missing', openingBatch)).rejects.toBeInstanceOf(NotFoundError);
  });

  describe('sync outbox', () => {
    it('queues every local write through triggers, one pending entry per record', async () => {
      const created = await repository.createMedicine(paracetamol, openingBatch);
      await repository.updateMedicine(created.id, { ...paracetamol, reorderLevel: 30 });

      expect(await outbox.countPending()).toBe(2);
      const pending = await outbox.listPending(10);
      expect(pending.map((change) => change.entity)).toEqual(['medicine', 'medicine_batch']);
      expect(pending[0]).toMatchObject({ id: created.id, deletedAt: null });
      expect(pending[0].data).toMatchObject({ name: 'Paracetamol', reorderLevel: 30, requiresPrescription: false });
      expect(pending[1].data).toMatchObject({ medicineId: created.id, quantity: 120, expiryDate: '2028-03-31' });
    });

    it('queues deletions as tombstones', async () => {
      const created = await repository.createMedicine(paracetamol, null);
      await repository.deleteMedicine(created.id);
      const [pending] = await outbox.listPending(10);
      expect(pending.deletedAt).not.toBeNull();
    });

    it('keeps edits made after a snapshot was taken', async () => {
      const created = await repository.createMedicine(paracetamol, null);
      const [snapshot] = await outbox.listPending(10);
      await repository.updateMedicine(created.id, { ...paracetamol, reorderLevel: 99 });

      await outbox.markSynced(snapshot);
      const pending = await outbox.listPending(10);
      expect(pending).toHaveLength(1);
      expect(pending[0].data.reorderLevel).toBe(99);

      await outbox.markSynced(pending[0]);
      expect(await outbox.countPending()).toBe(0);
    });

    it('records failures and moves failed records behind fresh ones', async () => {
      const first = await repository.createMedicine(paracetamol, null);
      const second = await repository.createMedicine({ ...paracetamol, name: 'Second', barcode: null }, null);
      const [failing] = await outbox.listPending(10);
      await outbox.markFailed(failing, 'name must not be empty');

      const pending = await outbox.listPending(10);
      expect(pending.map((change) => change.id)).toEqual([second.id, first.id]);
      const rows = await db.select<{ attempts: number; last_error: string }[]>(
        'SELECT attempts, last_error FROM sync_outbox WHERE entity_id = $1',
        [first.id],
      );
      expect(rows[0]).toEqual({ attempts: 1, last_error: 'name must not be empty' });
    });

    it('creates one stable device id', async () => {
      const deviceId = await outbox.getDeviceId();
      expect(await outbox.getDeviceId()).toBe(deviceId);
      await outbox.setState('last_push_at', 'a');
      await outbox.setState('last_push_at', 'b');
      expect(await outbox.getState('last_push_at')).toBe('b');
      expect(await outbox.getState('unknown')).toBeNull();
    });
  });
});
