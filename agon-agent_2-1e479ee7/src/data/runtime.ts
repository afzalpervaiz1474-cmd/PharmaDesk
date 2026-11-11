import type { OutboxStore } from '../features/sync/types';
import { HttpInventoryRepository } from './HttpInventoryRepository';
import type { InventoryRepository } from './InventoryRepository';

/** Must match DATABASE_URL in src-tauri/src/lib.rs. */
export const SQLITE_URL = 'sqlite:pharmadesk.db';

export type RuntimeMode = 'desktop' | 'web-preview';

export interface AppRuntime {
  mode: RuntimeMode;
  inventory: InventoryRepository;
  /** Local change queue. Only exists on the desktop, where data lives in SQLite. */
  outbox: OutboxStore | null;
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Chooses the data source for this session.
 *
 * - Inside the Tauri shell: the local SQLite database (migrations are applied
 *   by the Rust side when the database is opened).
 * - In a plain browser: the hosted preview API.
 *
 * The SQLite modules are imported lazily so the browser bundle never loads
 * the Tauri plugin.
 */
export async function createRuntime(): Promise<AppRuntime> {
  if (!isTauriRuntime()) {
    return { mode: 'web-preview', inventory: new HttpInventoryRepository('/api'), outbox: null };
  }

  const [{ default: Database }, { SqliteInventoryRepository }, { SqliteOutboxStore }] = await Promise.all([
    import('@tauri-apps/plugin-sql'),
    import('./sqlite/SqliteInventoryRepository'),
    import('./sqlite/SqliteOutboxStore'),
  ]);
  const database = await Database.load(SQLITE_URL);
  return {
    mode: 'desktop',
    inventory: new SqliteInventoryRepository(database),
    outbox: new SqliteOutboxStore(database),
  };
}
