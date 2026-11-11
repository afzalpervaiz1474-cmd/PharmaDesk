import { Field, TextInput } from '../../components/ui/Field';
import { daysBetween, isIsoDate } from '../../domain/dates';
import type { BatchFormValues, FieldErrors } from '../../domain/validation';

interface BatchFieldsProps {
  /** Prefix that keeps input ids unique when two batch forms are on screen. */
  idPrefix: string;
  values: BatchFormValues;
  errors: FieldErrors<BatchFormValues>;
  currency: string;
  today: string;
  disabled?: boolean;
  onChange: (field: keyof BatchFormValues, value: string) => void;
}

/** Inputs for one stock batch. Used when registering a medicine and when adding stock. */
export function BatchFields({ idPrefix, values, errors, currency, today, disabled, onChange }: BatchFieldsProps) {
  const id = (field: keyof BatchFormValues) => `${idPrefix}-${field}`;
  const alreadyExpired = isIsoDate(values.expiryDate) && daysBetween(today, values.expiryDate) < 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Batch number" htmlFor={id('batchNumber')} required error={errors.batchNumber}>
        <TextInput
          id={id('batchNumber')}
          value={values.batchNumber}
          onChange={(event) => onChange('batchNumber', event.target.value)}
          invalid={Boolean(errors.batchNumber)}
          disabled={disabled}
          className="font-mono"
          autoComplete="off"
        />
      </Field>
      <Field
        label="Expiry date"
        htmlFor={id('expiryDate')}
        required
        error={errors.expiryDate}
        hint={alreadyExpired ? 'This date has passed. The batch will be recorded as expired.' : undefined}
      >
        <TextInput
          id={id('expiryDate')}
          type="date"
          value={values.expiryDate}
          onChange={(event) => onChange('expiryDate', event.target.value)}
          invalid={Boolean(errors.expiryDate)}
          hasHint={alreadyExpired}
          disabled={disabled}
        />
      </Field>
      <Field label="Quantity (units)" htmlFor={id('quantity')} required error={errors.quantity}>
        <TextInput
          id={id('quantity')}
          inputMode="numeric"
          value={values.quantity}
          onChange={(event) => onChange('quantity', event.target.value)}
          invalid={Boolean(errors.quantity)}
          disabled={disabled}
          autoComplete="off"
        />
      </Field>
      <Field label={`Purchase price per unit (${currency})`} htmlFor={id('purchasePrice')} required error={errors.purchasePrice}>
        <TextInput
          id={id('purchasePrice')}
          inputMode="decimal"
          placeholder="0.00"
          value={values.purchasePrice}
          onChange={(event) => onChange('purchasePrice', event.target.value)}
          invalid={Boolean(errors.purchasePrice)}
          disabled={disabled}
          autoComplete="off"
        />
      </Field>
      <Field label={`Selling price per unit (${currency})`} htmlFor={id('sellingPrice')} required error={errors.sellingPrice}>
        <TextInput
          id={id('sellingPrice')}
          inputMode="decimal"
          placeholder="0.00"
          value={values.sellingPrice}
          onChange={(event) => onChange('sellingPrice', event.target.value)}
          invalid={Boolean(errors.sellingPrice)}
          disabled={disabled}
          autoComplete="off"
        />
      </Field>
      <Field label="Received on" htmlFor={id('receivedAt')} error={errors.receivedAt}>
        <TextInput
          id={id('receivedAt')}
          type="date"
          max={today}
          value={values.receivedAt}
          onChange={(event) => onChange('receivedAt', event.target.value)}
          invalid={Boolean(errors.receivedAt)}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}
