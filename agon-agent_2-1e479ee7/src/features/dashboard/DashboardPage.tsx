import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, CalendarClock, CircleAlert, PackagePlus, Pill, RefreshCw, TriangleAlert, Wallet } from 'lucide-react';
import { PLANNED_MODULES } from '../../app/navigation';
import { BarChart } from '../../components/charts/BarChart';
import { PlannedBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState, SkeletonRows } from '../../components/ui/EmptyState';
import { Notice } from '../../components/ui/Notice';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatDate, formatMonthKey, todayIso } from '../../domain/dates';
import {
  batchAlerts,
  expiryTimeline,
  EXPIRY_WARNING_DAYS,
  reorderList,
  summarizeInventory,
  unitsByDosageForm,
} from '../../domain/inventory';
import { DOSAGE_FORM_LABELS, formatLocation } from '../../domain/types';
import { useMoney } from '../../lib/preferences-context';
import { useInventory } from '../inventory/inventory-context';
import { ExpiryBadge, StockBadge } from '../inventory/StatusBadges';
import { StatCard } from './StatCard';

const LIST_LIMIT = 6;

/**
 * Every figure on this page is computed from the medicines and batches in
 * the database. Sales and profit are not shown because they are not recorded.
 */
export function DashboardPage() {
  const { medicines, loading, error, reload } = useInventory();
  const money = useMoney();
  const today = useMemo(() => todayIso(), []);

  const view = useMemo(
    () => ({
      summary: summarizeInventory(medicines, today),
      timeline: expiryTimeline(medicines, today, 6),
      byForm: unitsByDosageForm(medicines, today),
      reorder: reorderList(medicines, today),
      alerts: batchAlerts(medicines, today),
    }),
    [medicines, today],
  );
  const { summary, timeline, byForm, reorder, alerts } = view;
  const maxFormUnits = Math.max(...byForm.map((entry) => entry.units), 1);
  const needsReorder = summary.lowStockCount + summary.outOfStockCount;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Stock position of the store, calculated from the medicines and batches on record."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void reload()}
              loading={loading}
            >
              Refresh
            </Button>
            <Link to="/inventory/new" className={buttonClasses('primary')}>
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              Register medicine
            </Link>
          </>
        }
      />

      {error ? (
        <Notice
          tone="danger"
          title="The inventory could not be loaded"
          className="mb-6"
          action={
            <Button size="sm" variant="secondary" onClick={() => void reload()}>
              Retry
            </Button>
          }
        >
          {error}
        </Notice>
      ) : null}

      {loading && medicines.length === 0 ? (
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      ) : !error && medicines.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Pill className="h-5 w-5" aria-hidden="true" />}
            title="No medicines registered yet"
            action={
              <Link to="/inventory/new" className={buttonClasses('primary')}>
                Register the first medicine
              </Link>
            }
          >
            Stock figures, reorder alerts and expiry warnings appear here once medicines and batches are on record.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Medicines registered"
              value={summary.medicineCount.toLocaleString()}
              detail={`${summary.activeBatchCount.toLocaleString()} batches holding stock`}
              icon={Pill}
            />
            <StatCard
              label="Sellable units in stock"
              value={summary.sellableUnits.toLocaleString()}
              detail="Expired batches are excluded"
              icon={Boxes}
            />
            <StatCard
              label="Stock value at cost"
              value={money(summary.stockValueCostMinor)}
              detail={`${money(summary.stockValueRetailMinor)} at selling price`}
              icon={Wallet}
            />
            <StatCard
              label="Needs reorder"
              value={needsReorder.toLocaleString()}
              detail={`${summary.outOfStockCount} out of stock · ${summary.lowStockCount} low`}
              icon={TriangleAlert}
              tone={needsReorder > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label={`Expiring within ${EXPIRY_WARNING_DAYS} days`}
              value={`${summary.expiringBatchCount.toLocaleString()} ${summary.expiringBatchCount === 1 ? 'batch' : 'batches'}`}
              detail={`${summary.expiringUnits.toLocaleString()} units to sell first`}
              icon={CalendarClock}
              tone={summary.expiringBatchCount > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label="Expired stock on shelves"
              value={`${summary.expiredBatchCount.toLocaleString()} ${summary.expiredBatchCount === 1 ? 'batch' : 'batches'}`}
              detail={`${summary.expiredUnits.toLocaleString()} units · ${money(summary.expiredValueCostMinor)} at cost`}
              icon={CircleAlert}
              tone={summary.expiredBatchCount > 0 ? 'danger' : 'default'}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Units reaching expiry, next 6 months"
                description="Sellable units grouped by the month their batch expires."
              />
              <div className="p-5">
                <BarChart
                  label="Sellable units grouped by expiry month for the next six months"
                  unit="units"
                  data={timeline.map((bucket) => ({
                    label: formatMonthKey(bucket.monthKey),
                    value: bucket.units,
                    detail: `${bucket.batches} ${bucket.batches === 1 ? 'batch' : 'batches'}`,
                  }))}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Stock by dosage form" description="Sellable units per form." />
              <ul className="space-y-3.5 p-5">
                {byForm.map((entry) => (
                  <li key={entry.form}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-ink-soft">
                        {DOSAGE_FORM_LABELS[entry.form]}
                        <span className="ml-1.5 text-xs text-muted">
                          {entry.medicines} {entry.medicines === 1 ? 'medicine' : 'medicines'}
                        </span>
                      </span>
                      <span className="tabular shrink-0 font-medium text-ink">{entry.units.toLocaleString()}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-surface-muted" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(entry.units / maxFormUnits) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="Reorder list"
                description="At or below reorder level, lowest stock first."
                action={
                  <Link to="/inventory?filter=reorder" className={buttonClasses('ghost', 'sm')}>
                    View all {reorder.length}
                  </Link>
                }
              />
              {reorder.length === 0 ? (
                <EmptyState title="Nothing needs reordering">Every medicine is above its reorder level.</EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {reorder.slice(0, LIST_LIMIT).map(({ medicine, sellable, status }) => (
                    <li key={medicine.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {medicine.name}
                          {medicine.strength ? <span className="font-normal text-muted"> {medicine.strength}</span> : null}
                        </p>
                        <p className="truncate text-[13px] text-muted">
                          {formatLocation(medicine) ?? 'No location set'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular text-right text-[13px] text-ink-soft">
                          {sellable.toLocaleString()} / {medicine.reorderLevel.toLocaleString()}
                        </span>
                        <StockBadge status={status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Expiry watch"
                description={`Expired, or expiring within ${EXPIRY_WARNING_DAYS} days.`}
                action={
                  <Link to="/inventory?filter=expiry" className={buttonClasses('ghost', 'sm')}>
                    View all {alerts.length}
                  </Link>
                }
              />
              {alerts.length === 0 ? (
                <EmptyState title="No expiry concerns">
                  No stock-holding batch is expired or inside the warning window.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {alerts.slice(0, LIST_LIMIT).map(({ medicine, batch, daysLeft, status }) => (
                    <li key={batch.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{medicine.name}</p>
                        <p className="truncate text-[13px] text-muted">
                          Batch <span className="font-mono text-xs">{batch.batchNumber}</span> ·{' '}
                          {batch.quantity.toLocaleString()} {medicine.unit} · {formatDate(batch.expiryDate)}
                        </p>
                      </div>
                      <ExpiryBadge status={status} daysLeft={daysLeft} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Sales, purchases, expenses and profit"
              description="These modules are not built yet, so no figures are shown. Nothing here is estimated."
            />
            <ul className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
              {PLANNED_MODULES.map((module) => (
                <li key={module.id} className="bg-surface">
                  <Link to={`/planned/${module.id}`} className="block h-full px-5 py-4 hover:bg-surface-muted">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-ink">
                        <module.icon className="h-4 w-4 text-muted" aria-hidden="true" />
                        {module.title}
                      </span>
                      <PlannedBadge />
                    </div>
                    <p className="mt-1.5 text-[13px] text-muted">{module.summary}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
