import supabase from './db-client.js';
import { handleCors, HttpError, requireUuid, sendError, unwrap } from './_lib/http.js';
import { loadInventory, todayIso } from './_lib/inventory.js';
import { formatResult, HELP_TEXT, NOT_RECORDED_TEXT, routeQuestion, runTool } from './_lib/lookup.js';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONVERSATIONS_PER_CLIENT = 50;

const toConversation = (row) => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toMessage = (row) => ({
  id: row.id,
  conversationId: row.conversation_id,
  role: row.role,
  content: row.content,
  source: row.source,
  toolsUsed: row.tools_used ? row.tools_used.split(',') : [],
  model: row.model,
  createdAt: row.created_at,
});

/** Conversations are scoped to the anonymous browser id that created them. */
async function requireConversation(conversationId, clientId) {
  const rows = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('client_id', clientId)
    .then(unwrap);
  if (rows.length === 0) throw new HttpError(404, 'This conversation no longer exists.');
  return rows[0];
}

/**
 * Hosted-preview assistant. Always runs in data-lookup mode: no AI gateway
 * key exists in the preview environment, and none is ever sent to a browser.
 * The OmniRoute integration lives in backend/src/ai.
 */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    if (req.method === 'GET') {
      const { resource } = req.query;
      if (resource === 'status') {
        return res.status(200).json({ mode: 'data_lookup', model: null });
      }
      const clientId = requireUuid(req.query.clientId, 'Client id');
      if (resource === 'conversations') {
        const rows = await supabase
          .from('ai_conversations')
          .select('*')
          .eq('client_id', clientId)
          .order('updated_at', { ascending: false })
          .limit(MAX_CONVERSATIONS_PER_CLIENT)
          .then(unwrap);
        return res.status(200).json(rows.map(toConversation));
      }
      if (resource === 'messages') {
        const conversationId = requireUuid(req.query.conversationId, 'Conversation id');
        await requireConversation(conversationId, clientId);
        const rows = await supabase
          .from('ai_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(500)
          .then(unwrap);
        return res.status(200).json(rows.map(toMessage));
      }
      throw new HttpError(400, 'Unknown resource.');
    }

    if (req.method === 'POST') {
      const body = req.body ?? {};
      const clientId = requireUuid(body.clientId, 'Client id');
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (message === '') throw new HttpError(400, 'Type a question first.');
      if (message.length > MAX_MESSAGE_LENGTH) {
        throw new HttpError(400, `Keep questions under ${MAX_MESSAGE_LENGTH} characters.`);
      }
      const currency = typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency) ? body.currency : 'INR';

      let conversation;
      if (body.conversationId) {
        conversation = await requireConversation(requireUuid(body.conversationId, 'Conversation id'), clientId);
      } else {
        conversation = await supabase
          .from('ai_conversations')
          .insert({ client_id: clientId, title: message.slice(0, 60) })
          .select('*')
          .single()
          .then(unwrap);
      }

      // Answer from the database through the fixed data functions only.
      const route = routeQuestion(message);
      let content = HELP_TEXT;
      let toolsUsed = '';
      if (route.kind === 'not_recorded') {
        content = NOT_RECORDED_TEXT;
      } else if (route.kind === 'tool') {
        const result = runTool(route.tool, route.args, await loadInventory(), todayIso(), currency);
        content = formatResult(route.tool, result);
        toolsUsed = route.tool;
      }

      const now = Date.now();
      const inserted = await supabase
        .from('ai_messages')
        .insert([
          {
            conversation_id: conversation.id,
            role: 'user',
            content: message,
            source: 'user',
            tools_used: '',
            created_at: new Date(now).toISOString(),
          },
          {
            conversation_id: conversation.id,
            role: 'assistant',
            content,
            source: 'data_lookup',
            tools_used: toolsUsed,
            created_at: new Date(now + 1).toISOString(),
          },
        ])
        .select('*')
        .then(unwrap);

      const updated = await supabase
        .from('ai_conversations')
        .update({ updated_at: new Date(now + 1).toISOString() })
        .eq('id', conversation.id)
        .select('*')
        .single()
        .then(unwrap);

      const userRow = inserted.find((row) => row.role === 'user');
      const assistantRow = inserted.find((row) => row.role === 'assistant');
      return res.status(201).json({
        conversation: toConversation(updated),
        userMessage: toMessage(userRow),
        assistantMessage: toMessage(assistantRow),
      });
    }

    if (req.method === 'DELETE') {
      const body = req.body ?? {};
      const clientId = requireUuid(body.clientId, 'Client id');
      const conversationId = requireUuid(body.conversationId, 'Conversation id');
      await requireConversation(conversationId, clientId);
      await supabase.from('ai_messages').delete().eq('conversation_id', conversationId).then(unwrap);
      await supabase.from('ai_conversations').delete().eq('id', conversationId).then(unwrap);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(res, error);
  }
}
