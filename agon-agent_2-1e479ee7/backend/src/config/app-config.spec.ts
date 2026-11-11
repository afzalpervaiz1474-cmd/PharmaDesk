import { ConfigError, loadConfig } from './app-config';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/pharmadesk',
  JWT_SECRET: 'x'.repeat(32),
};

function problemsOf(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
}

describe('loadConfig', () => {
  it('applies defaults when only the required variables are set', () => {
    const config = loadConfig(valid);
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      databaseSsl: false,
      jwtExpiresInSeconds: 43_200,
      allowRegistration: true,
      corsOrigins: [],
      omniroute: null,
    });
  });

  it('reports every problem at once', () => {
    const problems = problemsOf({ PORT: 'abc', DATABASE_SSL: 'maybe' });
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toMatch(/DATABASE_URL/);
    expect(problems.join('\n')).toMatch(/JWT_SECRET/);
    expect(problems.join('\n')).toMatch(/PORT/);
    expect(problems.join('\n')).toMatch(/DATABASE_SSL/);
  });

  it('rejects short secrets without echoing them', () => {
    const problems = problemsOf({ ...valid, JWT_SECRET: 'short-secret-value' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).not.toContain('short-secret-value');
  });

  it('refuses the .env.example placeholder secret in production only', () => {
    const placeholder = 'change-me-generate-with-openssl-rand-hex-32';
    expect(() => loadConfig({ ...valid, JWT_SECRET: placeholder })).not.toThrow();
    expect(problemsOf({ ...valid, JWT_SECRET: placeholder, NODE_ENV: 'production' })[0]).toMatch(/placeholder/);
  });

  it('parses the CORS origin list', () => {
    const config = loadConfig({ ...valid, CORS_ORIGINS: ' http://localhost:1420 , tauri://localhost ,' });
    expect(config.corsOrigins).toEqual(['http://localhost:1420', 'tauri://localhost']);
  });

  it('leaves the AI gateway off when no key is set, even if a URL is', () => {
    expect(loadConfig({ ...valid, OMNIROUTE_BASE_URL: 'http://localhost:20128/v1' }).omniroute).toBeNull();
  });

  it('requires a URL and a model once a gateway key is set', () => {
    const problems = problemsOf({ ...valid, OMNIROUTE_API_KEY: 'stub-key' });
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).not.toContain('stub-key');
  });

  it('accepts a complete gateway configuration and trims the trailing slash', () => {
    const config = loadConfig({
      ...valid,
      OMNIROUTE_API_KEY: 'stub-key',
      OMNIROUTE_BASE_URL: 'http://localhost:20128/v1/',
      OMNIROUTE_MODEL: 'auto',
    });
    expect(config.omniroute).toEqual({
      apiKey: 'stub-key',
      baseUrl: 'http://localhost:20128/v1',
      model: 'auto',
      timeoutMs: 30_000,
    });
  });
});
