import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';

type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<NoticeTone, { box: string; icon: typeof Info }> = {
  info: { box: 'border-accent-line bg-accent-soft text-accent-ink', icon: Info },
  success: { box: 'border-transparent bg-success-soft text-success', icon: CircleCheck },
  warning: { box: 'border-transparent bg-warning-soft text-warning', icon: TriangleAlert },
  danger: { box: 'border-transparent bg-danger-soft text-danger', icon: CircleAlert },
};

interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Inline message. Errors and warnings are announced to screen readers. */
export function Notice({ tone = 'info', title, children, action, className }: NoticeProps) {
  const Icon = TONES[tone].icon;
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-md border px-4 py-3 text-sm', TONES[tone].box, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn('break-words text-ink-soft', title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
