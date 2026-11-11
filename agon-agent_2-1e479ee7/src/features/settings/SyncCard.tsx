import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRuntime } from '../../app/runtime-context';
import { Badge, PlannedBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Notice } from '../../components/ui/Notice';
import { describeError } from '../../data/errors';
import { formatDateTime } from '../../domain/dates';
import { useCloudSession } from '../cloud/cloud-session-context';
import { SyncEngine } from '../sync/SyncEngine';
import type { SyncReport } from '../sync/types';

const STAGES: { label: string; done: boolean }[] = [
  { label: 'Local change queue (outbox) filled by database triggers', done: true },
  { label: 'Manual push to the backend, last write wins', done: true },
  { label: 'Pull endpoint on the backend', done: true },
  { label: 'Applying pulled changes to the local database', done: false },
  { label: 'Automatic background sync and retry', done: false },
  { label: 'Conflict review screen', done: false },
];

/** Manual push of queued local changes. Pull into SQLite is not built yet. */
export function SyncCard() {
  const { outbox } = useRuntime();
  const { client, user } = useCloudSession();
  const [pending, setPending] = useState<number | null>(null);
  const [lastPushAt, setLastPushAt] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const readState = useCallback(async (): Promise<[number, string | null]> => {
    if (!outbox) return [0, null];
    return Promise.all([outbox.countPending(), outbox.getState('last_push_at')]);
  }, [outbox]);

  useEffect(() => {
    let cancelled = false;
    readState()
      .then(([count, last]) => {
        if (cancelled) return;
        setPending(count);
        setLastPushAt(last);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(describeError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [readState]);

  const handlePush = async () => {
    if (!outbox || !client) return;
    setPushing(true);
    setFailure(null);
    setReport(null);
    try {
      setReport(await new SyncEngine(outbox, client).pushPending());
      const [count, last] = await readState();
      setPending(count);
      setLastPushAt(last);
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setPushing(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Synchronisation"
        description="Initial architecture: local changes can be pushed to the cloud. Two-way sync is not finished."
      />
      <div className="space-y-4 px-5 py-4">
        {!outbox ? (
          <Notice tone="info" title="Not available in the web preview">
            Sync moves data from the desktop app&apos;s local SQLite database to the backend. This preview has no local
            database, so there is nothing to push.
          </Notice>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted">Records waiting to push</dt>
                <dd className="tabular mt-0.5 text-2xl font-semibold text-ink">{pending === null ? '…' : pending.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted">Last push</dt>
                <dd className="mt-0.5 text-ink">{lastPushAt ? formatDateTime(lastPushAt) : 'Never'}</dd>
              </div>
            </dl>
            <Button
              icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void handlePush()}
              loading={pushing}
              disabled={!client || !user || pending === 0}
            >
              Push pending changes
            </Button>
            {!client || !user ? (
              <p className="text-[13px] text-muted">Set the backend address and sign in to push.</p>
            ) : null}
            {report ? (
              <Notice tone={report.rejected > 0 ? 'warning' : 'success'} title="Push finished">
                {report.applied} stored · {report.stale} already newer on the server · {report.rejected} rejected ·{' '}
                {report.remaining} still waiting
              </Notice>
            ) : null}
          </>
        )}
        {failure ? (
          <Notice tone="danger" title="Sync failed">
            {failure}
          </Notice>
        ) : null}

        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {STAGES.map((stage) => (
            <li key={stage.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-ink-soft">{stage.label}</span>
              {stage.done ? <Badge tone="success">Built</Badge> : <PlannedBadge />}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
