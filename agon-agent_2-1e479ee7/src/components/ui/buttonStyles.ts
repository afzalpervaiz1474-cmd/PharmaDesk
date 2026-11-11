import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-primary text-primary-ink hover:bg-primary-hover',
  secondary: 'border-line-strong bg-surface text-ink hover:bg-surface-muted',
  ghost: 'border-transparent bg-transparent text-ink-soft hover:bg-accent-soft hover:text-accent-ink',
  danger: 'border-transparent bg-danger text-white hover:brightness-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-10 gap-2 px-4 text-sm',
};

/** Shared look for <Button> and for links that should read as buttons. */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border font-medium',
    'transition-colors disabled:cursor-not-allowed disabled:opacity-55',
    SIZES[size],
    VARIANTS[variant],
    extra,
  );
}
