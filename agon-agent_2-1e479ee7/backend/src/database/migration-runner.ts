import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Database } from './database';

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

/** `backend/migrations`, resolved from both `src/database` and `dist/database`. */
export const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

/**
 * Applies pending SQL migrations in file-name order and returns their names.
 *
 * - Applied migrations are recorded in `schema_migrations`.
 * - Each migration and its bookkeeping row commit in one transaction, so a
 *   failing migration leaves the database exactly as it was.
 * - Released migrations must never be edited; add a new file instead.
 */
export async function runMigrations(database: Database, directory: string = MIGRATIONS_DIR): Promise<string[]> {
  await database.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name       text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const applied = new Set(
    (await database.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
  );

  const files = (await readdir(directory)).filter((file) => MIGRATION_FILE.test(file)).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(directory, file), 'utf8');
    await database.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    ran.push(file);
  }
  return ran;
}
