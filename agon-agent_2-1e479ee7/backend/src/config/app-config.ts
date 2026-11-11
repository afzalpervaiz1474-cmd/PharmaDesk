export const APP_CONFIG = Symbol('APP_CONFIG');

export interface OmniRouteConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  corsOrigins: string[];
  databaseUrl: string;
  databaseSsl: boolean;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  allowRegistration: boolean;
  /** null when no gateway key is set: the assistant then runs in data-lookup mode. */
  omniroute: OmniRouteConfig | null;
}

/** Raised at start-up with every configuration problem listed at once. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

function readInteger(env: Env, key: string, fallback: number, min: number, max: number, problems: string[]): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${key} must be a whole number between ${min} and ${max}`);
    return fallback;
  }
  return value;
}

function readBoolean(env: Env, key: string, fallback: boolean, problems: string[]): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  problems.push(`${key} must be "true" or "false"`);
  return fallback;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Reads and validates configuration from environment variables.
 * Pure: pass `process.env` in production and a literal object in tests.
 * Error messages name the variable but never echo secret values.
 */
export function loadConfig(env: Env): AppConfig {
  const problems: string[] = [];

  const rawNodeEnv = env.NODE_ENV?.trim() || 'development';
  const nodeEnv = (['development', 'test', 'production'] as const).find((value) => value === rawNodeEnv);
  if (!nodeEnv) problems.push('NODE_ENV must be development, test or production');

  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (!/^postgres(ql)?:\/\/.+/.test(databaseUrl)) {
    problems.push('DATABASE_URL is required and must start with postgresql://');
  }

  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    problems.push('JWT_SECRET is required and must be at least 32 characters (generate one with: openssl rand -hex 32)');
  } else if (nodeEnv === 'production' && jwtSecret.includes('change-me')) {
    problems.push('JWT_SECRET still contains the placeholder from .env.example; generate a real secret');
  }

  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');

  let omniroute: OmniRouteConfig | null = null;
  const apiKey = env.OMNIROUTE_API_KEY?.trim() ?? '';
  if (apiKey !== '') {
    const baseUrl = (env.OMNIROUTE_BASE_URL?.trim() ?? '').replace(/\/+$/, '');
    const model = env.OMNIROUTE_MODEL?.trim() ?? '';
    if (!isHttpUrl(baseUrl)) problems.push('OMNIROUTE_BASE_URL must be an http(s) URL when OMNIROUTE_API_KEY is set');
    if (model === '') problems.push('OMNIROUTE_MODEL is required when OMNIROUTE_API_KEY is set');
    omniroute = {
      baseUrl,
      apiKey,
      model,
      timeoutMs: readInteger(env, 'OMNIROUTE_TIMEOUT_MS', 30_000, 1_000, 120_000, problems),
    };
  }

  const config: AppConfig = {
    nodeEnv: nodeEnv ?? 'development',
    port: readInteger(env, 'PORT', 3000, 1, 65_535, problems),
    corsOrigins,
    databaseUrl,
    databaseSsl: readBoolean(env, 'DATABASE_SSL', false, problems),
    jwtSecret,
    jwtExpiresInSeconds: readInteger(env, 'JWT_EXPIRES_IN_SECONDS', 43_200, 60, 2_592_000, problems),
    allowRegistration: readBoolean(env, 'AUTH_ALLOW_REGISTRATION', true, problems),
    omniroute,
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}
