/**
 * Data-lookup assistant for the hosted preview (no language model involved).
 *
 * A question is matched to one fixed, read-only data function; the reply is
 * formatted from that function's result. Nothing is generated or estimated.
 *
 * The NestJS backend has the same behaviour as its fallback mode - see
 * backend/src/ai/data-lookup.ts and backend/src/ai/business-data.service.ts.
 * Keep the two in step when changing wording or matching rules.
 */

export const EXPIRY_WARNING_DAYS = 90;
const LIST_LIMIT = 15;

const NOT_RECORDED =
  /\b(sales?|revenue|turnover|profits?|margins?|expenses?|purchases|suppliers?|invoices?|billing|customers?)\b/;
const EXPIRED = /\bexpired\b/;
const EXPIRING = /\b(expir\w*|short[- ]dated)\b/;
const LOW_STOCK = /\b(low|re-?order\w*|restock\w*|running out|run out|out of stock|shortage)\b/;
const FIND =
  /\b(?:where (?:is|are|do (?:i|we) keep)|where's|locate|find|stock of|do (?:we|i) have|price of)\s+(.+)/;
const SUMMARY = /\b(summary|overview|inventory|stock value|total|worth|how many|status)\b/;

function parseWindowDays(text) {
  const days = /(\d{1,3})\s*days?/.exec(text);
  if (days) return Number(days[1]);
  const weeks = /(\d{1,2})\s*weeks?/.exec(text);
  if (weeks) return Number(weeks[1]) * 7;
  const months = /(\d{1,2})\s*months?/.exec(text);
  if (months) return Number(months[1]) * 30;
  return EXPIRY_WARNING_DAYS;
}

function cleanSearchTerm(raw) {
  return raw
    .replace(/[?.!,]+$/g, '')
    .replace(/^(?:the|any|my|our|some)\s+/, '')
    .replace(/\s+(?:kept|stored|located|placed|available|in stock|now|please|right now)$/g, '')
    .trim()
    .slice(0, 60);
}

/** Decides which data function answers a question. Pure and deterministic. */
export function routeQuestion(message) {
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

// ---------------------------------------------------------------------------
// Data functions. Each returns plain facts read from the inventory.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY);
const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
const major = (minor) => (minor / 100).toFixed(2);

function locationOf(medicine) {
  const parts = [
    medicine.rack ? `Rack ${medicine.rack}` : null,
    medicine.shelf ? `Shelf ${medicine.shelf}` : null,
    medicine.drawer ? `Drawer ${medicine.drawer}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'location not set';
}

function sellableUnits(medicine, today) {
  return medicine.batches.reduce((sum, batch) => (batch.expiryDate < today ? sum : sum + batch.quantity), 0);
}

function stockBatches(medicines) {
  return medicines.flatMap((medicine) =>
    medicine.batches.filter((batch) => batch.quantity > 0).map((batch) => ({ medicine, batch })),
  );
}

export function runTool(tool, args, medicines, today, currency) {
  switch (tool) {
    case 'get_inventory_summary': {
      const live = stockBatches(medicines);
      const sellable = live.filter(({ batch }) => batch.expiryDate >= today);
      const stock = medicines.map((medicine) => ({ medicine, units: sellableUnits(medicine, today) }));
      return {
        asOf: today,
        currency,
        medicineCount: medicines.length,
        sellableBatchCount: sellable.length,
        sellableUnits: sellable.reduce((sum, { batch }) => sum + batch.quantity, 0),
        stockValueAtCost: major(sellable.reduce((sum, { batch }) => sum + batch.quantity * batch.purchasePriceMinor, 0)),
        stockValueAtSellingPrice: major(
          sellable.reduce((sum, { batch }) => sum + batch.quantity * batch.sellingPriceMinor, 0),
        ),
        outOfStockCount: stock.filter(({ units }) => units === 0).length,
        lowStockCount: stock.filter(({ medicine, units }) => units > 0 && units <= medicine.reorderLevel).length,
        expiringBatchCount: sellable.filter(({ batch }) => daysBetween(today, batch.expiryDate) <= EXPIRY_WARNING_DAYS)
          .length,
        expiringWindowDays: EXPIRY_WARNING_DAYS,
        expiredBatchCount: live.length - sellable.length,
      };
    }
    case 'list_low_stock_medicines': {
      const items = medicines
        .map((medicine) => ({ medicine, units: sellableUnits(medicine, today) }))
        .filter(({ medicine, units }) => units === 0 || units <= medicine.reorderLevel)
        .sort((a, b) => a.units - b.units || a.medicine.name.localeCompare(b.medicine.name));
      return {
        asOf: today,
        totalCount: items.length,
        items: items.slice(0, LIST_LIMIT).map(({ medicine, units }) => ({
          name: medicine.name,
          strength: medicine.strength,
          unit: medicine.unit,
          sellableUnits: units,
          reorderLevel: medicine.reorderLevel,
          location: locationOf(medicine),
        })),
      };
    }
    case 'list_expiring_batches':
    case 'list_expired_batches': {
      const expired = tool === 'list_expired_batches';
      const withinDays = expired ? null : args.withinDays ?? EXPIRY_WARNING_DAYS;
      const items = stockBatches(medicines)
        .map((entry) => ({ ...entry, daysLeft: daysBetween(today, entry.batch.expiryDate) }))
        .filter(({ daysLeft }) => (expired ? daysLeft < 0 : daysLeft >= 0 && daysLeft <= withinDays))
        .sort((a, b) => a.daysLeft - b.daysLeft);
      return {
        asOf: today,
        withinDays,
        totalCount: items.length,
        items: items.slice(0, LIST_LIMIT).map(({ medicine, batch, daysLeft }) => ({
          medicine: medicine.name,
          strength: medicine.strength,
          unit: medicine.unit,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          daysLeft,
          quantity: batch.quantity,
          location: locationOf(medicine),
        })),
      };
    }
    case 'find_medicine': {
      const needle = String(args.query ?? '').toLowerCase();
      const matches = medicines.filter(
        (medicine) =>
          medicine.name.toLowerCase().includes(needle) || (medicine.genericName ?? '').toLowerCase().includes(needle),
      );
      return {
        asOf: today,
        currency,
        query: args.query,
        totalCount: matches.length,
        items: matches.slice(0, LIST_LIMIT).map((medicine) => {
          const next = medicine.batches.find((batch) => batch.quantity > 0 && batch.expiryDate >= today) ?? null;
          return {
            name: medicine.name,
            genericName: medicine.genericName,
            strength: medicine.strength,
            dosageForm: medicine.dosageForm,
            unit: medicine.unit,
            sellableUnits: sellableUnits(medicine, today),
            nearestExpiry: next ? next.expiryDate : null,
            sellingPrice: next ? major(next.sellingPriceMinor) : null,
            requiresPrescription: medicine.requiresPrescription,
            location: locationOf(medicine),
          };
        }),
      };
    }
    default:
      throw new Error(`Unknown data function: ${tool}`);
  }
}

// ---------------------------------------------------------------------------
// Reply formatting. Every number printed comes from a result object above.
// ---------------------------------------------------------------------------

const count = (value) => Number(value).toLocaleString('en');
const amount = (value, currency) =>
  `${currency} ${Number(value).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (item) => (item.strength ? `${item.name ?? item.medicine} ${item.strength}` : item.name ?? item.medicine);
const more = (result) =>
  result.totalCount > result.items.length ? `\n…and ${result.totalCount - result.items.length} more.` : '';

export function formatResult(tool, result) {
  switch (tool) {
    case 'get_inventory_summary':
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
    case 'list_low_stock_medicines':
      if (result.totalCount === 0) {
        return `As of ${result.asOf}, no medicine is out of stock or at its reorder level.`;
      }
      return (
        `${count(result.totalCount)} medicine(s) need reordering as of ${result.asOf}:\n` +
        result.items
          .map(
            (item) =>
              `• ${label(item)}: ${count(item.sellableUnits)} ${item.unit} sellable ` +
              `(reorder level ${count(item.reorderLevel)})${item.sellableUnits === 0 ? ', OUT OF STOCK' : ''} — ${item.location}`,
          )
          .join('\n') +
        more(result)
      );
    case 'list_expiring_batches':
      if (result.totalCount === 0) {
        return `As of ${result.asOf}, no stock-holding batch expires within ${result.withinDays} days.`;
      }
      return (
        `${count(result.totalCount)} batch(es) expire within ${result.withinDays} days of ${result.asOf}:\n` +
        result.items
          .map(
            (item) =>
              `• ${label(item)}, batch ${item.batchNumber}: expires ${item.expiryDate} ` +
              `(${item.daysLeft} days), ${count(item.quantity)} ${item.unit} — ${item.location}`,
          )
          .join('\n') +
        more(result)
      );
    case 'list_expired_batches':
      if (result.totalCount === 0) return `As of ${result.asOf}, no expired batch is holding stock.`;
      return (
        `${count(result.totalCount)} expired batch(es) still hold stock as of ${result.asOf}:\n` +
        result.items
          .map(
            (item) =>
              `• ${label(item)}, batch ${item.batchNumber}: expired ${item.expiryDate} ` +
              `(${Math.abs(item.daysLeft)} days ago), ${count(item.quantity)} ${item.unit} — ${item.location}`,
          )
          .join('\n') +
        more(result)
      );
    case 'find_medicine':
      if (result.totalCount === 0) {
        return `No registered medicine has "${result.query}" in its name or generic name.`;
      }
      return (
        `${count(result.totalCount)} match(es) for "${result.query}":\n` +
        result.items
          .map(
            (item) =>
              `• ${label(item)} (${item.dosageForm}): ${item.location}. ` +
              `${count(item.sellableUnits)} ${item.unit} sellable` +
              (item.nearestExpiry ? `, nearest expiry ${item.nearestExpiry}` : '') +
              (item.sellingPrice ? `, sells at ${amount(item.sellingPrice, result.currency)}` : '') +
              (item.requiresPrescription ? '. Prescription required' : '') +
              '.',
          )
          .join('\n') +
        more(result)
      );
    default:
      return HELP_TEXT;
  }
}
