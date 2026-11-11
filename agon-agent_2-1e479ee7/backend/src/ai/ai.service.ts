import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { UsersRepository } from '../auth/users.repository';
import type { ChatDto } from './ai.dto';
import type {
  AssistantStatus,
  ChatMessage,
  ChatResponse,
  ConversationView,
  MessageSource,
  MessageView,
  ToolCall,
  ToolContext,
  ToolDefinition,
} from './ai.types';
import { BusinessDataService } from './business-data.service';
import { ConversationsRepository } from './conversations.repository';
import { formatToolResult, HELP_TEXT, NOT_RECORDED_TEXT, routeQuestion } from './data-lookup';
import { AiGatewayError, OmniRouteClient } from './omniroute.client';
import { buildSystemPrompt, GATEWAY_FALLBACK_NOTICE } from './prompts';

/** Upper bound on model <-> function round trips for one question. */
export const MAX_TOOL_ROUNDS = 4;
/** How many recent messages are sent to the model as context. */
const HISTORY_LIMIT = 20;
const TITLE_LENGTH = 60;

interface Answer {
  content: string;
  source: MessageSource;
  toolsUsed: string[];
  model: string | null;
}

/**
 * Answers assistant questions.
 *
 * With a gateway key: the model receives the question plus the list of
 * read-only data functions, may ask for some of them to be run, and writes
 * its answer from the results.
 * Without a key, or when the gateway fails: the question is answered by a
 * direct data lookup and labelled as such.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly gateway: OmniRouteClient,
    private readonly data: BusinessDataService,
    private readonly conversations: ConversationsRepository,
    private readonly users: UsersRepository,
  ) {}

  status(): AssistantStatus {
    return this.gateway.isConfigured
      ? { mode: 'ai', model: this.gateway.model }
      : { mode: 'data_lookup', model: null };
  }

  listConversations(user: AuthUser): Promise<ConversationView[]> {
    return this.conversations.list(user.userId);
  }

  async listMessages(user: AuthUser, conversationId: string): Promise<MessageView[]> {
    await this.requireConversation(user, conversationId);
    return this.conversations.messages(conversationId);
  }

  async deleteConversation(user: AuthUser, conversationId: string): Promise<void> {
    const deleted = await this.conversations.delete(conversationId, user.userId);
    if (!deleted) throw new NotFoundException('Conversation not found');
  }

  async chat(user: AuthUser, dto: ChatDto): Promise<ChatResponse> {
    const profile = await this.users.findById(user.userId);
    if (!profile) throw new UnauthorizedException('This account no longer exists');

    const conversation = dto.conversationId
      ? await this.requireConversation(user, dto.conversationId)
      : await this.conversations.create(user.pharmacyId, user.userId, dto.message.slice(0, TITLE_LENGTH));

    const userMessage = await this.conversations.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: dto.message,
      source: 'user',
    });

    // The data scope comes from the verified token, never from the question or the model.
    const context: ToolContext = {
      pharmacyId: user.pharmacyId,
      currency: profile.currencyCode,
      today: new Date().toISOString().slice(0, 10),
    };
    const answer = await this.answer(context, conversation.id, dto.message);

    const assistantMessage = await this.conversations.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      ...answer,
    });
    return { conversation: await this.conversations.touch(conversation.id), userMessage, assistantMessage };
  }

  private async requireConversation(user: AuthUser, conversationId: string): Promise<ConversationView> {
    const conversation = await this.conversations.findOwned(conversationId, user.userId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async answer(context: ToolContext, conversationId: string, question: string): Promise<Answer> {
    if (!this.gateway.isConfigured) return this.answerByLookup(context, question);
    try {
      return await this.answerWithModel(context, conversationId);
    } catch (error) {
      if (!(error instanceof AiGatewayError)) throw error;
      this.logger.warn(`AI gateway failed, answering by data lookup instead: ${error.message}`);
      const fallback = await this.answerByLookup(context, question);
      return { ...fallback, content: `${GATEWAY_FALLBACK_NOTICE}\n\n${fallback.content}` };
    }
  }

  /** No model involved: keyword match -> one data function -> formatted result. */
  private async answerByLookup(context: ToolContext, question: string): Promise<Answer> {
    const route = routeQuestion(question);
    if (route.kind === 'not_recorded') return lookupAnswer(NOT_RECORDED_TEXT);
    if (route.kind === 'help') return lookupAnswer(HELP_TEXT);

    const tool = this.data.tools.find((candidate) => candidate.name === route.tool);
    if (!tool) return lookupAnswer(HELP_TEXT);
    const result = await tool.execute(context, route.args);
    return lookupAnswer(formatToolResult(tool.name, result), [tool.name]);
  }

  private async answerWithModel(context: ToolContext, conversationId: string): Promise<Answer> {
    const history = await this.conversations.messages(conversationId, HISTORY_LIMIT);
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(context) },
      ...history.map(
        (message): ChatMessage =>
          message.role === 'user'
            ? { role: 'user', content: message.content }
            : { role: 'assistant', content: message.content },
      ),
    ];
    const tools: ToolDefinition[] = this.data.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));

    const toolsUsed = new Set<string>();
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const turn = await this.gateway.complete(messages, tools);

      if (turn.toolCalls.length === 0) {
        const content = turn.content?.trim();
        if (!content) throw new AiGatewayError('The model returned an empty answer');
        return { content, source: 'ai', toolsUsed: [...toolsUsed], model: this.gateway.model };
      }

      messages.push({ role: 'assistant', content: turn.content, tool_calls: turn.toolCalls });
      for (const call of turn.toolCalls) {
        const result = await this.runRequestedTool(context, call, toolsUsed);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    throw new AiGatewayError('The model kept requesting data without giving an answer');
  }

  /** Runs one function the model asked for. Failures are reported back to the model, not thrown. */
  private async runRequestedTool(context: ToolContext, call: ToolCall, toolsUsed: Set<string>): Promise<unknown> {
    const tool = this.data.tools.find((candidate) => candidate.name === call.function.name);
    if (!tool) {
      return { error: `Unknown function. Available: ${this.data.tools.map((candidate) => candidate.name).join(', ')}` };
    }

    let args: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(call.function.arguments || '{}');
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      return { error: 'The function arguments were not valid JSON.' };
    }

    try {
      const result = await tool.execute(context, args);
      toolsUsed.add(tool.name);
      return result;
    } catch (error) {
      this.logger.error(`Data function ${tool.name} failed: ${error instanceof Error ? error.message : error}`);
      return { error: 'The data function failed. Tell the user this information is unavailable right now.' };
    }
  }
}

function lookupAnswer(content: string, toolsUsed: string[] = []): Answer {
  return { content, source: 'data_lookup', toolsUsed, model: null };
}
