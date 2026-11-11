import { Logger } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { Database, type Queryable, type QueryResult } from './database';

export interface PgOptions {
  connectionString: string;
  ssl: boolean;
}

/** `Database` backed by a node-postgres connection pool. */
export class PgDatabase extends Database {
  private readonly logger = new Logger(PgDatabase.name);
  private readonly pool: Pool;

  constructor(options: PgOptions) {
    super();
    // The pool connects lazily, so the server can start (and report the
    // database as "down" on /health) even when PostgreSQL is unreachable.
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    this.pool.on('error', (error) => this.logger.error(`Idle PostgreSQL client error: ${error.message}`));
  }

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, [...params]);
    return { rows: result.rows as T[] };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(asQueryable(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function asQueryable(client: PoolClient): Queryable {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
      const result = await client.query(sql, [...params]);
      return { rows: result.rows as T[] };
    },
    async exec(sql: string): Promise<void> {
      await client.query(sql);
    },
  };
}
