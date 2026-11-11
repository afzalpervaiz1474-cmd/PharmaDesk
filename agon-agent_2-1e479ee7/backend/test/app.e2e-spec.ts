import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runMigrations } from '../src/database/migration-runner';
import {
  api,
  BATCH_ID,
  batchChange,
  createTestApp,
  EXPIRED_BATCH_ID,
  MEDICINE_ID,
  medicineChange,
  registerAccount,
  type Account,
  type TestApp,
} from './test-app';

/**
 * End-to-end tests: real HTTP requests against the real application, with
 * the real migrations applied to an in-memory PostgreSQL (PGlite).
 */
describe('PharmaDesk backend (e2e)', () => {
  let testApp: TestApp;
  let alpha: Account;
  let beta: Account;

  const push = (account: Account, changes: unknown[]) =>
    testApp.http().post(api('/sync/push')).set(account.auth).send({ deviceId: 'device-1', changes });

  beforeAll(async () => {
    testApp = await createTestApp();
    alpha = await registerAccount(testApp, 'Alpha', 'INR');
    beta = await registerAccount(testApp, 'Beta', 'USD');
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('database and health', () => {
    it('applies every migration once, in order', async () => {
      expect(testApp.appliedMigrations).toEqual([
        '0001_create_core.sql',
        '0002_create_inventory.sql',
        '0003_create_ai_conversations.sql',
      ]);
      expect(await runMigrations(testApp.database)).toEqual([]);
    });

    it('reports health without authentication', async () => {
      const response = await testApp.http().get(api('/health')).expect(200);
      expect(response.body).toMatchObject({ status: 'ok', database: 'up', aiGateway: 'not_configured', version: '0.1.0' });
    });

    it('answers unknown routes with the standard error shape', async () => {
      const response = await testApp.http().get(api('/nope')).expect(404);
      expect(response.body).toMatchObject({ statusCode: 404, error: 'NOT_FOUND' });
    });
  });

  describe('authentication', () => {
    it('validates registration input', async () => {
      const response = await testApp
        .http()
        .post(api('/auth/register'))
        .send({ pharmacyName: 'X', displayName: 'Someone', email: 'not-an-email', password: 'short' })
        .expect(400);
      expect(response.body.details.join(' ')).toMatch(/email/);
      expect(response.body.details.join(' ')).toMatch(/password must be at least 10 characters/);
    });

    it('rejects properties that are not part of the contract', async () => {
      await testApp
        .http()
        .post(api('/auth/login'))
        .send({ email: 'alpha@example.test', password: 'a-long-test-password', role: 'admin' })
        .expect(400);
    });

    it('refuses a second account with the same email, ignoring case', async () => {
      const response = await testApp
        .http()
        .post(api('/auth/register'))
        .send({ pharmacyName: 'Copy', displayName: 'Copy', email: 'ALPHA@example.test', password: 'a-long-test-password' })
        .expect(409);
      expect(response.body.message).toMatch(/already exists/);
    });

    it('stores a password hash, never the password', async () => {
      const { rows } = await testApp.database.query<{ password_hash: string }>('SELECT password_hash FROM users');
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.password_hash.startsWith('scrypt$')).toBe(true);
        expect(row.password_hash).not.toContain('a-long-test-password');
      }
    });

    it('signs in with the right password and gives the same error for a wrong password or unknown email', async () => {
      const ok = await testApp
        .http()
        .post(api('/auth/login'))
        .send({ email: 'alpha@example.test', password: 'a-long-test-password' })
        .expect(200);
      expect(ok.body.user).toMatchObject({ email: 'alpha@example.test', role: 'owner', pharmacyName: 'Alpha Pharmacy' });
      expect(ok.body.user).not.toHaveProperty('passwordHash');

      const wrong = await testApp
        .http()
        .post(api('/auth/login'))
        .send({ email: 'alpha@example.test', password: 'wrong-password-123' })
        .expect(401);
      const unknown = await testApp
        .http()
        .post(api('/auth/login'))
        .send({ email: 'nobody@example.test', password: 'wrong-password-123' })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('protects routes with the bearer token', async () => {
      const me = await testApp.http().get(api('/auth/me')).set(alpha.auth).expect(200);
      expect(me.body).toMatchObject({ email: 'alpha@example.test', currencyCode: 'INR' });

      await testApp.http().get(api('/auth/me')).expect(401);
      await testApp.http().get(api('/auth/me')).set({ Authorization: 'Bearer not.a.token' }).expect(401);
      await testApp.http().get(api('/medicines')).expect(401);
      await testApp.http().get(api('/sync/pull')).expect(401);
      await testApp.http().post(api('/ai/chat')).send({ message: 'hi' }).expect(401);
    });

    it('can be closed to new registrations', async () => {
      const closed = await createTestApp({ allowRegistration: false });
      try {
        await closed
          .http()
          .post(api('/auth/register'))
          .send({ pharmacyName: 'New', displayName: 'New', email: 'new@example.test', password: 'a-long-test-password' })
          .expect(403);
      } finally {
        await closed.close();
      }
    });
  });

  describe('sync', () => {
    it('stores pushed records, applying medicines before the batches that need them', async () => {
      const response = await push(alpha, [batchChange(), medicineChange()]).expect(200);
      expect(response.body.results).toEqual([
        { entity: 'medicine_batch', id: BATCH_ID, status: 'applied' },
        { entity: 'medicine', id: MEDICINE_ID, status: 'applied' },
      ]);

      const list = await testApp.http().get(api('/medicines')).set(alpha.auth).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ id: MEDICINE_ID, name: 'Paracetamol', reorderLevel: 200, rack: 'A' });
      expect(list.body[0].batches).toEqual([
        expect.objectContaining({ id: BATCH_ID, batchNumber: 'PCM-1', expiryDate: '2099-12-31', quantity: 120, receivedAt: '2026-10-20' }),
      ]);
    });

    it('is idempotent and ignores older versions (last write wins)', async () => {
      const same = await push(alpha, [medicineChange()]).expect(200);
      expect(same.body.results[0].status).toBe('stale');

      const older = await push(alpha, [medicineChange({ updatedAt: '2026-10-01T00:00:00.000Z' }, { name: 'Old name' })]);
      expect(older.body.results[0].status).toBe('stale');

      const newer = await push(alpha, [medicineChange({ updatedAt: '2026-11-02T00:00:00.000Z' }, { rack: 'B' })]);
      expect(newer.body.results[0].status).toBe('applied');

      const list = await testApp.http().get(api('/medicines')).set(alpha.auth).expect(200);
      expect(list.body[0]).toMatchObject({ name: 'Paracetamol', rack: 'B' });
    });

    it('rejects invalid records individually and still stores the valid ones', async () => {
      const otherMedicine = '44444444-4444-4444-8444-444444444444';
      const response = await push(alpha, [
        medicineChange({ id: '55555555-5555-4555-8555-555555555555' }, { name: '', reorderLevel: -5 }),
        medicineChange({ id: '66666666-6666-4666-8666-666666666666' }, { surprise: true }),
        batchChange({ id: '77777777-7777-4777-8777-777777777777' }, { medicineId: '88888888-8888-4888-8888-888888888888' }),
        batchChange({ id: '99999999-9999-4999-8999-999999999999' }, { expiryDate: '31/12/2099' }),
        medicineChange({ id: otherMedicine }, { name: 'Cetirizine', reorderLevel: 10, rack: null, shelf: null }),
        batchChange({ id: EXPIRED_BATCH_ID }, { medicineId: otherMedicine, batchNumber: 'CTZ-OLD', expiryDate: '2000-01-01', quantity: 30 }),
      ]).expect(200);

      const statuses = response.body.results.map((result: { status: string }) => result.status);
      expect(statuses).toEqual(['rejected', 'rejected', 'rejected', 'rejected', 'applied', 'applied']);
      expect(response.body.results[0].reason).toMatch(/name|reorderLevel/);
      expect(response.body.results[1].reason).toMatch(/surprise/);
      expect(response.body.results[2].reason).toMatch(/has not been synchronised/);
      expect(response.body.results[3].reason).toMatch(/expiryDate/);

      const list = await testApp.http().get(api('/medicines')).set(alpha.auth).expect(200);
      expect(list.body.map((medicine: { name: string }) => medicine.name)).toEqual(['Cetirizine', 'Paracetamol']);
    });

    it('rejects a malformed request as a whole', async () => {
      await push(alpha, [{ entity: 'customer', id: MEDICINE_ID, updatedAt: 'yesterday', data: {} }]).expect(400);
      await testApp.http().post(api('/sync/push')).set(alpha.auth).send({ changes: [] }).expect(400);
    });

    it('keeps stores apart: no reading and no overwriting across tenants', async () => {
      const betaList = await testApp.http().get(api('/medicines')).set(beta.auth).expect(200);
      expect(betaList.body).toEqual([]);

      const hijack = await push(beta, [medicineChange({ updatedAt: '2027-01-01T00:00:00.000Z' }, { name: 'Hijacked' })]);
      expect(hijack.body.results[0]).toMatchObject({ status: 'rejected' });
      expect(hijack.body.results[0].reason).toMatch(/outside your store/);

      const betaBatch = await push(beta, [batchChange({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })]);
      expect(betaBatch.body.results[0].status).toBe('rejected');

      const alphaList = await testApp.http().get(api('/medicines')).set(alpha.auth).expect(200);
      expect(alphaList.body.find((medicine: { id: string }) => medicine.id === MEDICINE_ID).name).toBe('Paracetamol');
      expect((await testApp.http().get(api('/sync/pull')).set(beta.auth).expect(200)).body.changes).toEqual([]);
    });

    it('serves changes in order through a cursor', async () => {
      const first = await testApp.http().get(api('/sync/pull?cursor=0&limit=2')).set(alpha.auth).expect(200);
      expect(first.body.changes).toHaveLength(2);
      expect(first.body.hasMore).toBe(true);

      const rest = await testApp.http().get(api(`/sync/pull?cursor=${first.body.nextCursor}`)).set(alpha.auth).expect(200);
      expect(rest.body.hasMore).toBe(false);

      const all = [...first.body.changes, ...rest.body.changes];
      const sequence = all.map((change: { serverSeq: number }) => change.serverSeq);
      expect(sequence).toEqual([...sequence].sort((a, b) => a - b));
      expect(all.map((change: { id: string }) => change.id).sort()).toEqual(
        [MEDICINE_ID, BATCH_ID, EXPIRED_BATCH_ID, '44444444-4444-4444-8444-444444444444'].sort(),
      );
      const medicine = all.find((change: { id: string }) => change.id === MEDICINE_ID);
      expect(medicine).toMatchObject({ entity: 'medicine', deletedAt: null, data: { name: 'Paracetamol', rack: 'B' } });

      const caughtUp = await testApp.http().get(api(`/sync/pull?cursor=${rest.body.nextCursor}`)).set(alpha.auth).expect(200);
      expect(caughtUp.body).toEqual({ changes: [], nextCursor: rest.body.nextCursor, hasMore: false });

      await testApp.http().get(api('/sync/pull?cursor=-1')).set(alpha.auth).expect(400);
      await testApp.http().get(api('/sync/pull?limit=5000')).set(alpha.auth).expect(400);
    });
  });

  describe('assistant in data-lookup mode (no gateway key)', () => {
    let conversationId: string;

    it('reports its mode', async () => {
      const response = await testApp.http().get(api('/ai/status')).set(alpha.auth).expect(200);
      expect(response.body).toEqual({ mode: 'data_lookup', model: null });
    });

    it('answers an inventory question with figures read from the database', async () => {
      const response = await testApp
        .http()
        .post(api('/ai/chat'))
        .set(alpha.auth)
        .send({ message: '  Give me an inventory summary  ' })
        .expect(200);
      conversationId = response.body.conversation.id;

      expect(response.body.userMessage).toMatchObject({ role: 'user', content: 'Give me an inventory summary' });
      expect(response.body.assistantMessage).toMatchObject({
        role: 'assistant',
        source: 'data_lookup',
        toolsUsed: ['get_inventory_summary'],
        model: null,
      });
      // Alpha holds: Paracetamol 120 x 8.50 (sellable) and Cetirizine 30 units in an expired batch.
      const text: string = response.body.assistantMessage.content;
      expect(text).toContain('Medicines registered: 2');
      expect(text).toContain('Sellable stock: 120 units in 1 batches');
      expect(text).toContain('INR 1,020.00 (INR 1,440.00 at selling price)');
      expect(text).toContain('Needs reorder: 1 out of stock, 1 low');
      expect(text).toContain('Expired stock still on shelves: 1 batches');
    });

    it('answers reorder, expiry and location questions from the same data', async () => {
      const ask = async (message: string) =>
        (await testApp.http().post(api('/ai/chat')).set(alpha.auth).send({ message, conversationId }).expect(200)).body
          .assistantMessage;

      const reorder = await ask('Which medicines need reordering?');
      expect(reorder.toolsUsed).toEqual(['list_low_stock_medicines']);
      expect(reorder.content).toContain('Cetirizine 500 mg: 0 strip sellable (reorder level 10), OUT OF STOCK');
      expect(reorder.content).toContain('Paracetamol 500 mg: 120 strip sellable (reorder level 200) — Rack B · Shelf 2');

      const expired = await ask('Which batches have expired?');
      expect(expired.toolsUsed).toEqual(['list_expired_batches']);
      expect(expired.content).toContain('batch CTZ-OLD: expired 2000-01-01');

      const expiring = await ask('What expires in the next 30 days?');
      expect(expiring.content).toMatch(/no stock-holding batch expires within 30 days/);

      const where = await ask('Where is paracetamol kept?');
      expect(where.toolsUsed).toEqual(['find_medicine']);
      expect(where.content).toContain('Rack B · Shelf 2');
      expect(where.content).toContain('nearest expiry 2099-12-31, sells at INR 12.00');

      const wildcard = await ask('Where is % kept?');
      expect(wildcard.content).toMatch(/could not match|No registered medicine/);
    });

    it('does not invent sales or profit figures', async () => {
      const response = await testApp
        .http()
        .post(api('/ai/chat'))
        .set(alpha.auth)
        .send({ message: 'What was my profit this month?', conversationId })
        .expect(200);
      expect(response.body.assistantMessage.toolsUsed).toEqual([]);
      expect(response.body.assistantMessage.content).toMatch(/does not record sales, purchases, expenses or profit/);
    });

    it('only uses the caller’s own data', async () => {
      const response = await testApp.http().post(api('/ai/chat')).set(beta.auth).send({ message: 'inventory summary' }).expect(200);
      expect(response.body.assistantMessage.content).toContain('Medicines registered: 0');
      expect(response.body.assistantMessage.content).toContain('USD 0.00');
    });

    it('keeps conversation history, private to its owner', async () => {
      const list = await testApp.http().get(api('/ai/conversations')).set(alpha.auth).expect(200);
      expect(list.body).toEqual([expect.objectContaining({ id: conversationId, title: 'Give me an inventory summary' })]);

      const messages = await testApp.http().get(api(`/ai/conversations/${conversationId}/messages`)).set(alpha.auth).expect(200);
      expect(messages.body).toHaveLength(14);
      expect(messages.body.map((message: { role: string }) => message.role).slice(0, 4)).toEqual([
        'user', 'assistant', 'user', 'assistant',
      ]);

      await testApp.http().get(api(`/ai/conversations/${conversationId}/messages`)).set(beta.auth).expect(404);
      await testApp.http().post(api('/ai/chat')).set(beta.auth).send({ message: 'hi', conversationId }).expect(404);
      await testApp.http().delete(api(`/ai/conversations/${conversationId}`)).set(beta.auth).expect(404);
      await testApp.http().get(api('/ai/conversations/not-a-uuid/messages')).set(alpha.auth).expect(400);
    });

    it('validates chat input and deletes conversations', async () => {
      await testApp.http().post(api('/ai/chat')).set(alpha.auth).send({ message: '   ' }).expect(400);
      await testApp.http().post(api('/ai/chat')).set(alpha.auth).send({ message: 'x'.repeat(2001) }).expect(400);

      await testApp.http().delete(api(`/ai/conversations/${conversationId}`)).set(alpha.auth).expect(200);
      expect((await testApp.http().get(api('/ai/conversations')).set(alpha.auth)).body).toEqual([]);
      const { rows } = await testApp.database.query('SELECT 1 FROM ai_messages WHERE conversation_id = $1', [conversationId]);
      expect(rows).toHaveLength(0);
    });
  });

  describe('sync deletions', () => {
    it('propagates a deletion as a tombstone', async () => {
      const deletedAt = '2026-11-03T00:00:00.000Z';
      const response = await push(alpha, [batchChange({ updatedAt: deletedAt, deletedAt })]).expect(200);
      expect(response.body.results[0].status).toBe('applied');

      const list = await testApp.http().get(api('/medicines')).set(alpha.auth).expect(200);
      expect(list.body.find((medicine: { id: string }) => medicine.id === MEDICINE_ID).batches).toEqual([]);

      const pull = await testApp.http().get(api('/sync/pull?cursor=0')).set(alpha.auth).expect(200);
      const last = pull.body.changes[pull.body.changes.length - 1];
      expect(last).toMatchObject({ id: BATCH_ID, deletedAt });
    });
  });
});

/**
 * The OmniRoute integration, exercised over real HTTP against a local stub
 * that speaks the OpenAI-compatible chat API. This verifies our side of the
 * wire protocol. It is not a test against a real OmniRoute gateway.
 */
describe('assistant with an OpenAI-compatible gateway stub (e2e)', () => {
  const STUB_KEY = 'stub-key-for-tests-only';
  let stub: Server;
  let testApp: TestApp;
  let account: Account;
  let received: { authorization: string | undefined; body: { model: string; messages: { role: string; content: string }[]; tools: unknown[] } }[];
  let failNextRequests = false;

  const readBody = (request: IncomingMessage): Promise<string> =>
    new Promise((resolve) => {
      let data = '';
      request.on('data', (chunk) => (data += chunk));
      request.on('end', () => resolve(data));
    });

  beforeAll(async () => {
    received = [];
    stub = createServer(async (request, response) => {
      const body = JSON.parse(await readBody(request));
      received.push({ authorization: request.headers.authorization, body });
      response.setHeader('Content-Type', 'application/json');
      if (request.url !== '/v1/chat/completions' || failNextRequests) {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: 'unavailable' }));
        return;
      }
      const toolMessage = body.messages.find((message: { role: string }) => message.role === 'tool');
      const message = toolMessage
        ? // Second turn: "write" an answer from the function result it was given.
          { role: 'assistant', content: `You have ${JSON.parse(toolMessage.content).medicineCount} medicine(s) registered.` }
        : // First turn: ask for a data function.
          {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_inventory_summary', arguments: '{}' } }],
          };
      response.end(JSON.stringify({ choices: [{ index: 0, message }] }));
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const { port } = stub.address() as AddressInfo;

    testApp = await createTestApp({
      omniroute: { baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: STUB_KEY, model: 'stub-model', timeoutMs: 5_000 },
    });
    account = await registerAccount(testApp, 'Gamma', 'USD');
    await testApp
      .http()
      .post(api('/sync/push'))
      .set(account.auth)
      .send({ deviceId: 'device-1', changes: [medicineChange(), batchChange()] })
      .expect(200);
  });

  afterAll(async () => {
    await testApp.close();
    await new Promise((resolve) => stub.close(resolve));
  });

  it('reports AI mode without exposing the key', async () => {
    const status = await testApp.http().get(api('/ai/status')).set(account.auth).expect(200);
    expect(status.body).toEqual({ mode: 'ai', model: 'stub-model' });
    const health = await testApp.http().get(api('/health')).expect(200);
    expect(health.body.aiGateway).toBe('configured');
    expect(JSON.stringify([status.body, health.body])).not.toContain(STUB_KEY);
  });

  it('lets the model call a data function and returns its answer', async () => {
    const response = await testApp.http().post(api('/ai/chat')).set(account.auth).send({ message: 'How many medicines?' }).expect(200);

    expect(response.body.assistantMessage).toMatchObject({
      content: 'You have 1 medicine(s) registered.',
      source: 'ai',
      toolsUsed: ['get_inventory_summary'],
      model: 'stub-model',
    });
    expect(JSON.stringify(response.body)).not.toContain(STUB_KEY);

    expect(received).toHaveLength(2);
    expect(received[0].authorization).toBe(`Bearer ${STUB_KEY}`);
    expect(received[0].body.model).toBe('stub-model');
    expect(received[0].body.tools).toHaveLength(5);
    expect(received[0].body.messages[0].role).toBe('system');
    expect(received[0].body.messages[0].content).toMatch(/Never estimate/);

    // The function result sent back to the model is what the database holds.
    const toolMessage = received[1].body.messages.find((message) => message.role === 'tool');
    expect(JSON.parse(toolMessage!.content)).toMatchObject({
      currency: 'USD',
      medicineCount: 1,
      sellableUnits: 120,
      stockValueAtCost: '1020.00',
    });
  });

  it('falls back to a labelled data lookup when the gateway is down', async () => {
    failNextRequests = true;
    const response = await testApp.http().post(api('/ai/chat')).set(account.auth).send({ message: 'inventory summary' }).expect(200);
    expect(response.body.assistantMessage.source).toBe('data_lookup');
    expect(response.body.assistantMessage.content).toMatch(/^The AI gateway could not be reached/);
    expect(response.body.assistantMessage.content).toContain('Medicines registered: 1');
  });
});
