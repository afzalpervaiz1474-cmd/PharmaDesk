import type { BatchListResult, FindMedicineResult, InventorySummaryResult, LowStockResult } from './ai.types';
import { formatToolResult, routeQuestion } from './data-lookup';

describe('routeQuestion', () => {
  it.each([
    ['Give me an inventory summary', 'get_inventory_summary'],
    ['How many medicines do I have?', 'get_inventory_summary'],
    ['Which medicines need reordering?', 'list_low_stock_medicines'],
    ['What is running out?', 'list_low_stock_medicines'],
    ['Which batches have expired?', 'list_expired_batches'],
    ['Show short-dated stock', 'list_expiring_batches'],
  ])('routes "%s" to %s', (question, tool) => {
    expect(routeQuestion(question)).toMatchObject({ kind: 'tool', tool });
  });

  it('reads the time window for expiry questions and clamps it', () => {
    expect(routeQuestion('What expires in the next 60 days?')).toMatchObject({ args: { withinDays: 60 } });
    expect(routeQuestion('expiring within 2 weeks')).toMatchObject({ args: { withinDays: 14 } });
    expect(routeQuestion('expiry in 3 months')).toMatchObject({ args: { withinDays: 90 } });
    expect(routeQuestion('expiring in 999 days')).toMatchObject({ args: { withinDays: 365 } });
    expect(routeQuestion('what is expiring soon')).toMatchObject({ args: { withinDays: 90 } });
  });

  it('extracts the medicine name from location and stock questions', () => {
    expect(routeQuestion('Where is Paracetamol kept?')).toMatchObject({ tool: 'find_medicine', args: { query: 'paracetamol' } });
    expect(routeQuestion('Do we have any amoxicillin in stock')).toMatchObject({ args: { query: 'amoxicillin' } });
    expect(routeQuestion('price of cough syrup dx')).toMatchObject({ args: { query: 'cough syrup dx' } });
  });

  it('never routes sales, profit or expense questions to a data function', () => {
    for (const question of ['What was my profit this month?', 'Total sales today', 'Show expenses', 'top customers']) {
      expect(routeQuestion(question)).toEqual({ kind: 'not_recorded' });
    }
  });

  it('falls back to help for anything it cannot match', () => {
    expect(routeQuestion('hello')).toEqual({ kind: 'help' });
    expect(routeQuestion('find x')).toEqual({ kind: 'help' });
  });
});

describe('formatToolResult', () => {
  it('prints the summary using exactly the figures it was given', () => {
    const result: InventorySummaryResult = {
      asOf: '2026-11-11',
      currency: 'INR',
      medicineCount: 22,
      sellableBatchCount: 21,
      sellableUnits: 1732,
      stockValueAtCost: '31341.00',
      stockValueAtSellingPrice: '46681.50',
      outOfStockCount: 2,
      lowStockCount: 3,
      expiringBatchCount: 4,
      expiringWindowDays: 90,
      expiredBatchCount: 3,
    };
    const text = formatToolResult('get_inventory_summary', result);
    expect(text).toContain('Medicines registered: 22');
    expect(text).toContain('1,732 units in 21 batches');
    expect(text).toContain('INR 31,341.00 (INR 46,681.50 at selling price)');
    expect(text).toContain('2 out of stock, 3 low');
    expect(text).toContain('Expiring within 90 days: 4 batches');
  });

  it('says so plainly when a list is empty', () => {
    const empty: LowStockResult = { asOf: '2026-11-11', totalCount: 0, items: [] };
    expect(formatToolResult('list_low_stock_medicines', empty)).toMatch(/no medicine is out of stock/);
    const none: FindMedicineResult = { asOf: '2026-11-11', currency: 'INR', query: 'xyz', totalCount: 0, items: [] };
    expect(formatToolResult('find_medicine', none)).toBe('No registered medicine has "xyz" in its name or generic name.');
  });

  it('flags out-of-stock items and notes when a list was shortened', () => {
    const result: LowStockResult = {
      asOf: '2026-11-11',
      totalCount: 9,
      items: [{ name: 'Ondansetron', strength: '4 mg', unit: 'strip', sellableUnits: 0, reorderLevel: 15, location: 'Rack B' }],
    };
    const text = formatToolResult('list_low_stock_medicines', result);
    expect(text).toContain('Ondansetron 4 mg: 0 strip sellable (reorder level 15), OUT OF STOCK — Rack B');
    expect(text).toContain('…and 8 more.');
  });

  it('words expired and expiring batches differently', () => {
    const item = { medicine: 'Cetirizine', strength: '10 mg', unit: 'strip', batchNumber: 'CTZ-1', quantity: 35, location: 'Rack A' };
    const expired: BatchListResult = {
      asOf: '2026-11-11', withinDays: null, totalCount: 1,
      items: [{ ...item, expiryDate: '2026-10-31', daysLeft: -11 }],
    };
    const expiring: BatchListResult = {
      asOf: '2026-11-11', withinDays: 60, totalCount: 1,
      items: [{ ...item, expiryDate: '2026-12-20', daysLeft: 39 }],
    };
    expect(formatToolResult('list_expired_batches', expired)).toContain('expired 2026-10-31 (11 days ago), 35 strip');
    expect(formatToolResult('list_expiring_batches', expiring)).toContain('expires 2026-12-20 (39 days), 35 strip');
  });
});
