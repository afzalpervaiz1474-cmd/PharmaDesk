import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

interface StatCardProps {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: LucideIcon;
  /** Highlights the card when it needs attention. */
  tone?: 'default' | 'warning' | 'danger';
}

const ICON_TONES = {
  default: 'bg-accent-soft text-accent-ink',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
} as const;

export function StatCard({ label, value, detail, icon: Icon, tone = 'default' }: StatCardProps) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[13px] font-medium text-muted">{label}</h2>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', ICON_TONES[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="tabular mt-2 break-words text-[28px] font-semibold leading-tight tracking-tight text-ink">{value}</p>
      <p className="mt-1.5 text-[13px] text-muted">{detail}</p>
    </section>
  );
}
