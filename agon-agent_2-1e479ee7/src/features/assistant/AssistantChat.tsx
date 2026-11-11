import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MessageSquareText, Plus, Send, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { describeError } from '../../data/errors';
import { formatDateTime } from '../../domain/dates';
import { cn } from '../../lib/cn';
import {
  MAX_MESSAGE_LENGTH,
  TOOL_LABELS,
  type AssistantClient,
  type AssistantConversation,
  type AssistantMessage,
  type AssistantStatus,
} from './types';

const SUGGESTIONS = [
  'Give me an inventory summary',
  'Which medicines need reordering?',
  'What expires in the next 60 days?',
  'Where is paracetamol kept?',
  'What was my profit this month?',
];

let pendingCounter = 0;
/** Temporary id for a message shown before the server confirms it. */
function nextPendingId(): string {
  pendingCounter += 1;
  return `pending-${pendingCounter}`;
}

function MessageBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === 'user';
  return (
    <li className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('min-w-0 max-w-[min(42rem,92%)]', isUser && 'text-right')}>
        <div
          className={cn(
            'inline-block whitespace-pre-wrap break-words rounded-lg px-4 py-2.5 text-left text-sm leading-relaxed',
            isUser ? 'bg-primary text-primary-ink' : 'border border-line bg-surface text-ink',
          )}
        >
          {message.content}
        </div>
        <div className={cn('mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted', isUser && 'justify-end')}>
          {message.source === 'data_lookup' ? <Badge>Data lookup · no AI model</Badge> : null}
          {message.source === 'ai' ? <Badge tone="info">AI{message.model ? ` · ${message.model}` : ''}</Badge> : null}
          {message.source === 'ai' && message.toolsUsed.length === 0 ? (
            <Badge tone="warning">No data lookup used — not verified</Badge>
          ) : null}
          {message.toolsUsed.length > 0 ? (
            <span>Based on: {message.toolsUsed.map((tool) => TOOL_LABELS[tool] ?? tool).join(', ')}</span>
          ) : null}
          <span>{formatDateTime(message.createdAt)}</span>
        </div>
      </div>
    </li>
  );
}

/** Chat interface with conversation history. Works with any AssistantClient. */
export function AssistantChat({ client }: { client: AssistantClient }) {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([client.status(), client.listConversations()])
      .then(([nextStatus, nextConversations]) => {
        if (cancelled) return;
        setStatus(nextStatus);
        setConversations(nextConversations);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(describeError(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, sending]);

  const openConversation = useCallback(
    async (conversationId: string | null) => {
      setActiveId(conversationId);
      setError(null);
      setMessages([]);
      if (!conversationId) return;
      setLoadingMessages(true);
      try {
        setMessages(await client.listMessages(conversationId));
      } catch (loadError) {
        setError(describeError(loadError));
      } finally {
        setLoadingMessages(false);
      }
    },
    [client],
  );

  const send = async (text: string) => {
    const message = text.trim();
    if (message === '' || sending) return;
    if (message.length > MAX_MESSAGE_LENGTH) {
      setError(`Keep questions under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`);
      return;
    }
    setError(null);
    setSending(true);
    const optimistic: AssistantMessage = {
      id: nextPendingId(),
      conversationId: activeId ?? 'pending',
      role: 'user',
      content: message,
      source: 'user',
      toolsUsed: [],
      model: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft('');
    try {
      const result = await client.send(message, activeId);
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
        result.userMessage,
        result.assistantMessage,
      ]);
      setActiveId(result.conversation.id);
      setConversations((current) => [
        result.conversation,
        ...current.filter((conversation) => conversation.id !== result.conversation.id),
      ]);
    } catch (sendError) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setDraft(message);
      setError(describeError(sendError));
    } finally {
      setSending(false);
    }
  };

  const removeConversation = async (conversationId: string) => {
    setError(null);
    try {
      await client.deleteConversation(conversationId);
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (activeId === conversationId) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (deleteError) {
      setError(describeError(deleteError));
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  };

  return (
    <div className="space-y-4">
      {status?.mode === 'data_lookup' ? (
        <Notice tone="info" title="Data-lookup mode: no AI model is connected">
          No OmniRoute gateway key is configured on this server, so replies are produced by direct, read-only
          database lookups for a fixed set of questions. They are not written by a language model.
        </Notice>
      ) : null}
      {status?.mode === 'ai' ? (
        <Notice tone="info" title={`AI replies via OmniRoute${status.model ? ` · ${status.model}` : ''}`}>
          The model can only read data through fixed backend functions and is instructed never to invent figures.
          That reduces mistakes but cannot rule them out — check important numbers against the inventory screen.
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Conversation history: a list on wide screens, a compact picker on narrow ones. */}
        <div className="flex items-center gap-2 lg:hidden">
          <Select
            aria-label="Conversation"
            value={activeId ?? ''}
            onChange={(event) => void openConversation(event.target.value || null)}
            className="flex-1"
          >
            <option value="">New conversation</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title}
              </option>
            ))}
          </Select>
          {activeId ? (
            <Button variant="secondary" aria-label="Delete this conversation" className="px-3" onClick={() => void removeConversation(activeId)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        <aside className="hidden h-[calc(100dvh-19rem)] min-h-[440px] flex-col rounded-lg border border-line bg-surface lg:flex">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ink">History</h2>
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => void openConversation(null)}>
              New
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loadingHistory ? (
              <p className="px-2 py-3 text-sm text-muted" role="status">Loading conversations…</p>
            ) : conversations.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">No conversations yet. Ask a question to start one.</p>
            ) : (
              <ul className="space-y-0.5">
                {conversations.map((conversation) => (
                  <li key={conversation.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void openConversation(conversation.id)}
                      aria-current={conversation.id === activeId ? 'true' : undefined}
                      className={cn(
                        'min-w-0 flex-1 rounded-md px-3 py-2 text-left text-sm',
                        conversation.id === activeId
                          ? 'bg-accent-soft font-medium text-accent-ink'
                          : 'text-ink-soft hover:bg-surface-muted',
                      )}
                    >
                      <span className="block truncate">{conversation.title}</span>
                      <span className="block text-xs font-normal text-muted">{formatDateTime(conversation.updatedAt)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeConversation(conversation.id)}
                      aria-label={`Delete conversation: ${conversation.title}`}
                      className="rounded p-1.5 text-muted opacity-0 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="flex h-[calc(100dvh-19rem)] min-h-[440px] min-w-0 flex-col rounded-lg border border-line bg-surface-muted">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
            {loadingMessages ? (
              <p className="text-sm text-muted" role="status">Loading messages…</p>
            ) : messages.length === 0 ? (
              <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
                  <MessageSquareText className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-3 text-[15px] font-semibold text-ink">Ask about your inventory</p>
                <p className="mt-1 text-sm text-muted">
                  Sales, purchases and profit are not recorded yet, so the assistant will say so rather than guess.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={sending}
                      onClick={() => void send(suggestion)}
                      className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[13px] text-ink-soft hover:border-accent hover:text-accent-ink disabled:opacity-55"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="space-y-4">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {sending ? (
                  <li className="text-sm text-muted" role="status">Looking that up…</li>
                ) : null}
              </ul>
            )}
            <div ref={threadEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-line bg-surface p-3 sm:p-4">
            {error ? (
              <Notice tone="danger" className="mb-3">
                {error}
              </Notice>
            ) : null}
            <div className="flex items-end gap-2">
              <label htmlFor="assistant-input" className="sr-only">
                Your question
              </label>
              <textarea
                id="assistant-input"
                rows={2}
                maxLength={MAX_MESSAGE_LENGTH}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about stock, reorder needs, expiry or a medicine’s location…"
                className="block min-h-[2.75rem] w-full min-w-0 flex-1 resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
              <Button type="submit" loading={sending} disabled={draft.trim() === ''} icon={<Send className="h-4 w-4" aria-hidden="true" />}>
                Send
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">Enter to send · Shift + Enter for a new line · Not medical advice.</p>
          </form>
        </section>
      </div>
    </div>
  );
}
