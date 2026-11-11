import { Injectable } from '@nestjs/common';
import { Database } from '../database/database';
import type {
  BatchListResult,
  BusinessTool,
  FindMedicineResult,
  InventorySummaryResult,
  LowStockResult,
  ToolContext,
} from './ai.types';

export const EXPIRY_WARNING_DAYS = 90;
const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;

type Row = Record<string, unknown>;

const major = (minor: unknown): string => (Number(minor) / 100).toFixed(2);

function location(row: Row): string {
  const parts = [
    row.rack ? `Rack ${row.rack as string}` : null,
    row.shelf ? `Shelf ${row.shelf as string}` : null,
    row.drawer ? `Drawer ${row.drawer as string}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : 'location not set';
}

/** Reads an integer argument supplied by a model, clamped to a safe range. */
function intArg(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

/** Sellable (non-expired) units per live medicine. $1 = pharmacy id, $2 = today. */
const STOCK_PER_MEDICINE = `
  SELECT m.id, m.name, m.generic_name, m.strength, m.dosage_form, m.unit, m.reorder_level,
         m.requires_prescription, m.rack, m.shelf, m.drawer,
         COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date >= $2::date), 0)::int AS sellable_units
    FROM medicines m
    LEFT JOIN medicine_batches b ON b.medicine_id = m.id AND b.deleted_at IS NULL
   WHERE m.pharmacy_id = $1 AND m.deleted_at IS NULL
   GROUP BY m.id`;

/** Live batches that hold stock, joined to their live medicine. $1 = pharmacy id. */
const STOCK_BATCHES = `
    FROM medicine_batches b
    JOIN medicines m ON m.id = b.medicine_id
   WHERE b.pharmacy_id = $1 AND b.deleted_at IS NULL AND m.deleted_at IS NULL AND b.quantity > 0`;

/**
 * The assistant's only access to business data.
 *
 * Every function here is read-only, uses fixed parameterised SQL, and is
 * scoped to the pharmacy in `ToolContext`. A language model can choose which
 * function to call and pass the small arguments declared below; it can never
 * supply SQL, a table name or a pharmacy id.
 */
@Injectable()
export class BusinessDataService {
  readonly tools: BusinessTool[] = [
    {
      name: 'get_inventory_summary',
      description:
        'Totals for the whole inventory: medicine count, sellable units, stock value at cost and at selling price, ' +
        'how many medicines are low or out of stock, and how many batches are expiring soon or already expired.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: (context) => this.getInventorySummary(context),
    },
    {
      name: 'list_low_stock_medicines',
      description: 'Medicines that are out of stock or at/below their reorder level, lowest stock first.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT } },
        additionalProperties: false,
      },
      execute: (context, args) => this.listLowStock(context, intArg(args.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)),
    },
    {
      name: 'list_expiring_batches',
      description: 'Stock-holding batches that expire within the next N days (not yet expired), soonest first.',
      parameters: {
        type: 'object',
        properties: {
          withinDays: { type: 'integer', minimum: 1, maximum: 365, description: 'Defaults to 90.' },
          limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
        },
        additionalProperties: false,
      },
      execute: (context, args) =>
        this.listBatchesByExpiry(
          context,
          intArg(args.withinDays, EXPIRY_WARNING_DAYS, 1, 365),
          intArg(args.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
        ),
    },
    {
      name: 'list_expired_batches',
      description: 'Batches that are past their expiry date but still hold stock.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT } },
        additionalProperties: false,
      },
      execute: (context, args) => this.listBatchesByExpiry(context, null, intArg(args.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)),
    },
    {
      name: 'find_medicine',
      description:
        'Look up medicines by part of their name or generic name. Returns storage location (rack, shelf, drawer), ' +
        'sellable stock, nearest expiry and current selling price.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', minLength: 2, maxLength: 60 } },
        required: ['query'],
        additionalProperties: false,
      },
      execute: (context, args) => this.findMedicines(context, String(args.query ?? '')),
    },
  ];

  constructor(private readonly database: Database) {}

  async getInventorySummary(context: ToolContext): Promise<InventorySummaryResult> {
    const [batches, stock] = await Promise.all([
      this.database.query<Row>(
        `SELECT COUNT(*) FILTER (WHERE b.expiry_date >= $2::date)::int AS sellable_batches,
                COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date >= $2::date), 0)::int AS sellable_units,
                COALESCE(SUM(b.quantity::bigint * b.purchase_price_minor)
                         FILTER (WHERE b.expiry_date >= $2::date), 0)::text AS cost_minor,
                COALESCE(SUM(b.quantity::bigint * b.selling_price_minor)
                         FILTER (WHERE b.expiry_date >= $2::date), 0)::text AS retail_minor,
                COUNT(*) FILTER (WHERE b.expiry_date >= $2::date
                                   AND b.expiry_date <= $2::date + $3::int)::int AS expiring_batches,
                COUNT(*) FILTER (WHERE b.expiry_date < $2::date)::int AS expired_batches
         ${STOCK_BATCHES}`,
        [context.pharmacyId, context.today, EXPIRY_WARNING_DAYS],
      ),
      this.database.query<Row>(
        `SELECT COUNT(*)::int AS medicine_count,
                COUNT(*) FILTER (WHERE sellable_units = 0)::int AS out_of_stock,
                COUNT(*) FILTER (WHERE sellable_units > 0 AND sellable_units <= reorder_level)::int AS low_stock
           FROM (${STOCK_PER_MEDICINE}) stock`,
        [context.pharmacyId, context.today],
      ),
    ]);
    const b = batches.rows[0];
    const s = stock.rows[0];
    return {
      asOf: context.today,
      currency: context.currency,
      medicineCount: Number(s.medicine_count),
      sellableBatchCount: Number(b.sellable_batches),
      sellableUnits: Number(b.sellable_units),
      stockValueAtCost: major(b.cost_minor),
      stockValueAtSellingPrice: major(b.retail_minor),
      outOfStockCount: Number(s.out_of_stock),
      lowStockCount: Number(s.low_stock),
      expiringBatchCount: Number(b.expiring_batches),
      expiringWindowDays: EXPIRY_WARNING_DAYS,
      expiredBatchCount: Number(b.expired_batches),
    };
  }

  async listLowStock(context: ToolContext, limit: number = DEFAULT_LIMIT): Promise<LowStockResult> {
    const { rows } = await this.database.query<Row>(
      `SELECT stock.*, COUNT(*) OVER ()::int AS total_count
         FROM (${STOCK_PER_MEDICINE}) stock
        WHERE sellable_units = 0 OR sellable_units <= reorder_level
        ORDER BY sellable_units, lower(name)
        LIMIT $3::int`,
      [context.pharmacyId, context.today, limit],
    );
    return {
      asOf: context.today,
      totalCount: rows.length > 0 ? Number(rows[0].total_count) : 0,
      items: rows.map((row) => ({
        name: row.name as string,
        strength: row.strength as string | null,
        unit: row.unit as string,
        sellableUnits: Number(row.sellable_units),
        reorderLevel: Number(row.reorder_level),
        location: location(row),
      })),
    };
  }

  /** `withinDays` = null lists expired batches; a number lists batches expiring in that window. */
  async listBatchesByExpiry(
    context: ToolContext,
    withinDays: number | null,
    limit: number = DEFAULT_LIMIT,
  ): Promise<BatchListResult> {
    const select = `
      SELECT m.name AS medicine, m.strength, m.unit, m.rack, m.shelf, m.drawer, b.batch_number, b.quantity,
             to_char(b.expiry_date, 'YYYY-MM-DD') AS expiry_date,
             (b.expiry_date - $2::date)::int AS days_left,
             COUNT(*) OVER ()::int AS total_count
      ${STOCK_BATCHES}`;
    const { rows } =
      withinDays === null
        ? await this.database.query<Row>(
            `${select} AND b.expiry_date < $2::date ORDER BY b.expiry_date, lower(m.name) LIMIT $3::int`,
            [context.pharmacyId, context.today, limit],
          )
        : await this.database.query<Row>(
            `${select} AND b.expiry_date >= $2::date AND b.expiry_date <= $2::date + $3::int
              ORDER BY b.expiry_date, lower(m.name) LIMIT $4::int`,
            [context.pharmacyId, context.today, withinDays, limit],
          );
    return {
      asOf: context.today,
      withinDays,
      totalCount: rows.length > 0 ? Number(rows[0].total_count) : 0,
      items: rows.map((row) => ({
        medicine: row.medicine as string,
        strength: row.strength as string | null,
        unit: row.unit as string,
        batchNumber: row.batch_number as string,
        expiryDate: row.expiry_date as string,
        daysLeft: Number(row.days_left),
        quantity: Number(row.quantity),
        location: location(row),
      })),
    };
  }

  async findMedicines(context: ToolContext, query: string, limit: number = DEFAULT_LIMIT): Promise<FindMedicineResult> {
    const term = query.trim().slice(0, 60);
    // Escape LIKE wildcards so the search term is matched literally.
    const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const { rows } =
      term.length < 2
        ? { rows: [] as Row[] }
        : await this.database.query<Row>(
            `SELECT stock.*, next_batch.expiry_date AS nearest_expiry, next_batch.selling_price_minor,
                    COUNT(*) OVER ()::int AS total_count
               FROM (${STOCK_PER_MEDICINE}) stock
               LEFT JOIN LATERAL (
                 SELECT to_char(b.expiry_date, 'YYYY-MM-DD') AS expiry_date, b.selling_price_minor
                   FROM medicine_batches b
                  WHERE b.medicine_id = stock.id AND b.deleted_at IS NULL AND b.quantity > 0
                    AND b.expiry_date >= $2::date
                  ORDER BY b.expiry_date
                  LIMIT 1
               ) next_batch ON true
              WHERE stock.name ILIKE $3 OR stock.generic_name ILIKE $3
              ORDER BY lower(stock.name)
              LIMIT $4::int`,
            [context.pharmacyId, context.today, pattern, limit],
          );
    return {
      asOf: context.today,
      currency: context.currency,
      query: term,
      totalCount: rows.length > 0 ? Number(rows[0].total_count) : 0,
      items: rows.map((row) => ({
        name: row.name as string,
        genericName: row.generic_name as string | null,
        strength: row.strength as string | null,
        dosageForm: row.dosage_form as string,
        unit: row.unit as string,
        sellableUnits: Number(row.sellable_units),
        nearestExpiry: (row.nearest_expiry as string | null) ?? null,
        sellingPrice: row.selling_price_minor === null || row.selling_price_minor === undefined ? null : major(row.selling_price_minor),
        requiresPrescription: row.requires_prescription === true,
        location: location(row),
      })),
    };
  }
}
