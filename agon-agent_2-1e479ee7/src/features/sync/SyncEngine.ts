import type { OutboxStore, PendingChange, PushResult, SyncChange, SyncReport, SyncTransport } from './types';

const keyOf = (change: Pick<SyncChange, 'entity' | 'id'>): string => `${change.entity}:${change.id}`;

/**
 * Pushes locally queued changes to the cloud backend.
 *
 * Implemented: push (local -> cloud), with the server resolving conflicts by
 * last-write-wins on `updatedAt`.
 * Not implemented yet: pull (cloud -> local), background scheduling, retries
 * with backoff. See ARCHITECTURE.md, "Offline synchronisation".
 */
export class SyncEngine {
  private readonly outbox: OutboxStore;
  private readonly transport: SyncTransport;
  private readonly batchSize: number;

  constructor(outbox: OutboxStore, transport: SyncTransport, batchSize: number = 100) {
    this.outbox = outbox;
    this.transport = transport;
    this.batchSize = batchSize;
  }

  /**
   * Sends every pending change once. Network or server failures throw and
   * leave the outbox untouched, so the same changes are retried next time.
   */
  async pushPending(): Promise<SyncReport> {
    const report: SyncReport = { attempted: 0, applied: 0, stale: 0, rejected: 0, remaining: 0 };
    const deviceId = await this.outbox.getDeviceId();
    const attempted = new Set<string>();

    for (;;) {
      const batch = (await this.outbox.listPending(this.batchSize)).filter(
        (change) => !attempted.has(keyOf(change)),
      );
      if (batch.length === 0) break;

      const results = await this.transport.push(deviceId, batch.map(toSyncChange));
      const resultByKey = new Map<string, PushResult>(results.map((result) => [keyOf(result), result]));

      for (const change of batch) {
        attempted.add(keyOf(change));
        report.attempted += 1;
        const result = resultByKey.get(keyOf(change));
        if (result?.status === 'applied' || result?.status === 'stale') {
          await this.outbox.markSynced(change);
          report[result.status] += 1;
        } else {
          await this.outbox.markFailed(change, result?.reason ?? 'The server returned no result for this record.');
          report.rejected += 1;
        }
      }
    }

    report.remaining = await this.outbox.countPending();
    await this.outbox.setState('last_push_at', new Date().toISOString());
    return report;
  }
}

function toSyncChange(change: PendingChange): SyncChange {
  return {
    entity: change.entity,
    id: change.id,
    updatedAt: change.updatedAt,
    deletedAt: change.deletedAt,
    data: change.data,
  };
}
