import { Link } from 'react-router-dom';
import { Cloud, CloudOff, Database, Menu } from 'lucide-react';
import { useRuntime } from '../../app/runtime-context';
import { useCloudSession } from '../../features/cloud/cloud-session-context';

export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { mode } = useRuntime();
  const { user } = useCloudSession();
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="rounded-md border border-line p-2 text-ink-soft hover:bg-surface-muted lg:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>

      <p className="hidden text-sm text-muted sm:block">{today}</p>

      <div className="ml-auto flex min-w-0 items-center gap-2 text-[13px]">
        <span className="hidden h-8 items-center gap-2 whitespace-nowrap sm:inline-flex rounded-md border border-line bg-surface-muted px-3 text-ink-soft">
          <Database className="h-3.5 w-3.5 text-accent-ink" aria-hidden="true" />
          {mode === 'desktop' ? 'Local database' : 'Demo database'}
        </span>
        <Link
          to="/settings"
          className="inline-flex h-8 min-w-0 items-center gap-2 rounded-md border border-line px-3 text-ink-soft hover:bg-surface-muted"
        >
          {user ? (
            <Cloud className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <CloudOff className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          )}
          <span className="truncate">{user ? user.email : 'Cloud: not signed in'}</span>
        </Link>
      </div>
    </header>
  );
}
