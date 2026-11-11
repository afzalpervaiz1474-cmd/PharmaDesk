import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface-muted text-ink-soft',
  info: 'border-accent-line bg-accent-soft text-accent-ink',
  success: 'border-transparent bg-success-soft text-success',
  warning: 'border-transparent bg-warning-soft text-warning',
  danger: 'border-transparent bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium leading-4',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Marks a feature that is designed but not built yet. */
export function PlannedBadge() {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded border border-dashed border-line-strong px-1.5 py-0.5 text-[11px] font-medium uppercase leading-4 tracking-wide text-muted">
      Planned
    </span>
  );
}
