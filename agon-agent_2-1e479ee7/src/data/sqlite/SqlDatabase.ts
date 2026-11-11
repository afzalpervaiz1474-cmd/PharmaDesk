/**
 * The subset of `@tauri-apps/plugin-sql`'s Database that PharmaDesk uses.
 * Depending on this interface (not the plugin) lets the repositories run
 * against Node's built-in SQLite in tests.
 *
 * Queries use `$1, $2, …` placeholders.
 */
export interface SqlDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number }>;
}

export interface Clock {
  newId: () => string;
  now: () => Date;
}

export const systemClock: Clock = {
  newId: () => crypto.randomUUID(),
  now: () => new Date(),
};
