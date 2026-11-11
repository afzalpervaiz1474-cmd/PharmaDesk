import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { Field, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { useRuntime } from '../../app/runtime-context';
import { CURRENCIES, usePreferences } from '../../lib/preferences-context';
import { useInventory } from '../inventory/inventory-context';
import { AccountCard } from './AccountCard';
import { BackendCard } from './BackendCard';
import { SyncCard } from './SyncCard';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-ink">{children}</dd>
    </div>
  );
}

export function SettingsPage() {
  const { mode } = useRuntime();
  const { medicines } = useInventory();
  const { currency, setCurrency } = usePreferences();

  return (
    <>
      <PageHeader
        title="Sync & settings"
        description="This device, the optional cloud backend, your account and synchronisation."
      />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="This device" description="Where data is stored for this session." />
          <dl className="divide-y divide-line">
            <Row label="Running as">
              {mode === 'desktop' ? 'Desktop app (Tauri)' : 'Web preview in a browser'}
            </Row>
            <Row label="Data source">
              {mode === 'desktop' ? (
                <>
                  Local SQLite file <span className="font-mono text-xs">pharmadesk.db</span>
                </>
              ) : (
                'Shared demo database (hosted)'
              )}
            </Row>
            <Row label="Works offline">
              {mode === 'desktop' ? <Badge tone="success">Yes</Badge> : <Badge>No — desktop only</Badge>}
            </Row>
            <Row label="Medicines on record">{medicines.length.toLocaleString()}</Row>
          </dl>
          <div className="border-t border-line px-5 py-4">
            <Field
              label="Display currency"
              htmlFor="settings-currency"
              hint="Used to format prices on this device. Amounts are stored as plain numbers and are not converted."
            >
              <Select
                id="settings-currency"
                hasHint
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                className="sm:max-w-40"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <BackendCard />
        <AccountCard />
        <SyncCard />
      </div>
    </>
  );
}
