import { describe, expect, it } from 'vitest';
import { SyncEngine } from './SyncEngine';
import type { OutboxStore, PendingChange, PushResult, SyncChange, SyncTransport } from './types';

function change(entity: PendingChange['entity'], id: string): PendingChange {
  return { entity, id, updatedAt: '2026-11-11T09:00:00.000Z', deletedAt: null, data: { id }, upToOutboxId: 1 };
}

/** In-memory outbox that behaves like the SQLite one for the engine's purposes. */
class FakeOutbox implements OutboxStore {
  pending: PendingChange[];
  failures = new Map<string, string>();
  state = new Map<string, string>();

  constructor(pending: PendingChange[]) {
    this.pending = pending;
  }

  async countPending() {
    return this.pending.length;
  }
  async listPending(limit: number) {
    return this.pending.slice(0, limit);
  }
  async markSynced(synced: PendingChange) {
    this.pending = this.pending.filter((item) => item.id !== synced.id);
  }
  async markFailed(failed: PendingChange, reason: string) {
    this.failures.set(failed.id, reason);
    // Failed records sink to the back, like ORDER BY attempts in SQLite.
    this.pending = [...this.pending.filter((item) => item.id !== failed.id), failed];
  }
  async getDeviceId() {
    return 'device-1';
  }
  async getState(key: string) {
    return this.state.get(key) ?? null;
  }
  async setState(key: string, value: string) {
    this.state.set(key, value);
  }
}

function transportReturning(statusFor: (change: SyncChange) => PushResult['status'] | null) {
  const calls: { deviceId: string; changes: SyncChange[] }[] = [];
  const transport: SyncTransport = {
    async push(deviceId, changes) {
      calls.push({ deviceId, changes });
      return changes.flatMap((item) => {
        const status = statusFor(item);
        if (status === null) return [];
        return [{ entity: item.entity, id: item.id, status, reason: status === 'rejected' ? 'invalid' : undefined }];
      });
    },
  };
  return { transport, calls };
}

describe('SyncEngine.pushPending', () => {
  it('does nothing when the outbox is empty', async () => {
    const outbox = new FakeOutbox([]);
    const { transport, calls } = transportReturning(() => 'applied');
    const report = await new SyncEngine(outbox, transport).pushPending();
    expect(calls).toHaveLength(0);
    expect(report).toEqual({ attempted: 0, applied: 0, stale: 0, rejected: 0, remaining: 0 });
  });

  it('pushes pending changes with the device id and clears applied ones', async () => {
    const outbox = new FakeOutbox([change('medicine', 'm1'), change('medicine_batch', 'b1')]);
    const { transport, calls } = transportReturning(() => 'applied');
    const report = await new SyncEngine(outbox, transport).pushPending();

    expect(calls).toHaveLength(1);
    expect(calls[0].deviceId).toBe('device-1');
    expect(calls[0].changes[0]).not.toHaveProperty('upToOutboxId');
    expect(report).toMatchObject({ attempted: 2, applied: 2, remaining: 0 });
    expect(outbox.state.has('last_push_at')).toBe(true);
  });

  it('treats stale changes as settled: the server already has something newer', async () => {
    const outbox = new FakeOutbox([change('medicine', 'm1')]);
    const { transport } = transportReturning(() => 'stale');
    const report = await new SyncEngine(outbox, transport).pushPending();
    expect(report).toMatchObject({ stale: 1, remaining: 0 });
  });

  it('keeps rejected changes queued with the reason, without looping forever', async () => {
    const outbox = new FakeOutbox([change('medicine', 'bad'), change('medicine', 'good')]);
    const { transport, calls } = transportReturning((item) => (item.id === 'bad' ? 'rejected' : 'applied'));
    const report = await new SyncEngine(outbox, transport).pushPending();

    expect(report).toMatchObject({ attempted: 2, applied: 1, rejected: 1, remaining: 1 });
    expect(outbox.failures.get('bad')).toBe('invalid');
    expect(calls).toHaveLength(1);
  });

  it('treats a missing server result as a failure rather than assuming success', async () => {
    const outbox = new FakeOutbox([change('medicine', 'm1')]);
    const { transport } = transportReturning(() => null);
    const report = await new SyncEngine(outbox, transport).pushPending();
    expect(report).toMatchObject({ rejected: 1, remaining: 1 });
  });

  it('works through the outbox in batches', async () => {
    const outbox = new FakeOutbox(['a', 'b', 'c', 'd', 'e'].map((id) => change('medicine', id)));
    const { transport, calls } = transportReturning(() => 'applied');
    const report = await new SyncEngine(outbox, transport, 2).pushPending();
    expect(calls.map((call) => call.changes.length)).toEqual([2, 2, 1]);
    expect(report).toMatchObject({ attempted: 5, applied: 5, remaining: 0 });
  });

  it('leaves the outbox untouched when the network fails', async () => {
    const outbox = new FakeOutbox([change('medicine', 'm1')]);
    const transport: SyncTransport = {
      async push() {
        throw new Error('Could not reach the backend');
      },
    };
    await expect(new SyncEngine(outbox, transport).pushPending()).rejects.toThrow('Could not reach the backend');
    expect(outbox.pending).toHaveLength(1);
    expect(outbox.failures.size).toBe(0);
  });
});
