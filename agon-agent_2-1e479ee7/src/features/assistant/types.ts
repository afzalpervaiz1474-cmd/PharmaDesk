export interface AssistantConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Where an answer came from.
 * - ai:          a language model reached through the OmniRoute gateway,
 *                working from read-only data tools.
 * - data_lookup: no model involved; a direct, read-only database lookup.
 */
export type MessageSource = 'user' | 'ai' | 'data_lookup';

export interface AssistantMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  source: MessageSource;
  /** Names of the backend data functions the answer is based on. */
  toolsUsed: string[];
  model: string | null;
  createdAt: string;
}

export interface AssistantStatus {
  mode: 'ai' | 'data_lookup';
  model: string | null;
}

export interface ChatResult {
  conversation: AssistantConversation;
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
}

/** The chat UI talks to this interface only; it never sees API keys or SQL. */
export interface AssistantClient {
  status(): Promise<AssistantStatus>;
  listConversations(): Promise<AssistantConversation[]>;
  listMessages(conversationId: string): Promise<AssistantMessage[]>;
  send(message: string, conversationId: string | null): Promise<ChatResult>;
  deleteConversation(conversationId: string): Promise<void>;
}

export const MAX_MESSAGE_LENGTH = 2000;

export const TOOL_LABELS: Record<string, string> = {
  get_inventory_summary: 'inventory summary',
  list_low_stock_medicines: 'reorder list',
  list_expiring_batches: 'expiring batches',
  list_expired_batches: 'expired batches',
  find_medicine: 'medicine search',
};
