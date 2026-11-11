import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

/** Label, control, hint and error message as one unit. */
export function Field({ label, htmlFor, required = false, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-soft">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  'block w-full min-w-0 rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 ' +
  'transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted';

function controlClasses(invalid: boolean | undefined, extra?: string): string {
  return cn(CONTROL, invalid ? 'border-danger' : 'border-line-strong', extra);
}

/** Wires aria-invalid / aria-describedby to the surrounding <Field>. */
function describe(id: string | undefined, invalid: boolean | undefined, hasHint: boolean | undefined) {
  return {
    'aria-invalid': invalid || undefined,
    'aria-describedby': id ? (invalid ? `${id}-error` : hasHint ? `${id}-hint` : undefined) : undefined,
  };
}

interface ControlExtras {
  invalid?: boolean;
  hasHint?: boolean;
}

export function TextInput({
  invalid,
  hasHint,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & ControlExtras) {
  return (
    <input className={controlClasses(invalid, cn('h-10', className))} {...describe(rest.id, invalid, hasHint)} {...rest} />
  );
}

export function Select({
  invalid,
  hasHint,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & ControlExtras) {
  return (
    <select
      className={controlClasses(invalid, cn('h-10 pr-8', className))}
      {...describe(rest.id, invalid, hasHint)}
      {...rest}
    >
      {children}
    </select>
  );
}

export function TextArea({
  invalid,
  hasHint,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & ControlExtras) {
  return (
    <textarea
      className={controlClasses(invalid, cn('py-2 leading-relaxed', className))}
      {...describe(rest.id, invalid, hasHint)}
      {...rest}
    />
  );
}
