import type { BatchInput, MedicineBatch, MedicineInput, MedicineWithBatches } from '../domain/types';

/**
 * The only way the UI reads or writes inventory. Implementations:
 * - SqliteInventoryRepository: desktop app, local database, works offline.
 * - HttpInventoryRepository:   hosted web preview, shared demo database.
 */
export interface InventoryRepository {
  listMedicines(): Promise<MedicineWithBatches[]>;
  createMedicine(input: MedicineInput, openingBatch: BatchInput | null): Promise<MedicineWithBatches>;
  updateMedicine(id: string, input: MedicineInput): Promise<void>;
  /** Removes the medicine together with its batches. */
  deleteMedicine(id: string): Promise<void>;
  addBatch(medicineId: string, input: BatchInput): Promise<MedicineBatch>;
  deleteBatch(batchId: string): Promise<void>;
}
