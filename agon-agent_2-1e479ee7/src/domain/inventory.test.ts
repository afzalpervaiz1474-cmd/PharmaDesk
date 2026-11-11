import { describe, expect, it } from 'vitest';
import { addMonthsToMonthKey, daysBetween, isIsoDate, todayIso } from './dates';
import {
  batchAlerts,
  expiryStatus,
  expiryTimeline,
  nearestExpiryBatch,
  reorderList,
  sellableQuantity,
  stockStatus,
  summarizeInventory,
  unitsByDosageForm,
} from './inventory';
import type { MedicineBatch, MedicineWithBatches } from './types';

const TODAY = '2026-11-11';

function batch(overrides: Partial<MedicineBatch>): MedicineBatch {
  return {
    id: 'b',
    medicineId: 'm',
    batchNumber: 'B-1',
    expiryDate: '2028-01-31',
    quantity: 10,
    purchasePriceMinor: 100,
    sellingPriceMinor: 150,
    receivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function medicine(overrides: Partial<MedicineWithBatches>): MedicineWithBatches {
  return {
    id: 'm',
    name: 'Test medicine',
    genericName: null,
    manufacturer: null,
    dosageForm: 'tablet',
    strength: null,
    unit: 'strip',
    barcode: null,
    requiresPrescription: false,
    reorderLevel: 5,
    rack: null,
    shelf: null,
    drawer: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    batches: [],
    ...overrides,
  };
}

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('11/11/2026')).toBe(false);
  });

  it('counts days across month and year boundaries', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-11-11', '2026-11-01')).toBe(-10);
  });

  it('rolls month keys over year ends', () => {
    expect(addMonthsToMonthKey('2026-11', 0)).toBe('2026-11');
    expect(addMonthsToMonthKey('2026-11', 2)).toBe('2027-01');
    expect(addMonthsToMonthKey('2026-11', 14)).toBe('2028-01');
  });

  it('uses the local calendar day', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('expiryStatus', () => {
  it('treats the expiry date itself as still sellable', () => {
    expect(expiryStatus('2026-11-11', TODAY)).toBe('expiring');
    expect(expiryStatus('2026-11-10', TODAY)).toBe('expired');
  });

  it('flags batches inside the 90 day warning window', () => {
    expect(expiryStatus('2027-02-09', TODAY)).toBe('expiring'); // exactly 90 days
    expect(expiryStatus('2027-02-10', TODAY)).toBe('ok'); // 91 days
  });
});

describe('stock status', () => {
  it('ignores expired batches when counting sellable stock', () => {
    const batches = [batch({ quantity: 40, expiryDate: '2026-01-31' }), batch({ quantity: 3 })];
    expect(sellableQuantity(batches, TODAY)).toBe(3);
    expect(stockStatus(medicine({ batches, reorderLevel: 5 }), TODAY)).toBe('low');
  });

  it('reports out of stock when only expired stock remains', () => {
    const batches = [batch({ quantity: 40, expiryDate: '2026-01-31' })];
    expect(stockStatus(medicine({ batches }), TODAY)).toBe('out');
  });

  it('is ok above the reorder level, and a zero reorder level never reads as low', () => {
    expect(stockStatus(medicine({ batches: [batch({ quantity: 6 })], reorderLevel: 5 }), TODAY)).toBe('ok');
    expect(stockStatus(medicine({ batches: [batch({ quantity: 1 })], reorderLevel: 0 }), TODAY)).toBe('ok');
  });

  it('finds the earliest batch that still holds stock', () => {
    const batches = [
      batch({ id: 'empty', quantity: 0, expiryDate: '2026-12-01' }),
      batch({ id: 'later', expiryDate: '2028-06-30' }),
      batch({ id: 'sooner', expiryDate: '2027-03-31' }),
    ];
    expect(nearestExpiryBatch(batches)?.id).toBe('sooner');
    expect(nearestExpiryBatch([])).toBeNull();
  });
});

describe('summarizeInventory', () => {
  const medicines = [
    medicine({
      id: 'a',
      name: 'Alpha',
      reorderLevel: 20,
      batches: [
        batch({ quantity: 10, purchasePriceMinor: 200, sellingPriceMinor: 300, expiryDate: '2026-12-15' }),
        batch({ quantity: 5, purchasePriceMinor: 200, sellingPriceMinor: 300, expiryDate: '2026-09-30' }),
      ],
    }),
    medicine({
      id: 'b',
      name: 'Beta',
      dosageForm: 'syrup',
      reorderLevel: 2,
      batches: [batch({ quantity: 30, purchasePriceMinor: 1000, sellingPriceMinor: 1500, expiryDate: '2028-05-31' })],
    }),
    medicine({ id: 'c', name: 'Gamma', batches: [] }),
  ];

  it('totals units and value from sellable stock only', () => {
    const summary = summarizeInventory(medicines, TODAY);
    expect(summary.medicineCount).toBe(3);
    expect(summary.activeBatchCount).toBe(3);
    expect(summary.sellableUnits).toBe(40);
    expect(summary.stockValueCostMinor).toBe(10 * 200 + 30 * 1000);
    expect(summary.stockValueRetailMinor).toBe(10 * 300 + 30 * 1500);
  });

  it('counts stock and expiry alerts', () => {
    const summary = summarizeInventory(medicines, TODAY);
    expect(summary.lowStockCount).toBe(1);
    expect(summary.outOfStockCount).toBe(1);
    expect(summary.expiringBatchCount).toBe(1);
    expect(summary.expiringUnits).toBe(10);
    expect(summary.expiredBatchCount).toBe(1);
    expect(summary.expiredUnits).toBe(5);
    expect(summary.expiredValueCostMinor).toBe(1000);
  });

  it('returns zeros for an empty inventory', () => {
    const summary = summarizeInventory([], TODAY);
    expect(Object.values(summary).every((value) => value === 0)).toBe(true);
  });

  it('builds the reorder list lowest stock first', () => {
    expect(reorderList(medicines, TODAY).map((item) => [item.medicine.name, item.status])).toEqual([
      ['Gamma', 'out'],
      ['Alpha', 'low'],
    ]);
  });

  it('lists expired and expiring batches soonest first', () => {
    const alerts = batchAlerts(medicines, TODAY);
    expect(alerts.map((alert) => alert.status)).toEqual(['expired', 'expiring']);
    expect(alerts[0].daysLeft).toBe(-42);
    expect(alerts[1].daysLeft).toBe(34);
  });

  it('groups sellable units by expiry month', () => {
    const timeline = expiryTimeline(medicines, TODAY, 3);
    expect(timeline.map((bucket) => bucket.monthKey)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(timeline[1]).toEqual({ monthKey: '2026-12', units: 10, batches: 1 });
    expect(timeline[0].units).toBe(0);
  });

  it('groups sellable units by dosage form', () => {
    expect(unitsByDosageForm(medicines, TODAY)).toEqual([
      { form: 'syrup', units: 30, medicines: 1 },
      { form: 'tablet', units: 10, medicines: 2 },
    ]);
  });
});
