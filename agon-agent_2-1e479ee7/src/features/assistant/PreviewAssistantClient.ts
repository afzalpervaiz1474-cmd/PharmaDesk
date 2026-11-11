import type {
  AssistantClient,
  AssistantConversation,
  AssistantMessage,
  AssistantStatus,
  ChatResult,
} from './types';

const CLIENT_ID_KEY = 'pharmadesk.preview.clientId';

/**
 * The hosted preview has no accounts, so each browser gets a random id that
 * keeps its conversation history apart from other visitors'.
 */
function previewClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Assistant client for the hosted web preview (`/api/assistant`).
 * The preview has no AI gateway key, so it always answers in data-lookup mode.
 */
export class PreviewAssistantClient implements AssistantClient {
  private readonly clientId = previewClientId();
  private readonly currency: string;

  constructor(currency: string) {
    this.currency = currency;
  }

  status(): Promise<AssistantStatus> {
    return this.request<AssistantStatus>('GET', { resource: 'status' });
  }

  listConversations(): Promise<AssistantConversation[]> {
    return this.request<AssistantConversation[]>('GET', { resource: 'conversations', clientId: this.clientId });
  }

  listMessages(conversationId: string): Promise<AssistantMessage[]> {
    return this.request<AssistantMessage[]>('GET', {
      resource: 'messages',
      clientId: this.clientId,
      conversationId,
    });
  }

  send(message: string, conversationId: string | null): Promise<ChatResult> {
    return this.request<ChatResult>('POST', undefined, {
      clientId: this.clientId,
      conversationId,
      message,
      currency: this.currency,
    });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.request('DELETE', undefined, { clientId: this.clientId, conversationId });
  }

  private async request<T>(method: string, query?: Record<string, string>, body?: unknown): Promise<T> {
    const search = query ? `?${new URLSearchParams(query).toString()}` : '';
    let response: Response;
    try {
      response = await fetch(`/api/assistant${search}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) return payload as T;
    const message = (payload as { error?: string } | null)?.error;
    throw new Error(message ?? `The server responded with an error (${response.status}).`);
  }
}
