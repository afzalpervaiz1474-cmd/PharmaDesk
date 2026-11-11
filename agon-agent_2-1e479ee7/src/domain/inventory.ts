import { addMonthsToMonthKey, daysBetween } from './dates';
import type { DosageForm, MedicineBatch, MedicineWithBatches } from './types';

/** Batches expiring within this many days are flagged as "expiring". */
export const EXPIRY_WARNING_DAYS = 90;

export type ExpiryStatus = 'expired' | 'expiring' | 'ok';
export type StockStatus = 'out' | 'low' | 'ok';

/** A batch is sellable up to and including its expiry date. */
export function expiryStatus(
  expiryDate: string,
  today: string,
  warningDays: number = EXPIRY_WARNING_DAYS,
): ExpiryStatus {
  const daysLeft = daysBetween(today, expiryDate);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= warningDays) return 'expiring';
  return 'ok';
}

export function totalQuantity(batches: readonly MedicineBatch[]): number {
  return batches.reduce((sum, batch) => sum + batch.quantity, 0);
}

/** Units that can still be sold: everything except expired batches. */
export function sellableQuantity(batches: readonly MedicineBatch[], today: string): number {
  return batches.reduce(
    (sum, batch) => (expiryStatus(batch.expiryDate, today) === 'expired' ? sum : sum + batch.quantity),
    0,
  );
}

export function stockStatus(medicine: MedicineWithBatches, today: string): StockStatus {
  const sellable = sellableQuantity(medicine.batches, today);
  if (sellable === 0) return 'out';
  if (sellable <= medicine.reorderLevel) return 'low';
  return 'ok';
}

/** Earliest-expiring batch that still holds stock, or null. */
export function nearestExpiryBatch(batches: readonly MedicineBatch[]): MedicineBatch | null {
  let nearest: MedicineBatch | null = null;
  for (const batch of batches) {
    if (batch.quantity <= 0) continue;
    if (nearest === null || batch.expiryDate < nearest.expiryDate) nearest = batch;
  }
  return nearest;
}

export interface InventorySummary {
  medicineCount: number;
  /** Batches that still hold stock. */
  activeBatchCount: number;
  sellableUnits: number;
  /** Sellable stock valued at purchase price. */
  stockValueCostMinor: number;
  /** Sellable stock valued at selling price. */
  stockValueRetailMinor: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiringBatchCount: number;
  expiringUnits: number;
  expiredBatchCount: number;
  expiredUnits: number;
  expiredValueCostMinor: number;
}

export function summarizeInventory(medicines: readonly MedicineWithBatches[], today: string): InventorySummary {
  const summary: InventorySummary = {
    medicineCount: medicines.length,
    activeBatchCount: 0,
    sellableUnits: 0,
    stockValueCostMinor: 0,
    stockValueRetailMinor: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    expiringBatchCount: 0,
    expiringUnits: 0,
    expiredBatchCount: 0,
    expiredUnits: 0,
    expiredValueCostMinor: 0,
  };

  for (const medicine of medicines) {
    const status = stockStatus(medicine, today);
    if (status === 'out') summary.outOfStockCount += 1;
    if (status === 'low') summary.lowStockCount += 1;

    for (const batch of medicine.batches) {
      if (batch.quantity <= 0) continue;
      summary.activeBatchCount += 1;
      const expiry = expiryStatus(batch.expiryDate, today);
      if (expiry === 'expired') {
        summary.expiredBatchCount += 1;
        summary.expiredUnits += batch.quantity;
        summary.expiredValueCostMinor += batch.quantity * batch.purchasePriceMinor;
        continue;
      }
      summary.sellableUnits += batch.quantity;
      summary.stockValueCostMinor += batch.quantity * batch.purchasePriceMinor;
      summary.stockValueRetailMinor += batch.quantity * batch.sellingPriceMinor;
      if (expiry === 'expiring') {
        summary.expiringBatchCount += 1;
        summary.expiringUnits += batch.quantity;
      }
    }
  }
  return summary;
}

export interface ExpiryBucket {
  /** `YYYY-MM`. */
  monthKey: string;
  units: number;
  batches: number;
}

/** Sellable units grouped by expiry month, starting with the current month. */
export function expiryTimeline(
  medicines: readonly MedicineWithBatches[],
  today: string,
  months: number = 6,
): ExpiryBucket[] {
  const firstKey = today.slice(0, 7);
  const buckets = new Map<string, ExpiryBucket>();
  for (let offset = 0; offset < months; offset += 1) {
    const monthKey = addMonthsToMonthKey(firstKey, offset);
    buckets.set(monthKey, { monthKey, units: 0, batches: 0 });
  }
  for (const medicine of medicines) {
    for (const batch of medicine.batches) {
      if (batch.quantity <= 0 || expiryStatus(batch.expiryDate, today) === 'expired') continue;
      const bucket = buckets.get(batch.expiryDate.slice(0, 7));
      if (!bucket) continue;
      bucket.units += batch.quantity;
      bucket.batches += 1;
    }
  }
  return [...buckets.values()];
}

export interface DosageFormStock {
  form: DosageForm;
  units: number;
  medicines: number;
}

export function unitsByDosageForm(medicines: readonly MedicineWithBatches[], today: string): DosageFormStock[] {
  const byForm = new Map<DosageForm, DosageFormStock>();
  for (const medicine of medicines) {
    const entry = byForm.get(medicine.dosageForm) ?? { form: medicine.dosageForm, units: 0, medicines: 0 };
    entry.units += sellableQuantity(medicine.batches, today);
    entry.medicines += 1;
    byForm.set(medicine.dosageForm, entry);
  }
  return [...byForm.values()].sort((a, b) => b.units - a.units || a.form.localeCompare(b.form));
}

export interface ReorderItem {
  medicine: MedicineWithBatches;
  sellable: number;
  status: Exclude<StockStatus, 'ok'>;
}

/** Medicines that are out of stock or at/below their reorder level, lowest first. */
export function reorderList(medicines: readonly MedicineWithBatches[], today: string): ReorderItem[] {
  const items: ReorderItem[] = [];
  for (const medicine of medicines) {
    const status = stockStatus(medicine, today);
    if (status === 'ok') continue;
    items.push({ medicine, sellable: sellableQuantity(medicine.batches, today), status });
  }
  return items.sort((a, b) => a.sellable - b.sellable || a.medicine.name.localeCompare(b.medicine.name));
}

export interface BatchAlert {
  medicine: MedicineWithBatches;
  batch: MedicineBatch;
  /** Negative when the batch is already expired. */
  daysLeft: number;
  status: Exclude<ExpiryStatus, 'ok'>;
}

/** Stock-holding batches that are expired or inside the warning window, soonest first. */
export function batchAlerts(medicines: readonly MedicineWithBatches[], today: string): BatchAlert[] {
  const alerts: BatchAlert[] = [];
  for (const medicine of medicines) {
    for (const batch of medicine.batches) {
      if (batch.quantity <= 0) continue;
      const status = expiryStatus(batch.expiryDate, today);
      if (status === 'ok') continue;
      alerts.push({ medicine, batch, daysLeft: daysBetween(today, batch.expiryDate), status });
    }
  }
  return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
}
