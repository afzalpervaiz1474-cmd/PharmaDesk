import type { AppConfig } from '../config/app-config';
import { AiGatewayError, OmniRouteClient } from './omniroute.client';

const STUB_KEY = 'stub-key-for-tests-only';

function configWith(omniroute: AppConfig['omniroute']): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    corsOrigins: [],
    databaseUrl: 'postgresql://unused',
    databaseSsl: false,
    jwtSecret: 'x'.repeat(32),
    jwtExpiresInSeconds: 60,
    allowRegistration: true,
    omniroute,
  };
}

const gateway = { baseUrl: 'http://gateway.test/v1', apiKey: STUB_KEY, model: 'test-model', timeoutMs: 5_000 };

function mockFetch(response: Partial<Response> | Error) {
  const mock = jest.fn(async () => {
    if (response instanceof Error) throw response;
    return response as Response;
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('OmniRouteClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reports itself as not configured without a key, and refuses to call out', async () => {
    const fetchMock = mockFetch(new Error('must not be called'));
    const client = new OmniRouteClient(configWith(null));
    expect(client.isConfigured).toBe(false);
    expect(client.model).toBeNull();
    await expect(client.complete([], [])).rejects.toBeInstanceOf(AiGatewayError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts an OpenAI-compatible request with the key in the Authorization header', async () => {
    const fetchMock = mockFetch({
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Hello' } }] }),
    });
    const client = new OmniRouteClient(configWith(gateway));
    const turn = await client.complete([{ role: 'user', content: 'Hi' }], []);

    expect(turn).toEqual({ content: 'Hello', toolCalls: [] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://gateway.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${STUB_KEY}`);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'test-model', tool_choice: 'auto', messages: [{ role: 'user', content: 'Hi' }] });
    expect(init.body as string).not.toContain(STUB_KEY);
  });

  it('returns well-formed tool calls and drops malformed ones', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'get_inventory_summary', arguments: '{}' } },
                { id: 42, function: { name: 'broken' } },
              ],
            },
          },
        ],
      }),
    });
    const turn = await new OmniRouteClient(configWith(gateway)).complete([], []);
    expect(turn.content).toBeNull();
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0].function.name).toBe('get_inventory_summary');
  });

  it.each([
    ['an HTTP error', { ok: false, status: 502, json: async () => ({ error: `bad key ${STUB_KEY}` }) }, /HTTP 502/],
    ['a network failure', new Error(`connect ECONNREFUSED ${STUB_KEY}`), /could not be reached/],
    ['an unexpected body', { ok: true, json: async () => ({ unexpected: true }) }, /unexpected response/],
  ])('turns %s into an AiGatewayError that never contains the key', async (_name, response, pattern) => {
    mockFetch(response as Partial<Response> | Error);
    const attempt = new OmniRouteClient(configWith(gateway)).complete([], []);
    await expect(attempt).rejects.toBeInstanceOf(AiGatewayError);
    await expect(attempt).rejects.toThrow(pattern);
    await attempt.catch((error: Error) => expect(error.message).not.toContain(STUB_KEY));
  });
});
