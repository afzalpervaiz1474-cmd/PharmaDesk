import { useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Info } from 'lucide-react';
import { useRuntime } from '../../app/runtime-context';
import { InventoryProvider } from '../../features/inventory/InventoryProvider';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** Sidebar + top bar frame shared by every screen. */
export function AppShell() {
  const { mode } = useRuntime();
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);

  return (
    <InventoryProvider>
      <Sidebar open={navOpen} onClose={closeNav} />
      <div className="flex min-h-screen min-w-0 flex-col lg:pl-64">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        {mode === 'web-preview' ? (
          <div className="flex items-start gap-2 border-b border-accent-line bg-accent-soft px-4 py-2 text-[13px] text-accent-ink sm:px-6 lg:px-8">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-semibold">Web preview.</span> This runs against a shared demo database of sample
              medicines that any visitor can edit — do not enter real data. The desktop app stores data locally in
              SQLite.
            </p>
          </div>
        ) : null}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="page-in mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </InventoryProvider>
  );
}
