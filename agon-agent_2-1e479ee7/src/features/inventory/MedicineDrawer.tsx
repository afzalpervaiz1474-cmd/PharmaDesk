import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { Notice } from '../../components/ui/Notice';
import { ConfirmDialog, Drawer } from '../../components/ui/Overlay';
import { ConflictError, describeError } from '../../data/errors';
import { daysBetween, formatDate, todayIso } from '../../domain/dates';
import { expiryStatus, sellableQuantity, stockStatus } from '../../domain/inventory';
import { DOSAGE_FORM_LABELS, formatLocation, type MedicineBatch, type MedicineWithBatches } from '../../domain/types';
import { EMPTY_BATCH_FORM, validateBatchForm, type BatchFormValues, type FieldErrors } from '../../domain/validation';
import { useMoney, usePreferences } from '../../lib/preferences-context';
import { BatchFields } from './BatchFields';
import { useInventory } from './inventory-context';
import { ExpiryBadge, StockBadge } from './StatusBadges';

type PendingDelete = { kind: 'medicine' } | { kind: 'batch'; batch: MedicineBatch };

interface MedicineDrawerProps {
  medicine: MedicineWithBatches;
  onClose: () => void;
  onDeleted: (name: string) => void;
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{value ?? <span className="text-muted">Not set</span>}</dd>
    </div>
  );
}

/** Side panel with a medicine's details and its stock batches. */
export function MedicineDrawer({ medicine, onClose, onDeleted }: MedicineDrawerProps) {
  const { addBatch, deleteBatch, deleteMedicine } = useInventory();
  const { currency } = usePreferences();
  const money = useMoney();
  const today = useMemo(() => todayIso(), []);

  const [adding, setAdding] = useState(false);
  const [batchValues, setBatchValues] = useState<BatchFormValues>(EMPTY_BATCH_FORM);
  const [batchErrors, setBatchErrors] = useState<FieldErrors<BatchFormValues>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sellable = sellableQuantity(medicine.batches, today);

  const handleAddBatch = async (event: FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    const result = validateBatchForm(batchValues, today);
    if (!result.ok) {
      setBatchErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      await addBatch(medicine.id, result.value);
      setBatchValues(EMPTY_BATCH_FORM);
      setBatchErrors({});
      setAdding(false);
    } catch (error) {
      if (error instanceof ConflictError && error.field === 'batchNumber') {
        setBatchErrors({ batchNumber: error.message });
      } else {
        setSaveError(describeError(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (pendingDelete.kind === 'batch') {
        await deleteBatch(pendingDelete.batch.id);
        setPendingDelete(null);
      } else {
        await deleteMedicine(medicine.id);
        onDeleted(medicine.name);
      }
    } catch (error) {
      setDeleteError(describeError(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Drawer
        title={medicine.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {[medicine.genericName, medicine.strength, DOSAGE_FORM_LABELS[medicine.dosageForm]].filter(Boolean).join(' · ')}
            <StockBadge status={stockStatus(medicine, today)} />
            {medicine.requiresPrescription ? <Badge tone="info">Prescription</Badge> : null}
          </span>
        }
        onClose={onClose}
        footer={
          <>
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger-soft hover:text-danger"
              icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              onClick={() => {
                setDeleteError(null);
                setPendingDelete({ kind: 'medicine' });
              }}
            >
              Delete medicine
            </Button>
            <Link to={`/inventory/${medicine.id}/edit`} className={buttonClasses('secondary')}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit details
            </Link>
          </>
        }
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Detail label="Sellable stock" value={`${sellable.toLocaleString()} ${medicine.unit}`} />
          <Detail label="Reorder level" value={medicine.reorderLevel.toLocaleString()} />
          <Detail label="Location" value={formatLocation(medicine)} />
          <Detail label="Manufacturer" value={medicine.manufacturer} />
          <Detail label="Barcode" value={medicine.barcode} />
          <Detail label="Selling unit" value={medicine.unit} />
        </dl>
        {medicine.notes ? (
          <p className="mt-4 whitespace-pre-wrap rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-soft">{medicine.notes}</p>
        ) : null}

        <div className="mt-7 flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-ink">Batches</h3>
          {!adding ? (
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setAdding(true)}>
              Add batch
            </Button>
          ) : null}
        </div>

        {adding ? (
          <form
            onSubmit={(event) => void handleAddBatch(event)}
            noValidate
            className="mt-3 rounded-md border border-accent-line bg-accent-soft/40 p-4"
          >
            <BatchFields
              idPrefix="drawer"
              values={batchValues}
              errors={batchErrors}
              currency={currency}
              today={today}
              disabled={saving}
              onChange={(field, value) => {
                setBatchValues((current) => ({ ...current, [field]: value }));
                setBatchErrors((current) => ({ ...current, [field]: undefined }));
              }}
            />
            {saveError ? (
              <Notice tone="danger" className="mt-4">
                {saveError}
              </Notice>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setAdding(false);
                  setBatchErrors({});
                  setSaveError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={saving}>
                Save batch
              </Button>
            </div>
          </form>
        ) : null}

        {medicine.batches.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
            No batches on record. Add a batch to put this medicine in stock.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line">
            {medicine.batches.map((batch) => {
              const status = expiryStatus(batch.expiryDate, today);
              return (
                <li key={batch.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      <span className="break-all font-mono text-[13px]">{batch.batchNumber}</span>
                      <ExpiryBadge status={status} daysLeft={daysBetween(today, batch.expiryDate)} />
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      Expires {formatDate(batch.expiryDate)} · {batch.quantity.toLocaleString()} {medicine.unit}
                    </p>
                    <p className="tabular mt-0.5 text-[13px] text-muted">
                      Cost {money(batch.purchasePriceMinor)} · Sells at {money(batch.sellingPriceMinor)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 text-muted hover:bg-danger-soft hover:text-danger"
                    aria-label={`Remove batch ${batch.batchNumber}`}
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete({ kind: 'batch', batch });
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Drawer>

      {pendingDelete ? (
        <ConfirmDialog
          title={pendingDelete.kind === 'medicine' ? `Delete ${medicine.name}?` : `Remove batch ${pendingDelete.batch.batchNumber}?`}
          confirmLabel={pendingDelete.kind === 'medicine' ? 'Delete medicine' : 'Remove batch'}
          busy={deleting}
          error={deleteError}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setPendingDelete(null)}
        >
          {pendingDelete.kind === 'medicine'
            ? `This removes the medicine and its ${medicine.batches.length} ${medicine.batches.length === 1 ? 'batch' : 'batches'} from the inventory.`
            : `${pendingDelete.batch.quantity.toLocaleString()} ${medicine.unit} will leave the stock count.`}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
