export interface QueryResult<T> {
  rows: T[];
}

/** Anything that can run SQL: the pool itself, or a transaction on it. */
export interface Queryable {
  /** Runs one parameterised statement. Values are always passed as parameters. */
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  /** Runs a script that may hold several statements. Never called with user input. */
  exec(sql: string): Promise<void>;
}

/**
 * The application's only doorway to PostgreSQL.
 *
 * It is an abstract class so that it can be used as a NestJS injection token:
 * production binds it to `PgDatabase` (node-postgres); the end-to-end tests
 * bind it to PGlite, a real PostgreSQL compiled to WebAssembly.
 */
export abstract class Database implements Queryable {
  abstract query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  abstract exec(sql: string): Promise<void>;
  /** Runs `work` in a transaction: commits when it resolves, rolls back when it throws. */
  abstract transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  abstract close(): Promise<void>;
}

/** PostgreSQL error code for a unique-constraint violation. */
export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;
}
