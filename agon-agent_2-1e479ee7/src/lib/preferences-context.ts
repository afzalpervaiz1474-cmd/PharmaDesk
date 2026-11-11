import { createContext, useContext } from 'react';
import { formatMoney } from '../domain/money';

/** Currencies offered in Settings. All use two decimal places. */
export const CURRENCIES = ['INR', 'PKR', 'BDT', 'LKR', 'NPR', 'AED', 'SAR', 'USD', 'EUR', 'GBP'] as const;
export const DEFAULT_CURRENCY = 'INR';

export interface PreferencesContextValue {
  currency: string;
  setCurrency: (currency: string) => void;
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return value;
}

/** Returns a formatter for minor-unit amounts in the store's currency. */
export function useMoney(): (minor: number) => string {
  const { currency } = usePreferences();
  return (minor: number) => formatMoney(minor, currency);
}
