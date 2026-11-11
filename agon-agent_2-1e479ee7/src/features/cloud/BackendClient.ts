import type {
  AssistantClient,
  AssistantConversation,
  AssistantMessage,
  AssistantStatus,
  ChatResult,
} from '../assistant/types';
import type { PushResult, SyncChange, SyncTransport } from '../sync/types';

export interface CloudUser {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'staff';
  pharmacyId: string;
  pharmacyName: string;
  currencyCode: string;
}

export interface AuthResult {
  accessToken: string;
  user: CloudUser;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  version: string;
  database: 'up' | 'down';
  aiGateway: 'configured' | 'not_configured';
  time: string;
}

export interface RegisterInput {
  pharmacyName: string;
  displayName: string;
  email: string;
  password: string;
  currencyCode: string;
}

/** A failed call to the backend. `status` is null when it could not be reached. */
export class BackendError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
  }
}

export function normalizeBaseUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Typed client for the PharmaDesk NestJS backend (`/api/v1`).
 * Also serves as the sync transport and as the assistant client on desktop.
 */
export class BackendClient implements SyncTransport, AssistantClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly fetchImpl: FetchLike;

  constructor(baseUrl: string, getToken: () => string | null, fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
    this.fetchImpl = fetchImpl;
  }

  health(): Promise<HealthStatus> {
    return this.request<HealthStatus>('GET', '/health');
  }

  register(input: RegisterInput): Promise<AuthResult> {
    return this.request<AuthResult>('POST', '/auth/register', input);
  }

  login(email: string, password: string): Promise<AuthResult> {
    return this.request<AuthResult>('POST', '/auth/login', { email, password });
  }

  me(): Promise<CloudUser> {
    return this.request<CloudUser>('GET', '/auth/me');
  }

  async push(deviceId: string, changes: SyncChange[]): Promise<PushResult[]> {
    const response = await this.request<{ results: PushResult[] }>('POST', '/sync/push', { deviceId, changes });
    return response.results;
  }

  status(): Promise<AssistantStatus> {
    return this.request<AssistantStatus>('GET', '/ai/status');
  }

  listConversations(): Promise<AssistantConversation[]> {
    return this.request<AssistantConversation[]>('GET', '/ai/conversations');
  }

  listMessages(conversationId: string): Promise<AssistantMessage[]> {
    return this.request<AssistantMessage[]>('GET', `/ai/conversations/${encodeURIComponent(conversationId)}/messages`);
  }

  send(message: string, conversationId: string | null): Promise<ChatResult> {
    return this.request<ChatResult>('POST', '/ai/chat', conversationId ? { message, conversationId } : { message });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.request('DELETE', `/ai/conversations/${encodeURIComponent(conversationId)}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new BackendError(`Could not reach the backend at ${this.baseUrl}. Is it running and reachable?`, null);
    }

    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) return payload as T;

    const message =
      payload && typeof payload === 'object' && typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : `The backend responded with an error (${response.status}).`;
    throw new BackendError(message, response.status);
  }
}
