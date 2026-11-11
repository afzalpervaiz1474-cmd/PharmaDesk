import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig, type OmniRouteConfig } from '../config/app-config';
import type { ChatMessage, ToolCall, ToolDefinition } from './ai.types';

/** The gateway could not produce an answer. The message never contains the API key. */
export class AiGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiGatewayError';
  }
}

export interface AssistantTurn {
  content: string | null;
  toolCalls: ToolCall[];
}

/**
 * Server-side client for the OmniRoute AI gateway.
 *
 * OmniRoute exposes an OpenAI-compatible API, so this posts to
 * `{OMNIROUTE_BASE_URL}/chat/completions` with a bearer key. The key lives in
 * the server's environment only: it is not logged, not returned by any
 * endpoint and never reaches the desktop app.
 *
 * Status: exercised against an OpenAI-compatible stub in the automated tests.
 * It has not been run against a live OmniRoute instance yet.
 */
@Injectable()
export class OmniRouteClient {
  private readonly gateway: OmniRouteConfig | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.gateway = config.omniroute;
  }

  get isConfigured(): boolean {
    return this.gateway !== null;
  }

  get model(): string | null {
    return this.gateway?.model ?? null;
  }

  async complete(messages: ChatMessage[], tools: ToolDefinition[]): Promise<AssistantTurn> {
    const gateway = this.gateway;
    if (!gateway) throw new AiGatewayError('The AI gateway is not configured');

    let response: Response;
    try {
      response = await fetch(`${gateway.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gateway.apiKey}` },
        body: JSON.stringify({
          model: gateway.model,
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0.1, // factual answers, not creative ones
        }),
        signal: AbortSignal.timeout(gateway.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new AiGatewayError(timedOut ? 'The AI gateway timed out' : 'The AI gateway could not be reached');
    }

    if (!response.ok) {
      // The response body is deliberately not included: it may echo request details.
      throw new AiGatewayError(`The AI gateway responded with HTTP ${response.status}`);
    }

    const payload = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: unknown; tool_calls?: unknown } }[];
    } | null;
    const message = payload?.choices?.[0]?.message;
    if (!message) throw new AiGatewayError('The AI gateway returned an unexpected response');

    return {
      content: typeof message.content === 'string' ? message.content : null,
      toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls.filter(isToolCall) : [],
    };
  }
}

function isToolCall(value: unknown): value is ToolCall {
  if (typeof value !== 'object' || value === null) return false;
  const call = value as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
  return (
    typeof call.id === 'string' &&
    typeof call.function?.name === 'string' &&
    typeof call.function?.arguments === 'string'
  );
}
