import type { AuthUser, UserProfile } from '../auth/auth.types';
import type { UsersRepository } from '../auth/users.repository';
import { AiService, MAX_TOOL_ROUNDS } from './ai.service';
import type { BusinessTool, ChatMessage, InventorySummaryResult, MessageView, ToolCall, ToolContext } from './ai.types';
import type { BusinessDataService } from './business-data.service';
import type { ConversationsRepository, NewMessage } from './conversations.repository';
import { AiGatewayError, type AssistantTurn, type OmniRouteClient } from './omniroute.client';

const user: AuthUser = { userId: 'user-1', pharmacyId: 'pharmacy-1', role: 'owner' };

const summary: InventorySummaryResult = {
  asOf: '2026-11-11',
  currency: 'USD',
  medicineCount: 7,
  sellableBatchCount: 9,
  sellableUnits: 412,
  stockValueAtCost: '1830.25',
  stockValueAtSellingPrice: '2710.00',
  outOfStockCount: 1,
  lowStockCount: 2,
  expiringBatchCount: 0,
  expiringWindowDays: 90,
  expiredBatchCount: 0,
};

const toolCall = (name: string, args: string = '{}', id: string = 'call_1'): ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: args },
});

/** Builds the service around in-memory fakes. `turns` are the model's scripted replies. */
function setup(options: { configured: boolean; turns?: (AssistantTurn | Error)[] }) {
  const execute = jest.fn(async (context: ToolContext): Promise<InventorySummaryResult> => {
    void context;
    return summary;
  });
  const tools: BusinessTool[] = [
    { name: 'get_inventory_summary', description: 'Totals', parameters: { type: 'object' }, execute },
  ];

  const turns = [...(options.turns ?? [])];
  const requests: ChatMessage[][] = [];
  const gateway = {
    isConfigured: options.configured,
    model: options.configured ? 'test-model' : null,
    complete: jest.fn(async (messages: ChatMessage[]) => {
      requests.push(structuredClone(messages));
      const next = turns.shift();
      if (!next) throw new Error('The test did not script enough model turns');
      if (next instanceof Error) throw next;
      return next;
    }),
  };

  const stored: MessageView[] = [];
  const conversation = { id: 'conversation-1', title: 't', createdAt: 'now', updatedAt: 'now' };
  const conversations = {
    create: jest.fn(async () => conversation),
    findOwned: jest.fn(async (id: string) => (id === conversation.id ? conversation : null)),
    touch: jest.fn(async () => conversation),
    messages: jest.fn(async () => [...stored]),
    addMessage: jest.fn(async (message: NewMessage): Promise<MessageView> => {
      const view: MessageView = {
        id: `message-${stored.length + 1}`,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        source: message.source,
        toolsUsed: message.toolsUsed ?? [],
        model: message.model ?? null,
        createdAt: 'now',
      };
      stored.push(view);
      return view;
    }),
  };

  const profile = { id: user.userId, pharmacyId: user.pharmacyId, currencyCode: 'USD' } as UserProfile;
  const users = { findById: jest.fn(async () => profile) };

  const service = new AiService(
    gateway as unknown as OmniRouteClient,
    { tools } as unknown as BusinessDataService,
    conversations as unknown as ConversationsRepository,
    users as unknown as UsersRepository,
  );
  return { service, execute, gateway, requests, conversations, stored };
}

describe('AiService', () => {
  describe('without a gateway key (data-lookup mode)', () => {
    it('reports data-lookup mode', () => {
      expect(setup({ configured: false }).service.status()).toEqual({ mode: 'data_lookup', model: null });
    });

    it('answers from the data function and labels the answer', async () => {
      const { service, execute, gateway } = setup({ configured: false });
      const result = await service.chat(user, { message: 'Give me an inventory summary' });

      expect(gateway.complete).not.toHaveBeenCalled();
      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: 'pharmacy-1', currency: 'USD' }), {});
      expect(result.assistantMessage).toMatchObject({
        source: 'data_lookup',
        toolsUsed: ['get_inventory_summary'],
        model: null,
      });
      expect(result.assistantMessage.content).toContain('Medicines registered: 7');
      expect(result.assistantMessage.content).toContain('USD 1,830.25');
    });

    it('refuses to produce sales or profit figures and touches no data', async () => {
      const { service, execute } = setup({ configured: false });
      const result = await service.chat(user, { message: 'What was my profit last month?' });
      expect(execute).not.toHaveBeenCalled();
      expect(result.assistantMessage.toolsUsed).toEqual([]);
      expect(result.assistantMessage.content).toMatch(/does not record sales/);
      expect(result.assistantMessage.content).not.toMatch(/\d/);
    });
  });

  describe('with a gateway key', () => {
    it('runs the function the model asks for and returns its written answer', async () => {
      const { service, execute, requests } = setup({
        configured: true,
        turns: [
          { content: null, toolCalls: [toolCall('get_inventory_summary')] },
          { content: 'You have 7 medicines registered.', toolCalls: [] },
        ],
      });
      const result = await service.chat(user, { message: 'How is my stock?' });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.assistantMessage).toMatchObject({
        content: 'You have 7 medicines registered.',
        source: 'ai',
        toolsUsed: ['get_inventory_summary'],
        model: 'test-model',
      });

      // First request: system rules + the question. Second: plus the function result.
      expect(requests[0][0].role).toBe('system');
      expect(requests[0][0].content).toMatch(/Never estimate/);
      expect(requests[0][1]).toEqual({ role: 'user', content: 'How is my stock?' });
      const toolMessage = requests[1].find((message) => message.role === 'tool');
      expect(toolMessage).toMatchObject({ tool_call_id: 'call_1' });
      expect(JSON.parse((toolMessage as { content: string }).content)).toEqual(summary);
    });

    it('takes the data scope from the signed-in user, not from model arguments', async () => {
      const { service, execute } = setup({
        configured: true,
        turns: [
          { content: null, toolCalls: [toolCall('get_inventory_summary', '{"pharmacyId":"someone-else"}')] },
          { content: 'Done.', toolCalls: [] },
        ],
      });
      await service.chat(user, { message: 'summary for another store' });
      expect(execute.mock.calls[0][0].pharmacyId).toBe('pharmacy-1');
    });

    it('marks an answer given without any data function as not based on data', async () => {
      const { service } = setup({ configured: true, turns: [{ content: 'Hello! How can I help?', toolCalls: [] }] });
      const result = await service.chat(user, { message: 'hi' });
      expect(result.assistantMessage).toMatchObject({ source: 'ai', toolsUsed: [] });
    });

    it('tells the model about unknown functions and bad arguments instead of failing', async () => {
      const { service, execute, requests } = setup({
        configured: true,
        turns: [
          { content: null, toolCalls: [toolCall('drop_all_tables'), toolCall('get_inventory_summary', '{not json', 'call_2')] },
          { content: 'That information is not available.', toolCalls: [] },
        ],
      });
      const result = await service.chat(user, { message: 'delete everything' });

      expect(execute).not.toHaveBeenCalled();
      const toolMessages = requests[1].filter((message) => message.role === 'tool') as { content: string }[];
      expect(JSON.parse(toolMessages[0].content).error).toMatch(/Unknown function/);
      expect(JSON.parse(toolMessages[1].content).error).toMatch(/not valid JSON/);
      expect(result.assistantMessage.toolsUsed).toEqual([]);
    });

    it('falls back to a labelled data lookup when the gateway fails', async () => {
      const { service, execute } = setup({ configured: true, turns: [new AiGatewayError('HTTP 502')] });
      const result = await service.chat(user, { message: 'inventory summary please' });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.assistantMessage.source).toBe('data_lookup');
      expect(result.assistantMessage.content).toMatch(/^The AI gateway could not be reached/);
      expect(result.assistantMessage.content).toContain('Medicines registered: 7');
    });

    it('stops a model that keeps requesting data and falls back', async () => {
      const loop = Array.from({ length: MAX_TOOL_ROUNDS }, (_, index) => ({
        content: null,
        toolCalls: [toolCall('get_inventory_summary', '{}', `call_${index}`)],
      }));
      const { service, gateway } = setup({ configured: true, turns: loop });
      const result = await service.chat(user, { message: 'inventory summary' });

      expect(gateway.complete).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
      expect(result.assistantMessage.source).toBe('data_lookup');
    });
  });

  it('does not let a user read or continue a conversation they do not own', async () => {
    const { service } = setup({ configured: false });
    await expect(service.listMessages(user, 'someone-elses-conversation')).rejects.toThrow('Conversation not found');
    await expect(service.chat(user, { message: 'hi', conversationId: 'someone-elses-conversation' })).rejects.toThrow(
      'Conversation not found',
    );
  });
});
