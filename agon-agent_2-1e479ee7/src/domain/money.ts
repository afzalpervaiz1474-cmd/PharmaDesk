/**
 * Money helpers. Amounts are integer minor units; v0.1 supports currencies
 * with two decimal places only.
 */

const MONEY_INPUT = /^\d{1,9}(\.\d{1,2})?$/;

/**
 * Parses user input such as "12", "12.5" or "12.50" into minor units.
 * Returns null for anything else. Commas are rejected on purpose: "12,50"
 * means 12.50 in some locales and 1250 in others, so guessing is unsafe.
 */
export function parseMoneyToMinor(input: string): number | null {
  const text = input.trim();
  if (!MONEY_INPUT.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function minorToInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function formatMoney(minor: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}
