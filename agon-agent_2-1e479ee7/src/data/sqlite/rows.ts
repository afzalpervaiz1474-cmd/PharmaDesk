import { isDosageForm, type Medicine, type MedicineBatch } from '../../domain/types';

export interface MedicineRow {
  id: string;
  name: string;
  generic_name: string | null;
  manufacturer: string | null;
  dosage_form: string;
  strength: string | null;
  unit: string;
  barcode: string | null;
  requires_prescription: number;
  reorder_level: number;
  rack: string | null;
  shelf: string | null;
  drawer: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BatchRow {
  id: string;
  medicine_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  purchase_price_minor: number;
  selling_price_minor: number;
  received_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function medicineFromRow(row: MedicineRow): Medicine {
  return {
    id: row.id,
    name: row.name,
    genericName: row.generic_name,
    manufacturer: row.manufacturer,
    dosageForm: isDosageForm(row.dosage_form) ? row.dosage_form : 'other',
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
    updatedAt: row.updated_at,
  };
}

export function batchFromRow(row: BatchRow): MedicineBatch {
  return {
    id: row.id,
    medicineId: row.medicine_id,
    batchNumber: row.batch_number,
    expiryDate: row.expiry_date,
    quantity: row.quantity,
    purchasePriceMinor: row.purchase_price_minor,
    sellingPriceMinor: row.selling_price_minor,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
