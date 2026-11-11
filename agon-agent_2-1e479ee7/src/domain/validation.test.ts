import { describe, expect, it } from 'vitest';
import {
  EMPTY_BATCH_FORM,
  EMPTY_MEDICINE_FORM,
  validateBatchForm,
  validateMedicineForm,
  type BatchFormValues,
  type MedicineFormValues,
} from './validation';

const TODAY = '2026-11-11';

const validMedicine: MedicineFormValues = {
  ...EMPTY_MEDICINE_FORM,
  name: '  Paracetamol  ',
  strength: '500 mg',
  unit: 'strip',
  reorderLevel: '20',
  rack: 'A',
};

const validBatch: BatchFormValues = {
  ...EMPTY_BATCH_FORM,
  batchNumber: 'PCM-2401',
  expiryDate: '2028-03-31',
  quantity: '120',
  purchasePrice: '8.5',
  sellingPrice: '12.00',
};

describe('validateMedicineForm', () => {
  it('trims text and turns blank optional fields into null', () => {
    const result = validateMedicineForm(validMedicine);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Paracetamol');
    expect(result.value.genericName).toBeNull();
    expect(result.value.barcode).toBeNull();
    expect(result.value.rack).toBe('A');
    expect(result.value.reorderLevel).toBe(20);
  });

  it('requires a name and a selling unit', () => {
    const result = validateMedicineForm({ ...validMedicine, name: '   ', unit: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBeDefined();
    expect(result.errors.unit).toBeDefined();
  });

  it('rejects unknown dosage forms, bad barcodes and non-integer reorder levels', () => {
    const result = validateMedicineForm({
      ...validMedicine,
      dosageForm: 'potion',
      barcode: 'a b',
      reorderLevel: '2.5',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(['barcode', 'dosageForm', 'reorderLevel']);
  });

  it('rejects negative and oversized reorder levels', () => {
    expect(validateMedicineForm({ ...validMedicine, reorderLevel: '-1' }).ok).toBe(false);
    expect(validateMedicineForm({ ...validMedicine, reorderLevel: '1000001' }).ok).toBe(false);
  });

  it('enforces length limits', () => {
    const result = validateMedicineForm({ ...validMedicine, name: 'x'.repeat(121), rack: 'r'.repeat(21) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBeDefined();
    expect(result.errors.rack).toBeDefined();
  });
});

describe('validateBatchForm', () => {
  it('converts prices to minor units', () => {
    const result = validateBatchForm(validBatch, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      batchNumber: 'PCM-2401',
      expiryDate: '2028-03-31',
      quantity: 120,
      purchasePriceMinor: 850,
      sellingPriceMinor: 1200,
      receivedAt: null,
    });
  });

  it('requires batch number, expiry date, quantity and both prices', () => {
    const result = validateBatchForm(EMPTY_BATCH_FORM, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      'batchNumber',
      'expiryDate',
      'purchasePrice',
      'quantity',
      'sellingPrice',
    ]);
  });

  it('rejects impossible dates and a zero quantity', () => {
    const result = validateBatchForm({ ...validBatch, expiryDate: '2027-02-30', quantity: '0' }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.expiryDate).toBeDefined();
    expect(result.errors.quantity).toBeDefined();
  });

  it('rejects comma-formatted prices and future received dates', () => {
    const result = validateBatchForm({ ...validBatch, sellingPrice: '12,00', receivedAt: '2026-11-12' }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.sellingPrice).toBeDefined();
    expect(result.errors.receivedAt).toBeDefined();
  });

  it('accepts a batch that is already expired so existing stock can be recorded', () => {
    expect(validateBatchForm({ ...validBatch, expiryDate: '2026-01-31' }, TODAY).ok).toBe(true);
  });
});
