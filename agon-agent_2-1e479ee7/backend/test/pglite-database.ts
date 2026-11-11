import { PGlite } from '@electric-sql/pglite';
import { Database, type Queryable, type QueryResult } from '../src/database/database';

/**
 * `Database` backed by PGlite: a real PostgreSQL engine compiled to
 * WebAssembly, running in-process and in memory. It lets the end-to-end tests
 * run the production SQL and migrations without a PostgreSQL server.
 *
 * What this does not cover: the node-postgres driver, connection pooling and
 * TLS used by `PgDatabase` in production.
 */
export class PgliteDatabase extends Database {
  private constructor(private readonly db: PGlite) {
    super();
  }

  static async create(): Promise<PgliteDatabase> {
    const db = new PGlite();
    await db.waitReady;
    return new PgliteDatabase(db);
  }

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.db.query<T>(sql, [...params]);
    return { rows: result.rows };
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) =>
      work({
        async query<R = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<R>> {
          const result = await tx.query<R>(sql, [...params]);
          return { rows: result.rows };
        },
        async exec(sql: string): Promise<void> {
          await tx.exec(sql);
        },
      }),
    ) as Promise<T>;
  }

  async close(): Promise<void> {
    if (!this.db.closed) await this.db.close();
  }
}
