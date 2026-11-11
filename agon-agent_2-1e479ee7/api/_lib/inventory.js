import supabase from '../db-client.js';
import { HttpError, unwrap } from './http.js';

// Keep in sync with src/domain/types.ts and src/domain/validation.ts.
const DOSAGE_FORMS = [
  'tablet', 'capsule', 'syrup', 'suspension', 'injection', 'cream',
  'ointment', 'drops', 'inhaler', 'powder', 'other',
];
const BARCODE = /^[A-Za-z0-9-]{4,32}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_QUANTITY = 1_000_000;
const MAX_PRICE_MINOR = 99_999_999_999;

/** The shared demo database is capped so it cannot be filled up by visitors. */
export const MAX_DEMO_MEDICINES = 300;

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value) {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isWholeNumber(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Returns a trimmed string, null when blank, or undefined when invalid. */
function optionalText(value, max) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > max) return undefined;
  return trimmed === '' ? null : trimmed;
}

/** Validates a MedicineInput and returns the database row to write. */
export function parseMedicineInput(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Medicine details are missing.');
  const fieldErrors = {};
  const row = {};

  const name = optionalText(input.name, 120);
  if (!name) fieldErrors.name = 'Enter the medicine name (up to 120 characters).';
  row.name = name;

  const unit = optionalText(input.unit, 30);
  if (!unit) fieldErrors.unit = 'Enter the selling unit (up to 30 characters).';
  row.unit = unit;

  if (!DOSAGE_FORMS.includes(input.dosageForm)) fieldErrors.dosageForm = 'Choose a dosage form.';
  row.dosage_form = input.dosageForm;

  const optionalFields = [
    ['genericName', 'generic_name', 120],
    ['manufacturer', 'manufacturer', 120],
    ['strength', 'strength', 30],
    ['rack', 'rack', 20],
    ['shelf', 'shelf', 20],
    ['drawer', 'drawer', 20],
    ['notes', 'notes', 500],
  ];
  for (const [field, column, max] of optionalFields) {
    const value = optionalText(input[field], max);
    if (value === undefined) fieldErrors[field] = `Keep this under ${max} characters.`;
    row[column] = value ?? null;
  }

  const barcode = optionalText(input.barcode, 32);
  if (barcode === undefined || (barcode !== null && !BARCODE.test(barcode))) {
    fieldErrors.barcode = 'Use 4-32 letters, digits or hyphens.';
  }
  row.barcode = barcode ?? null;

  if (typeof input.requiresPrescription !== 'boolean') {
    fieldErrors.requiresPrescription = 'Say whether a prescription is required.';
  }
  row.requires_prescription = input.requiresPrescription === true;

  if (!isWholeNumber(input.reorderLevel, 0, MAX_QUANTITY)) {
    fieldErrors.reorderLevel = 'Enter a whole number from 0 to 1,000,000.';
  }
  row.reorder_level = input.reorderLevel;

  if (Object.keys(fieldErrors).length > 0) {
    throw new HttpError(400, 'Some medicine details are not valid.', { fieldErrors });
  }
  return row;
}

/** Validates a BatchInput and returns the database row to write (without medicine_id). */
export function parseBatchInput(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Batch details are missing.');
  const fieldErrors = {};

  const batchNumber = optionalText(input.batchNumber, 40);
  if (!batchNumber) fieldErrors.batchNumber = 'Enter the batch number (up to 40 characters).';
  if (!isIsoDate(input.expiryDate)) fieldErrors.expiryDate = 'Enter a valid expiry date.';
  if (!isWholeNumber(input.quantity, 1, MAX_QUANTITY)) {
    fieldErrors.quantity = 'Enter a whole number from 1 to 1,000,000.';
  }
  if (!isWholeNumber(input.purchasePriceMinor, 0, MAX_PRICE_MINOR)) {
    fieldErrors.purchasePrice = 'Enter a valid purchase price.';
  }
  if (!isWholeNumber(input.sellingPriceMinor, 0, MAX_PRICE_MINOR)) {
    fieldErrors.sellingPrice = 'Enter a valid selling price.';
  }
  const receivedAt = input.receivedAt ?? null;
  if (receivedAt !== null && (!isIsoDate(receivedAt) || receivedAt > todayIso())) {
    fieldErrors.receivedAt = 'Enter a valid received date that is not in the future.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new HttpError(400, 'Some batch details are not valid.', { fieldErrors });
  }
  return {
    batch_number: batchNumber,
    expiry_date: input.expiryDate,
    quantity: input.quantity,
    purchase_price_minor: input.purchasePriceMinor,
    selling_price_minor: input.sellingPriceMinor,
    received_at: receivedAt,
  };
}

export function toBatch(row) {
  return {
    id: row.id,
    medicineId: row.medicine_id,
    batchNumber: row.batch_number,
    expiryDate: row.expiry_date,
    quantity: row.quantity,
    purchasePriceMinor: Number(row.purchase_price_minor),
    sellingPriceMinor: Number(row.selling_price_minor),
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toMedicine(row, batches = []) {
  return {
    id: row.id,
    name: row.name,
    genericName: row.generic_name,
    manufacturer: row.manufacturer,
    dosageForm: DOSAGE_FORMS.includes(row.dosage_form) ? row.dosage_form : 'other',
    strength: row.strength,
    unit: row.unit,
    barcode: row.barcode,
    requiresPrescription: row.requires_prescription === true,
    reorderLevel: row.reorder_level,
    rack: row.rack,
    shelf: row.shelf,
    drawer: row.drawer,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    batches,
  };
}

/** Every live medicine with its live batches, name order, batches by expiry. */
export async function loadInventory() {
  const [medicineRows, batchRows] = await Promise.all([
    supabase.from('medicines').select('*').is('deleted_at', null).order('name', { ascending: true }).then(unwrap),
    supabase
      .from('medicine_batches')
      .select('*')
      .is('deleted_at', null)
      .order('expiry_date', { ascending: true })
      .limit(5000)
      .then(unwrap),
  ]);
  const batchesByMedicine = new Map();
  for (const row of batchRows) {
    const list = batchesByMedicine.get(row.medicine_id) ?? [];
    list.push(toBatch(row));
    batchesByMedicine.set(row.medicine_id, list);
  }
  return medicineRows.map((row) => toMedicine(row, batchesByMedicine.get(row.id) ?? []));
}

/** Enforces the uniqueness rules that the desktop SQLite schema enforces with indexes. */
export async function assertBarcodeFree(barcode, exceptMedicineId = null) {
  if (!barcode) return;
  const matches = await supabase
    .from('medicines')
    .select('id')
    .eq('barcode', barcode)
    .is('deleted_at', null)
    .then(unwrap);
  if (matches.some((row) => row.id !== exceptMedicineId)) {
    throw new HttpError(409, 'Another medicine already uses this barcode.', { field: 'barcode' });
  }
}

export async function assertBatchNumberFree(medicineId, batchNumber) {
  const matches = await supabase
    .from('medicine_batches')
    .select('id')
    .eq('medicine_id', medicineId)
    .eq('batch_number', batchNumber)
    .is('deleted_at', null)
    .then(unwrap);
  if (matches.length > 0) {
    throw new HttpError(409, 'This medicine already has a batch with that batch number.', { field: 'batchNumber' });
  }
}

export async function requireMedicine(id) {
  const rows = await supabase.from('medicines').select('*').eq('id', id).is('deleted_at', null).then(unwrap);
  if (rows.length === 0) throw new HttpError(404, 'This medicine no longer exists.');
  return rows[0];
}
