import { Injectable } from '@nestjs/common';
import { Database } from '../database/database';
import type { ConversationView, MessageSource, MessageView } from './ai.types';

type Row = Record<string, unknown>;

const iso = (value: unknown): string => new Date(value as string | Date).toISOString();

function toConversation(row: Row): ConversationView {
  return {
    id: row.id as string,
    title: row.title as string,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toMessage(row: Row): MessageView {
  const toolsUsed = (row.tools_used as string) ?? '';
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    role: row.role as MessageView['role'],
    content: row.content as string,
    source: row.source as MessageSource,
    toolsUsed: toolsUsed === '' ? [] : toolsUsed.split(','),
    model: (row.model as string | null) ?? null,
    createdAt: iso(row.created_at),
  };
}

export interface NewMessage {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  source: MessageSource;
  toolsUsed?: string[];
  model?: string | null;
}

/** Conversation history. A conversation is only visible to the user who started it. */
@Injectable()
export class ConversationsRepository {
  constructor(private readonly database: Database) {}

  async list(userId: string): Promise<ConversationView[]> {
    const { rows } = await this.database.query<Row>(
      'SELECT * FROM ai_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100',
      [userId],
    );
    return rows.map(toConversation);
  }

  async findOwned(conversationId: string, userId: string): Promise<ConversationView | null> {
    const { rows } = await this.database.query<Row>(
      'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId],
    );
    return rows[0] ? toConversation(rows[0]) : null;
  }

  async create(pharmacyId: string, userId: string, title: string): Promise<ConversationView> {
    const { rows } = await this.database.query<Row>(
      'INSERT INTO ai_conversations (pharmacy_id, user_id, title) VALUES ($1, $2, $3) RETURNING *',
      [pharmacyId, userId, title],
    );
    return toConversation(rows[0]);
  }

  async touch(conversationId: string): Promise<ConversationView> {
    const { rows } = await this.database.query<Row>(
      'UPDATE ai_conversations SET updated_at = now() WHERE id = $1 RETURNING *',
      [conversationId],
    );
    return toConversation(rows[0]);
  }

  async delete(conversationId: string, userId: string): Promise<boolean> {
    const { rows } = await this.database.query(
      'DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [conversationId, userId],
    );
    return rows.length > 0;
  }

  /** Oldest first. `limit` keeps the most recent messages. */
  async messages(conversationId: string, limit: number = 500): Promise<MessageView[]> {
    const { rows } = await this.database.query<Row>(
      `SELECT * FROM (
         SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2::int
       ) recent ORDER BY created_at ASC`,
      [conversationId, limit],
    );
    return rows.map(toMessage);
  }

  async addMessage(message: NewMessage): Promise<MessageView> {
    const { rows } = await this.database.query<Row>(
      // clock_timestamp() (not now()) so two messages in one request keep their order.
      `INSERT INTO ai_messages (conversation_id, role, content, source, tools_used, model, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp()) RETURNING *`,
      [
        message.conversationId,
        message.role,
        message.content,
        message.source,
        (message.toolsUsed ?? []).join(','),
        message.model ?? null,
      ],
    );
    return toMessage(rows[0]);
  }
}
