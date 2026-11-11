import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronRight, PackagePlus, Pill, Search } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { Card } from '../../components/ui/Card';
import { EmptyState, SkeletonRows } from '../../components/ui/EmptyState';
import { Select, TextInput } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { PageHeader } from '../../components/ui/PageHeader';
import { daysBetween, formatDate, todayIso } from '../../domain/dates';
import {
  expiryStatus,
  nearestExpiryBatch,
  sellableQuantity,
  stockStatus,
  type ExpiryStatus,
  type StockStatus,
} from '../../domain/inventory';
import { DOSAGE_FORM_LABELS, DOSAGE_FORMS, formatLocation, type MedicineBatch, type MedicineWithBatches } from '../../domain/types';
import { cn } from '../../lib/cn';
import { useMoney } from '../../lib/preferences-context';
import { useInventory } from './inventory-context';
import { MedicineDrawer } from './MedicineDrawer';
import { ExpiryBadge, StockBadge } from './StatusBadges';

type Filter = 'all' | 'reorder' | 'expiry';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'reorder', label: 'Needs reorder' },
  { id: 'expiry', label: 'Expiry watch' },
];

interface Row {
  medicine: MedicineWithBatches;
  sellable: number;
  stock: StockStatus;
  nearest: MedicineBatch | null;
  nearestStatus: ExpiryStatus;
  nearestDaysLeft: number;
  hasExpiryAlert: boolean;
}

function isFilter(value: string | null): value is Filter {
  return value === 'all' || value === 'reorder' || value === 'expiry';
}

export function InventoryPage() {
  const { medicines, loading, error, reload } = useInventory();
  const money = useMoney();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => todayIso(), []);

  const [query, setQuery] = useState('');
  const [form, setForm] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(
    (location.state as { flash?: string } | null)?.flash ?? null,
  );

  const filterParam = searchParams.get('filter');
  const filter: Filter = isFilter(filterParam) ? filterParam : 'all';

  const rows = useMemo<Row[]>(
    () =>
      medicines.map((medicine) => {
        const nearest = nearestExpiryBatch(medicine.batches);
        return {
          medicine,
          sellable: sellableQuantity(medicine.batches, today),
          stock: stockStatus(medicine, today),
          nearest,
          nearestStatus: nearest ? expiryStatus(nearest.expiryDate, today) : 'ok',
          nearestDaysLeft: nearest ? daysBetween(today, nearest.expiryDate) : 0,
          hasExpiryAlert: medicine.batches.some(
            (batch) => batch.quantity > 0 && expiryStatus(batch.expiryDate, today) !== 'ok',
          ),
        };
      }),
    [medicines, today],
  );

  const counts: Record<Filter, number> = {
    all: rows.length,
    reorder: rows.filter((row) => row.stock !== 'ok').length,
    expiry: rows.filter((row) => row.hasExpiryAlert).length,
  };

  const needle = query.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (filter === 'reorder' && row.stock === 'ok') return false;
    if (filter === 'expiry' && !row.hasExpiryAlert) return false;
    if (form !== 'all' && row.medicine.dosageForm !== form) return false;
    if (needle === '') return true;
    const { name, genericName, manufacturer, barcode } = row.medicine;
    return [name, genericName, manufacturer, barcode].some((value) => value?.toLowerCase().includes(needle));
  });

  const selected = selectedId ? medicines.find((medicine) => medicine.id === selectedId) ?? null : null;
  const filtersActive = needle !== '' || form !== 'all' || filter !== 'all';

  const clearFilters = () => {
    setQuery('');
    setForm('all');
    setSearchParams({});
  };

  return (
    <>
      <PageHeader
        title="Medicines"
        description="Every registered medicine with its sellable stock, storage location and nearest expiry."
        actions={
          <Link to="/inventory/new" className={buttonClasses('primary')}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Register medicine
          </Link>
        }
      />

      {flash ? (
        <Notice
          tone="success"
          className="mb-4"
          action={
            <Button size="sm" variant="ghost" onClick={() => setFlash(null)}>
              Dismiss
            </Button>
          }
        >
          {flash}
        </Notice>
      ) : null}

      {error ? (
        <Notice
          tone="danger"
          title="The inventory could not be loaded"
          className="mb-4"
          action={
            <Button size="sm" variant="secondary" onClick={() => void reload()}>
              Retry
            </Button>
          }
        >
          {error}
        </Notice>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="relative min-w-0 flex-1 basis-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <TextInput
              type="search"
              aria-label="Search medicines"
              placeholder="Search by name, generic, manufacturer or barcode"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="shrink-0">
            <Select aria-label="Filter by dosage form" value={form} onChange={(event) => setForm(event.target.value)}>
            <option value="all">All dosage forms</option>
            {DOSAGE_FORMS.map((option) => (
              <option key={option} value={option}>
                {DOSAGE_FORM_LABELS[option]}
              </option>
            ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => setSearchParams(option.id === 'all' ? {} : { filter: option.id })}
                className={cn(
                  'inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm transition-colors',
                  filter === option.id
                    ? 'border-primary bg-primary text-primary-ink'
                    : 'border-line-strong bg-surface text-ink-soft hover:bg-surface-muted',
                )}
              >
                {option.label}
                <span className={cn('tabular text-xs', filter === option.id ? 'text-primary-ink/80' : 'text-muted')}>
                  {counts[option.id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading && medicines.length === 0 ? (
          <SkeletonRows rows={8} />
        ) : medicines.length === 0 && !error ? (
          <EmptyState
            icon={<Pill className="h-5 w-5" aria-hidden="true" />}
            title="No medicines registered yet"
            action={
              <Link to="/inventory/new" className={buttonClasses('primary')}>
                Register the first medicine
              </Link>
            }
          >
            Registered medicines appear here with their stock and expiry status.
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No medicines match"
            action={
              filtersActive ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear search and filters
                </Button>
              ) : undefined
            }
          >
            Try a different search term or filter.
          </EmptyState>
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-line bg-surface-muted text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Medicine</th>
                <th scope="col" className="hidden w-[20%] px-4 py-2.5 font-medium lg:table-cell">Location</th>
                <th scope="col" className="w-[34%] px-4 py-2.5 font-medium sm:w-[22%]">Sellable stock</th>
                <th scope="col" className="hidden w-[20%] px-4 py-2.5 font-medium md:table-cell">Nearest expiry</th>
                <th scope="col" className="hidden w-[12%] px-4 py-2.5 text-right font-medium xl:table-cell">Price</th>
                <th scope="col" className="w-10 px-2 py-2.5"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((row) => (
                <tr key={row.medicine.id} className="group hover:bg-surface-muted">
                  <td className="px-4 py-3 align-top">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.medicine.id)}
                      className="block w-full min-w-0 text-left"
                    >
                      <span className="block truncate font-medium text-ink group-hover:text-accent-ink">
                        {row.medicine.name}
                        {row.medicine.strength ? <span className="font-normal text-muted"> {row.medicine.strength}</span> : null}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-muted">
                        <span className="truncate">
                          {[DOSAGE_FORM_LABELS[row.medicine.dosageForm], row.medicine.genericName].filter(Boolean).join(' · ')}
                        </span>
                        {row.medicine.requiresPrescription ? <Badge tone="info">Rx</Badge> : null}
                      </span>
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 align-top text-[13px] text-ink-soft lg:table-cell">
                    {formatLocation(row.medicine) ?? <span className="text-muted">Not set</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="tabular font-medium text-ink">
                      {row.sellable.toLocaleString()} <span className="font-normal text-muted">{row.medicine.unit}</span>
                    </p>
                    <div className="mt-1"><StockBadge status={row.stock} /></div>
                  </td>
                  <td className="hidden px-4 py-3 align-top md:table-cell">
                    {row.nearest ? (
                      <>
                        <p className="text-ink-soft">{formatDate(row.nearest.expiryDate)}</p>
                        <div className="mt-1"><ExpiryBadge status={row.nearestStatus} daysLeft={row.nearestDaysLeft} /></div>
                      </>
                    ) : (
                      <span className="text-muted">No stock</span>
                    )}
                  </td>
                  <td className="tabular hidden px-4 py-3 text-right align-top text-ink-soft xl:table-cell">
                    {row.nearest ? money(row.nearest.sellingPriceMinor) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-2 py-3 align-top">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.medicine.id)}
                      aria-label={`Open ${row.medicine.name}`}
                      className="rounded p-1 text-muted hover:bg-accent-soft hover:text-accent-ink"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {visible.length > 0 ? (
          <p className="border-t border-line px-4 py-2.5 text-[13px] text-muted">
            Showing {visible.length.toLocaleString()} of {rows.length.toLocaleString()} medicines
          </p>
        ) : null}
      </Card>

      {selected ? (
        <MedicineDrawer
          key={selected.id}
          medicine={selected}
          onClose={() => setSelectedId(null)}
          onDeleted={(name) => {
            setSelectedId(null);
            setFlash(`Deleted “${name}”.`);
          }}
        />
      ) : null}
    </>
  );
}
