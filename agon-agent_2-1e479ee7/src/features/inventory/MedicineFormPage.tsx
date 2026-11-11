import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { Card } from '../../components/ui/Card';
import { EmptyState, SkeletonRows } from '../../components/ui/EmptyState';
import { Field, Select, TextArea, TextInput } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { PageHeader } from '../../components/ui/PageHeader';
import { ConflictError, describeError, InvalidInputError } from '../../data/errors';
import { todayIso } from '../../domain/dates';
import { DOSAGE_FORM_LABELS, DOSAGE_FORMS, type MedicineWithBatches } from '../../domain/types';
import {
  EMPTY_BATCH_FORM,
  EMPTY_MEDICINE_FORM,
  validateBatchForm,
  validateMedicineForm,
  type BatchFormValues,
  type FieldErrors,
  type MedicineFormValues,
} from '../../domain/validation';
import { usePreferences } from '../../lib/preferences-context';
import { BatchFields } from './BatchFields';
import { useInventory } from './inventory-context';

function toFormValues(medicine: MedicineWithBatches): MedicineFormValues {
  return {
    name: medicine.name,
    genericName: medicine.genericName ?? '',
    manufacturer: medicine.manufacturer ?? '',
    dosageForm: medicine.dosageForm,
    strength: medicine.strength ?? '',
    unit: medicine.unit,
    barcode: medicine.barcode ?? '',
    requiresPrescription: medicine.requiresPrescription,
    reorderLevel: String(medicine.reorderLevel),
    rack: medicine.rack ?? '',
    shelf: medicine.shelf ?? '',
    drawer: medicine.drawer ?? '',
    notes: medicine.notes ?? '',
  };
}

/** Route component: resolves which medicine (if any) is being edited. */
export function MedicineFormPage() {
  const { medicineId } = useParams();
  const { medicines, loading } = useInventory();

  if (!medicineId) return <MedicineForm key="new" existing={null} />;

  const existing = medicines.find((medicine) => medicine.id === medicineId);
  if (existing) return <MedicineForm key={existing.id} existing={existing} />;

  return (
    <Card>
      {loading ? (
        <SkeletonRows rows={6} />
      ) : (
        <EmptyState
          title="Medicine not found"
          action={
            <Link to="/inventory" className={buttonClasses('secondary')}>
              Back to medicines
            </Link>
          }
        >
          It may have been removed.
        </EmptyState>
      )}
    </Card>
  );
}

function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-8 gap-y-4 border-b border-line px-5 py-6 last:border-b-0 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-[13px] text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function MedicineForm({ existing }: { existing: MedicineWithBatches | null }) {
  const navigate = useNavigate();
  const { createMedicine, updateMedicine } = useInventory();
  const { currency } = usePreferences();
  const today = useMemo(() => todayIso(), []);
  const isEdit = existing !== null;

  const [values, setValues] = useState<MedicineFormValues>(existing ? toFormValues(existing) : EMPTY_MEDICINE_FORM);
  const [errors, setErrors] = useState<FieldErrors<MedicineFormValues>>({});
  const [withBatch, setWithBatch] = useState(!isEdit);
  const [batchValues, setBatchValues] = useState<BatchFormValues>(EMPTY_BATCH_FORM);
  const [batchErrors, setBatchErrors] = useState<FieldErrors<BatchFormValues>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setField = <K extends keyof MedicineFormValues>(field: K, value: MedicineFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const text = (field: Exclude<keyof MedicineFormValues, 'requiresPrescription'>) => ({
    id: `medicine-${field}`,
    value: values[field],
    invalid: Boolean(errors[field]),
    disabled: submitting,
    onChange: (event: { target: { value: string } }) => setField(field, event.target.value),
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    const medicineResult = validateMedicineForm(values);
    const batchResult = !isEdit && withBatch ? validateBatchForm(batchValues, today) : null;
    setErrors(medicineResult.ok ? {} : medicineResult.errors);
    setBatchErrors(batchResult && !batchResult.ok ? batchResult.errors : {});

    if (!medicineResult.ok || (batchResult && !batchResult.ok)) {
      setSubmitError('Some fields need attention. Check the messages below.');
      return;
    }

    setSubmitting(true);
    try {
      if (existing) {
        await updateMedicine(existing.id, medicineResult.value);
        navigate('/inventory', { state: { flash: `Saved changes to “${medicineResult.value.name}”.` } });
      } else {
        const created = await createMedicine(medicineResult.value, batchResult ? batchResult.value : null);
        navigate('/inventory', { state: { flash: `Registered “${created.name}”.` } });
      }
    } catch (error) {
      if (error instanceof ConflictError && error.field === 'barcode') {
        setErrors((current) => ({ ...current, barcode: error.message }));
      } else if (error instanceof ConflictError && error.field === 'batchNumber') {
        setBatchErrors((current) => ({ ...current, batchNumber: error.message }));
      } else if (error instanceof InvalidInputError) {
        setErrors((current) => ({ ...current, ...(error.fieldErrors as FieldErrors<MedicineFormValues>) }));
      }
      setSubmitError(describeError(error));
      setSubmitting(false);
    }
  };

  return (
    <>
      <Link to="/inventory" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Medicines
      </Link>
      <PageHeader
        title={isEdit ? `Edit ${existing.name}` : 'Register medicine'}
        description={
          isEdit
            ? 'Update the product details and storage location. Stock batches are managed from the medicine panel.'
            : 'Add a product to the inventory. Fields marked * are required.'
        }
      />

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        {submitError ? (
          <Notice tone="danger" className="mb-4">
            {submitError}
          </Notice>
        ) : null}

        <Card>
          <FormSection title="Product" description="How the medicine is identified at the counter.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Medicine name" htmlFor="medicine-name" required error={errors.name} className="sm:col-span-2">
                <TextInput {...text('name')} autoComplete="off" autoFocus={!isEdit} />
              </Field>
              <Field label="Generic name" htmlFor="medicine-genericName" error={errors.genericName}>
                <TextInput {...text('genericName')} autoComplete="off" />
              </Field>
              <Field label="Manufacturer" htmlFor="medicine-manufacturer" error={errors.manufacturer}>
                <TextInput {...text('manufacturer')} autoComplete="off" />
              </Field>
              <Field label="Dosage form" htmlFor="medicine-dosageForm" required error={errors.dosageForm}>
                <Select {...text('dosageForm')}>
                  {DOSAGE_FORMS.map((form) => (
                    <option key={form} value={form}>
                      {DOSAGE_FORM_LABELS[form]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Strength" htmlFor="medicine-strength" error={errors.strength}>
                <TextInput {...text('strength')} placeholder="e.g. 500 mg" autoComplete="off" />
              </Field>
              <Field
                label="Selling unit"
                htmlFor="medicine-unit"
                required
                error={errors.unit}
                hint="What one unit of stock is: strip, bottle, tube…"
              >
                <TextInput {...text('unit')} hasHint autoComplete="off" />
              </Field>
              <Field label="Barcode" htmlFor="medicine-barcode" error={errors.barcode}>
                <TextInput {...text('barcode')} className="font-mono" autoComplete="off" />
              </Field>
              <label className="flex items-start gap-3 text-sm text-ink-soft sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-line-strong accent-primary"
                  checked={values.requiresPrescription}
                  disabled={submitting}
                  onChange={(event) => setField('requiresPrescription', event.target.checked)}
                />
                <span>
                  Prescription required
                  <span className="block text-[13px] text-muted">Mark medicines that may only be sold against a prescription.</span>
                </span>
              </label>
            </div>
          </FormSection>

          <FormSection title="Storage location" description="Where staff find it in the store. Leave blank if not assigned.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Rack" htmlFor="medicine-rack" error={errors.rack}>
                <TextInput {...text('rack')} autoComplete="off" />
              </Field>
              <Field label="Shelf" htmlFor="medicine-shelf" error={errors.shelf}>
                <TextInput {...text('shelf')} autoComplete="off" />
              </Field>
              <Field label="Drawer" htmlFor="medicine-drawer" error={errors.drawer}>
                <TextInput {...text('drawer')} autoComplete="off" />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Stock rules" description="When the medicine should appear on the reorder list.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Reorder level (units)"
                htmlFor="medicine-reorderLevel"
                required
                error={errors.reorderLevel}
                hint="Flagged as low at or below this. 0 turns the warning off."
                className="sm:col-span-2"
              >
                <TextInput {...text('reorderLevel')} hasHint inputMode="numeric" autoComplete="off" className="sm:max-w-40" />
              </Field>
            </div>
          </FormSection>

          {!isEdit ? (
            <FormSection title="Opening stock" description="Optionally record the first batch now. More batches can be added later.">
              <label className="mb-4 flex items-center gap-3 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line-strong accent-primary"
                  checked={withBatch}
                  disabled={submitting}
                  onChange={(event) => setWithBatch(event.target.checked)}
                />
                Add an opening batch
              </label>
              {withBatch ? (
                <BatchFields
                  idPrefix="opening"
                  values={batchValues}
                  errors={batchErrors}
                  currency={currency}
                  today={today}
                  disabled={submitting}
                  onChange={(field, value) => {
                    setBatchValues((current) => ({ ...current, [field]: value }));
                    setBatchErrors((current) => ({ ...current, [field]: undefined }));
                  }}
                />
              ) : (
                <p className="text-sm text-muted">The medicine will be registered with no stock.</p>
              )}
            </FormSection>
          ) : null}

          <FormSection title="Notes" description="Internal remarks for staff.">
            <Field label="Notes" htmlFor="medicine-notes" error={errors.notes}>
              <TextArea {...text('notes')} rows={3} />
            </Field>
          </FormSection>
        </Card>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Link to="/inventory" className={buttonClasses('secondary')}>
            Cancel
          </Link>
          <Button type="submit" loading={submitting}>
            {isEdit ? 'Save changes' : 'Register medicine'}
          </Button>
        </div>
      </form>
    </>
  );
}
