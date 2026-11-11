/**
 * Core inventory types shared by every data source (SQLite on the desktop,
 * HTTP in the hosted preview) and by the pure domain functions.
 *
 * Conventions:
 * - Money is stored as integer minor units (e.g. paise, cents) to avoid
 *   floating point rounding. v0.1 assumes 2-decimal currencies.
 * - Calendar dates are ISO `YYYY-MM-DD` strings. Timestamps are ISO 8601 UTC.
 */

export const DOSAGE_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'suspension',
  'injection',
  'cream',
  'ointment',
  'drops',
  'inhaler',
  'powder',
  'other',
] as const;

export type DosageForm = (typeof DOSAGE_FORMS)[number];

export const DOSAGE_FORM_LABELS: Record<DosageForm, string> = {
  tablet: 'Tablet',
  capsule: 'Capsule',
  syrup: 'Syrup',
  suspension: 'Suspension',
  injection: 'Injection',
  cream: 'Cream',
  ointment: 'Ointment',
  drops: 'Drops',
  inhaler: 'Inhaler',
  powder: 'Powder',
  other: 'Other',
};

export function isDosageForm(value: unknown): value is DosageForm {
  return typeof value === 'string' && (DOSAGE_FORMS as readonly string[]).includes(value);
}

export interface Medicine {
  id: string;
  name: string;
  genericName: string | null;
  manufacturer: string | null;
  dosageForm: DosageForm;
  strength: string | null;
  /** Selling unit, e.g. "strip", "bottle", "tube". */
  unit: string;
  barcode: string | null;
  requiresPrescription: boolean;
  /** Stock at or below this many sellable units is flagged as low. */
  reorderLevel: number;
  rack: string | null;
  shelf: string | null;
  drawer: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineBatch {
  id: string;
  medicineId: string;
  batchNumber: string;
  /** ISO calendar date, `YYYY-MM-DD`. */
  expiryDate: string;
  quantity: number;
  /** Purchase price per unit, minor units. */
  purchasePriceMinor: number;
  /** Selling price per unit, minor units. */
  sellingPriceMinor: number;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineWithBatches extends Medicine {
  batches: MedicineBatch[];
}

export type MedicineInput = Omit<Medicine, 'id' | 'createdAt' | 'updatedAt'>;
export type BatchInput = Omit<MedicineBatch, 'id' | 'medicineId' | 'createdAt' | 'updatedAt'>;

export function formatLocation(location: Pick<Medicine, 'rack' | 'shelf' | 'drawer'>): string | null {
  const parts = [
    location.rack ? `Rack ${location.rack}` : null,
    location.shelf ? `Shelf ${location.shelf}` : null,
    location.drawer ? `Drawer ${location.drawer}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}
