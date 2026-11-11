import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase } from './SqlDatabase';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../src-tauri/migrations/', import.meta.url));

type BindValue = null | number | bigint | string;

/**
 * Test-only database: an in-memory SQLite created from the *real* migration
 * files that the Tauri shell applies, exposed through the same interface as
 * `@tauri-apps/plugin-sql`. Uses Node's built-in `node:sqlite`.
 */
export function createTestDatabase(): SqlDatabase & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    raw.exec(readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8'));
  }

  const bind = (values: unknown[] = []): Record<string, BindValue> =>
    Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value as BindValue]));

  return {
    raw,
    async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
      return raw.prepare(query).all(bind(bindValues)) as T;
    },
    async execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number }> {
      const result = raw.prepare(query).run(bind(bindValues));
      return { rowsAffected: Number(result.changes) };
    },
  };
}

/** Deterministic ids and a clock that advances one second per call. */
export function createTestClock(start: string = '2026-11-11T09:00:00.000Z') {
  let counter = 0;
  let time = new Date(start).getTime();
  return {
    newId: (): string => {
      counter += 1;
      return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
    now: (): Date => {
      time += 1000;
      return new Date(time);
    },
  };
}
