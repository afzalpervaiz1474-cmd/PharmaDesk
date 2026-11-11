import { isIsoDate } from './dates';
import { parseMoneyToMinor } from './money';
import { isDosageForm, type BatchInput, type MedicineInput } from './types';

/** Raw form state: everything the user types is a string until validated. */
export interface MedicineFormValues {
  name: string;
  genericName: string;
  manufacturer: string;
  dosageForm: string;
  strength: string;
  unit: string;
  barcode: string;
  requiresPrescription: boolean;
  reorderLevel: string;
  rack: string;
  shelf: string;
  drawer: string;
  notes: string;
}

export interface BatchFormValues {
  batchNumber: string;
  expiryDate: string;
  quantity: string;
  purchasePrice: string;
  sellingPrice: string;
  receivedAt: string;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export type ValidationResult<TForm, TValue> =
  | { ok: true; value: TValue }
  | { ok: false; errors: FieldErrors<TForm> };

export const EMPTY_MEDICINE_FORM: MedicineFormValues = {
  name: '',
  genericName: '',
  manufacturer: '',
  dosageForm: 'tablet',
  strength: '',
  unit: '',
  barcode: '',
  requiresPrescription: false,
  reorderLevel: '0',
  rack: '',
  shelf: '',
  drawer: '',
  notes: '',
};

export const EMPTY_BATCH_FORM: BatchFormValues = {
  batchNumber: '',
  expiryDate: '',
  quantity: '',
  purchasePrice: '',
  sellingPrice: '',
  receivedAt: '',
};

export const LIMITS = {
  name: 120,
  shortText: 30,
  location: 20,
  batchNumber: 40,
  notes: 500,
  maxQuantity: 1_000_000,
} as const;

const BARCODE = /^[A-Za-z0-9-]{4,32}$/;
const WHOLE_NUMBER = /^\d{1,7}$/;

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!WHOLE_NUMBER.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed <= LIMITS.maxQuantity ? parsed : null;
}

export function validateMedicineForm(values: MedicineFormValues): ValidationResult<MedicineFormValues, MedicineInput> {
  const errors: FieldErrors<MedicineFormValues> = {};

  const name = values.name.trim();
  if (name === '') errors.name = 'Enter the medicine name.';
  else if (name.length > LIMITS.name) errors.name = `Keep the name under ${LIMITS.name} characters.`;

  if (values.genericName.trim().length > LIMITS.name) {
    errors.genericName = `Keep the generic name under ${LIMITS.name} characters.`;
  }
  if (values.manufacturer.trim().length > LIMITS.name) {
    errors.manufacturer = `Keep the manufacturer under ${LIMITS.name} characters.`;
  }
  if (!isDosageForm(values.dosageForm)) errors.dosageForm = 'Choose a dosage form.';
  if (values.strength.trim().length > LIMITS.shortText) {
    errors.strength = `Keep the strength under ${LIMITS.shortText} characters.`;
  }

  const unit = values.unit.trim();
  if (unit === '') errors.unit = 'Enter the selling unit, for example "strip" or "bottle".';
  else if (unit.length > LIMITS.shortText) errors.unit = `Keep the unit under ${LIMITS.shortText} characters.`;

  const barcode = optional(values.barcode);
  if (barcode !== null && !BARCODE.test(barcode)) {
    errors.barcode = 'Use 4–32 letters, digits or hyphens.';
  }

  const reorderLevel = parseWholeNumber(values.reorderLevel);
  if (reorderLevel === null) {
    errors.reorderLevel = `Enter a whole number from 0 to ${LIMITS.maxQuantity.toLocaleString('en')}.`;
  }

  for (const key of ['rack', 'shelf', 'drawer'] as const) {
    if (values[key].trim().length > LIMITS.location) {
      errors[key] = `Keep this under ${LIMITS.location} characters.`;
    }
  }
  if (values.notes.trim().length > LIMITS.notes) {
    errors.notes = `Keep notes under ${LIMITS.notes} characters.`;
  }

  if (Object.keys(errors).length > 0 || !isDosageForm(values.dosageForm) || reorderLevel === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      name,
      genericName: optional(values.genericName),
      manufacturer: optional(values.manufacturer),
      dosageForm: values.dosageForm,
      strength: optional(values.strength),
      unit,
      barcode,
      requiresPrescription: values.requiresPrescription,
      reorderLevel,
      rack: optional(values.rack),
      shelf: optional(values.shelf),
      drawer: optional(values.drawer),
      notes: optional(values.notes),
    },
  };
}

export function validateBatchForm(
  values: BatchFormValues,
  today: string,
): ValidationResult<BatchFormValues, BatchInput> {
  const errors: FieldErrors<BatchFormValues> = {};

  const batchNumber = values.batchNumber.trim();
  if (batchNumber === '') errors.batchNumber = 'Enter the batch number printed on the pack.';
  else if (batchNumber.length > LIMITS.batchNumber) {
    errors.batchNumber = `Keep the batch number under ${LIMITS.batchNumber} characters.`;
  }

  const expiryDate = values.expiryDate.trim();
  if (expiryDate === '') errors.expiryDate = 'Enter the expiry date.';
  else if (!isIsoDate(expiryDate)) errors.expiryDate = 'Enter a valid date.';

  const quantity = parseWholeNumber(values.quantity);
  if (quantity === null || quantity < 1) {
    errors.quantity = `Enter a whole number from 1 to ${LIMITS.maxQuantity.toLocaleString('en')}.`;
  }

  const purchasePriceMinor = parseMoneyToMinor(values.purchasePrice);
  if (purchasePriceMinor === null) errors.purchasePrice = 'Enter an amount like 12.50 (no commas).';

  const sellingPriceMinor = parseMoneyToMinor(values.sellingPrice);
  if (sellingPriceMinor === null) errors.sellingPrice = 'Enter an amount like 12.50 (no commas).';

  const receivedAt = optional(values.receivedAt);
  if (receivedAt !== null) {
    if (!isIsoDate(receivedAt)) errors.receivedAt = 'Enter a valid date.';
    else if (receivedAt > today) errors.receivedAt = 'The received date cannot be in the future.';
  }

  if (
    Object.keys(errors).length > 0 ||
    quantity === null ||
    purchasePriceMinor === null ||
    sellingPriceMinor === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { batchNumber, expiryDate, quantity, purchasePriceMinor, sellingPriceMinor, receivedAt },
  };
}
