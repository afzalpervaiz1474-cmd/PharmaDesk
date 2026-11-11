/** Names of the read-only data functions the assistant may use. */
export const TOOL_NAMES = [
  'get_inventory_summary',
  'list_low_stock_medicines',
  'list_expiring_batches',
  'list_expired_batches',
  'find_medicine',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** Who is asking, and "now". Built by the server; a model cannot influence it. */
export interface ToolContext {
  pharmacyId: string;
  currency: string;
  /** YYYY-MM-DD */
  today: string;
}

/**
 * Results are plain facts. Money is given in major units as a decimal string
 * (e.g. "1234.50") together with the currency, so a model never has to
 * convert minor units itself.
 */
export interface InventorySummaryResult {
  asOf: string;
  currency: string;
  medicineCount: number;
  sellableBatchCount: number;
  sellableUnits: number;
  stockValueAtCost: string;
  stockValueAtSellingPrice: string;
  outOfStockCount: number;
  lowStockCount: number;
  expiringBatchCount: number;
  expiringWindowDays: number;
  expiredBatchCount: number;
}

export interface LowStockResult {
  asOf: string;
  totalCount: number;
  items: {
    name: string;
    strength: string | null;
    unit: string;
    sellableUnits: number;
    reorderLevel: number;
    location: string;
  }[];
}

export interface BatchListResult {
  asOf: string;
  /** null for the expired list. */
  withinDays: number | null;
  totalCount: number;
  items: {
    medicine: string;
    strength: string | null;
    unit: string;
    batchNumber: string;
    expiryDate: string;
    /** Negative when already expired. */
    daysLeft: number;
    quantity: number;
    location: string;
  }[];
}

export interface FindMedicineResult {
  asOf: string;
  currency: string;
  query: string;
  totalCount: number;
  items: {
    name: string;
    genericName: string | null;
    strength: string | null;
    dosageForm: string;
    unit: string;
    sellableUnits: number;
    nearestExpiry: string | null;
    sellingPrice: string | null;
    requiresPrescription: boolean;
    location: string;
  }[];
}

export type ToolResult = InventorySummaryResult | LowStockResult | BatchListResult | FindMedicineResult;

/** A data function as offered to the model (OpenAI-compatible "tool"). */
export interface BusinessTool {
  name: ToolName;
  description: string;
  /** JSON Schema of the arguments. */
  parameters: Record<string, unknown>;
  execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult>;
}

// --- OpenAI-compatible chat wire format (what OmniRoute accepts at /v1) -----

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

// --- API shapes ------------------------------------------------------------

export interface ConversationView {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type MessageSource = 'user' | 'ai' | 'data_lookup';

export interface MessageView {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  source: MessageSource;
  toolsUsed: string[];
  model: string | null;
  createdAt: string;
}

export interface ChatResponse {
  conversation: ConversationView;
  userMessage: MessageView;
  assistantMessage: MessageView;
}

export interface AssistantStatus {
  mode: 'ai' | 'data_lookup';
  model: string | null;
}
