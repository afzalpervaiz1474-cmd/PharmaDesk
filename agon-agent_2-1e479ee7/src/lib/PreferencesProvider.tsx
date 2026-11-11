import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { CURRENCIES, DEFAULT_CURRENCY, PreferencesContext } from './preferences-context';

const STORAGE_KEY = 'pharmadesk.preferences.v1';

function readStoredCurrency(): string {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { currency?: unknown };
    if (typeof stored.currency === 'string' && (CURRENCIES as readonly string[]).includes(stored.currency)) {
      return stored.currency;
    }
  } catch {
    // Unreadable preferences fall back to defaults.
  }
  return DEFAULT_CURRENCY;
}

/** Device-level display preferences, kept in localStorage. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<string>(readStoredCurrency);

  const setCurrency = useCallback((next: string) => {
    if (!(CURRENCIES as readonly string[]).includes(next)) return;
    setCurrencyState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ currency: next }));
    } catch {
      // Storage may be unavailable; the choice still applies for this session.
    }
  }, []);

  const value = useMemo(() => ({ currency, setCurrency }), [currency, setCurrency]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
