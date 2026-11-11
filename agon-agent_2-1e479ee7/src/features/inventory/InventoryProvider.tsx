import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRuntime } from '../../app/runtime-context';
import { describeError } from '../../data/errors';
import type { BatchInput, MedicineInput, MedicineWithBatches } from '../../domain/types';
import { InventoryContext, type InventoryContextValue } from './inventory-context';

/**
 * Loads the inventory once and keeps it fresh: every mutation goes to the
 * repository first and is followed by a re-read, so the screen always shows
 * what the database actually holds.
 */
export function InventoryProvider({ children }: { children: ReactNode }) {
  const { inventory } = useRuntime();
  const [medicines, setMedicines] = useState<MedicineWithBatches[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await inventory.listMedicines();
    setMedicines(next);
    setError(null);
  }, [inventory]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await refresh();
    } catch (loadError) {
      setError(describeError(loadError));
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    inventory
      .listMedicines()
      .then((next) => {
        if (cancelled) return;
        setMedicines(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(describeError(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inventory]);

  const value = useMemo<InventoryContextValue>(
    () => ({
      medicines,
      loading,
      error,
      reload,
      createMedicine: async (input: MedicineInput, openingBatch: BatchInput | null) => {
        const created = await inventory.createMedicine(input, openingBatch);
        await refresh();
        return created;
      },
      updateMedicine: async (id: string, input: MedicineInput) => {
        await inventory.updateMedicine(id, input);
        await refresh();
      },
      deleteMedicine: async (id: string) => {
        await inventory.deleteMedicine(id);
        await refresh();
      },
      addBatch: async (medicineId: string, input: BatchInput) => {
        await inventory.addBatch(medicineId, input);
        await refresh();
      },
      deleteBatch: async (batchId: string) => {
        await inventory.deleteBatch(batchId);
        await refresh();
      },
    }),
    [medicines, loading, error, reload, refresh, inventory],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}
