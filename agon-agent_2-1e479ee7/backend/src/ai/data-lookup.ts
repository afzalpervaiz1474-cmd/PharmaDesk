import type {
  BatchListResult,
  FindMedicineResult,
  InventorySummaryResult,
  LowStockResult,
  ToolName,
  ToolResult,
} from './ai.types';
import { EXPIRY_WARNING_DAYS } from './business-data.service';

/**
 * Data-lookup mode: answering without a language model.
 *
 * Used when no OmniRoute key is configured, and as the fallback when the
 * gateway fails. A question is matched to one data function by keyword and
 * the reply is formatted from that function's result - nothing is generated.
 *
 * The hosted preview mirrors this file in api/_lib/lookup.js; keep the two in
 * step when changing wording or matching rules.
 */

export type LookupRoute =
  | { kind: 'tool'; tool: ToolName; args: Record<string, unknown> }
  | { kind: 'not_recorded' }
  | { kind: 'help' };

const NOT_RECORDED =
  /\b(sales?|revenue|turnover|profits?|margins?|expenses?|purchases|suppliers?|invoices?|billing|customers?)\b/;
const EXPIRED = /\bexpired\b/;
const EXPIRING = /\b(expir\w*|short[- ]dated)\b/;
const LOW_STOCK = /\b(low|re-?order\w*|restock\w*|running out|run out|out of stock|shortage)\b/;
const FIND =
  /\b(?:where (?:is|are|do (?:i|we) keep)|where's|locate|find|stock of|do (?:we|i) have|price of)\s+(.+)/;
const SUMMARY = /\b(summary|overview|inventory|stock value|total|worth|how many|status)\b/;

function parseWindowDays(text: string): number {
  const days = /(\d{1,3})\s*days?/.exec(text);
  if (days) return Number(days[1]);
  const weeks = /(\d{1,2})\s*weeks?/.exec(text);
  if (weeks) return Number(weeks[1]) * 7;
  const months = /(\d{1,2})\s*months?/.exec(text);
  if (months) return Number(months[1]) * 30;
  return EXPIRY_WARNING_DAYS;
}

function cleanSearchTerm(raw: string): string {
  return raw
    .replace(/[?.!,]+$/g, '')
    .replace(/^(?:the|any|my|our|some)\s+/, '')
    .replace(/\s+(?:kept|stored|located|placed|available|in stock|now|please|right now)$/g, '')
    .trim()
    .slice(0, 60);
}

/** Decides which data function answers a question. Pure and deterministic. */
export function routeQuestion(message: string): LookupRoute {
  const text = message.toLowerCase().trim();
  if (NOT_RECORDED.test(text)) return { kind: 'not_recorded' };
  if (EXPIRED.test(text)) return { kind: 'tool', tool: 'list_expired_batches', args: {} };
  if (EXPIRING.test(text)) {
    const withinDays = Math.min(Math.max(parseWindowDays(text), 1), 365);
    return { kind: 'tool', tool: 'list_expiring_batches', args: { withinDays } };
  }
  if (LOW_STOCK.test(text)) return { kind: 'tool', tool: 'list_low_stock_medicines', args: {} };
  const find = FIND.exec(text);
  if (find) {
    const query = cleanSearchTerm(find[1]);
    if (query.length >= 2) return { kind: 'tool', tool: 'find_medicine', args: { query } };
  }
  if (SUMMARY.test(text)) return { kind: 'tool', tool: 'get_inventory_summary', args: {} };
  return { kind: 'help' };
}

export const NOT_RECORDED_TEXT =
  'PharmaDesk does not record sales, purchases, expenses or profit yet, so there are no figures for that question ' +
  'and I will not estimate them. Those modules are on the roadmap. I can answer questions about current stock, ' +
  'reorder needs, expiry dates and where a medicine is kept.';

export const HELP_TEXT =
  'I could not match that to a data lookup. In this mode I can answer:\n' +
  '• "Give me an inventory summary"\n' +
  '• "Which medicines need reordering?"\n' +
  '• "What expires in the next 60 days?"\n' +
  '• "Which batches have expired?"\n' +
  '• "Where is <medicine name> kept?"';

// --- Formatting. Every number printed comes from a result object. -----------

const count = (value: number): string => value.toLocaleString('en');
const amount = (value: string, currency: string): string =>
  `${currency} ${Number(value).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const withStrength = (name: string, strength: string | null): string => (strength ? `${name} ${strength}` : name);
const more = (result: { totalCount: number; items: unknown[] }): string =>
  result.totalCount > result.items.length ? `\n…and ${result.totalCount - result.items.length} more.` : '';

function formatSummary(result: InventorySummaryResult): string {
  return [
    `Inventory summary as of ${result.asOf}:`,
    `• Medicines registered: ${count(result.medicineCount)}`,
    `• Sellable stock: ${count(result.sellableUnits)} units in ${count(result.sellableBatchCount)} batches`,
    `• Stock value at cost: ${amount(result.stockValueAtCost, result.currency)} ` +
      `(${amount(result.stockValueAtSellingPrice, result.currency)} at selling price)`,
    `• Needs reorder: ${count(result.outOfStockCount)} out of stock, ${count(result.lowStockCount)} low`,
    `• Expiring within ${result.expiringWindowDays} days: ${count(result.expiringBatchCount)} batches`,
    `• Expired stock still on shelves: ${count(result.expiredBatchCount)} batches`,
  ].join('\n');
}

function formatLowStock(result: LowStockResult): string {
  if (result.totalCount === 0) return `As of ${result.asOf}, no medicine is out of stock or at its reorder level.`;
  const lines = result.items.map(
    (item) =>
      `• ${withStrength(item.name, item.strength)}: ${count(item.sellableUnits)} ${item.unit} sellable ` +
      `(reorder level ${count(item.reorderLevel)})${item.sellableUnits === 0 ? ', OUT OF STOCK' : ''} — ${item.location}`,
  );
  return `${count(result.totalCount)} medicine(s) need reordering as of ${result.asOf}:\n${lines.join('\n')}${more(result)}`;
}

function formatBatches(result: BatchListResult): string {
  const expired = result.withinDays === null;
  if (result.totalCount === 0) {
    return expired
      ? `As of ${result.asOf}, no expired batch is holding stock.`
      : `As of ${result.asOf}, no stock-holding batch expires within ${result.withinDays} days.`;
  }
  const lines = result.items.map((item) => {
    const when = expired
      ? `expired ${item.expiryDate} (${Math.abs(item.daysLeft)} days ago)`
      : `expires ${item.expiryDate} (${item.daysLeft} days)`;
    return `• ${withStrength(item.medicine, item.strength)}, batch ${item.batchNumber}: ${when}, ${count(item.quantity)} ${item.unit} — ${item.location}`;
  });
  const heading = expired
    ? `${count(result.totalCount)} expired batch(es) still hold stock as of ${result.asOf}:`
    : `${count(result.totalCount)} batch(es) expire within ${result.withinDays} days of ${result.asOf}:`;
  return `${heading}\n${lines.join('\n')}${more(result)}`;
}

function formatFind(result: FindMedicineResult): string {
  if (result.totalCount === 0) return `No registered medicine has "${result.query}" in its name or generic name.`;
  const lines = result.items.map(
    (item) =>
      `• ${withStrength(item.name, item.strength)} (${item.dosageForm}): ${item.location}. ` +
      `${count(item.sellableUnits)} ${item.unit} sellable` +
      (item.nearestExpiry ? `, nearest expiry ${item.nearestExpiry}` : '') +
      (item.sellingPrice ? `, sells at ${amount(item.sellingPrice, result.currency)}` : '') +
      (item.requiresPrescription ? '. Prescription required' : '') +
      '.',
  );
  return `${count(result.totalCount)} match(es) for "${result.query}":\n${lines.join('\n')}${more(result)}`;
}

export function formatToolResult(tool: ToolName, result: ToolResult): string {
  switch (tool) {
    case 'get_inventory_summary':
      return formatSummary(result as InventorySummaryResult);
    case 'list_low_stock_medicines':
      return formatLowStock(result as LowStockResult);
    case 'list_expiring_batches':
    case 'list_expired_batches':
      return formatBatches(result as BatchListResult);
    case 'find_medicine':
      return formatFind(result as FindMedicineResult);
  }
}
