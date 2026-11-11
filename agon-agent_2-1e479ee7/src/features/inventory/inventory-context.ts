import { createContext, useContext } from 'react';
import type { BatchInput, MedicineInput, MedicineWithBatches } from '../../domain/types';

export interface InventoryContextValue {
  medicines: MedicineWithBatches[];
  loading: boolean;
  /** Set when the last load failed; `medicines` then holds the previous data. */
  error: string | null;
  reload: () => Promise<void>;
  createMedicine: (input: MedicineInput, openingBatch: BatchInput | null) => Promise<MedicineWithBatches>;
  updateMedicine: (id: string, input: MedicineInput) => Promise<void>;
  deleteMedicine: (id: string) => Promise<void>;
  addBatch: (medicineId: string, input: BatchInput) => Promise<void>;
  deleteBatch: (batchId: string) => Promise<void>;
}

export const InventoryContext = createContext<InventoryContextValue | null>(null);

export function useInventory(): InventoryContextValue {
  const value = useContext(InventoryContext);
  if (!value) throw new Error('useInventory must be used inside <InventoryProvider>');
  return value;
}
