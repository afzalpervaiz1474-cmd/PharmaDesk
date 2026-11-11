export type SyncEntity = 'medicine' | 'medicine_batch';

/** One record's current state, as sent to `POST /api/v1/sync/push`. */
export interface SyncChange {
  entity: SyncEntity;
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  data: Record<string, unknown>;
}

/** A change waiting in the local outbox. */
export interface PendingChange extends SyncChange {
  /** Highest outbox row id covered by this snapshot. Later edits stay queued. */
  upToOutboxId: number;
}

export type PushStatus = 'applied' | 'stale' | 'rejected';

export interface PushResult {
  entity: SyncEntity;
  id: string;
  /** applied: stored · stale: server already has a newer version · rejected: invalid. */
  status: PushStatus;
  reason?: string;
}

export interface OutboxStore {
  countPending(): Promise<number>;
  /** Pending records, medicines before batches, never-attempted first. */
  listPending(limit: number): Promise<PendingChange[]>;
  markSynced(change: PendingChange): Promise<void>;
  markFailed(change: PendingChange, reason: string): Promise<void>;
  getDeviceId(): Promise<string>;
  getState(key: string): Promise<string | null>;
  setState(key: string, value: string): Promise<void>;
}

export interface SyncTransport {
  push(deviceId: string, changes: SyncChange[]): Promise<PushResult[]>;
}

export interface SyncReport {
  attempted: number;
  applied: number;
  stale: number;
  rejected: number;
  remaining: number;
}
