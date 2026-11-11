import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { APP_VERSION, NAV_GROUPS } from '../../app/navigation';
import { useRuntime } from '../../app/runtime-context';
import { cn } from '../../lib/cn';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { mode } = useRuntime();

  return (
    <>
      {open ? <div className="fixed inset-0 z-30 bg-sidebar/50 lg:hidden" onClick={onClose} aria-hidden="true" /> : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-ink transition-transform duration-200',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-line px-5">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-md ring-1 ring-sidebar-line" />
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-tight">PharmaDesk</p>
              <p className="text-[11px] text-sidebar-muted">Pharmacy management</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded p-1.5 text-sidebar-muted hover:bg-sidebar-raised hover:text-sidebar-ink lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted">
                {group.heading}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                          isActive
                            ? 'bg-sidebar-raised font-medium text-sidebar-ink shadow-[inset_3px_0_0_var(--color-accent)]'
                            : 'text-sidebar-muted hover:bg-sidebar-raised/60 hover:text-sidebar-ink',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.planned ? (
                        <span className="shrink-0 rounded border border-sidebar-line px-1.5 text-[10px] font-medium uppercase leading-4 tracking-wide text-sidebar-muted">
                          Planned
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-sidebar-line px-5 py-4 text-xs text-sidebar-muted">
          <p className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            {mode === 'desktop' ? 'Desktop · local SQLite' : 'Web preview · demo data'}
          </p>
          <p className="mt-1 font-mono text-[11px]">v{APP_VERSION} · early foundation</p>
        </div>
      </aside>
    </>
  );
}
