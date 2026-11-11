import { describe, expect, it } from 'vitest';
import { formatMoney, minorToInput, parseMoneyToMinor } from './money';

describe('parseMoneyToMinor', () => {
  it('parses whole and decimal amounts into minor units', () => {
    expect(parseMoneyToMinor('12')).toBe(1200);
    expect(parseMoneyToMinor('12.5')).toBe(1250);
    expect(parseMoneyToMinor(' 0.07 ')).toBe(7);
    expect(parseMoneyToMinor('0')).toBe(0);
  });

  it('avoids floating point drift', () => {
    expect(parseMoneyToMinor('19.99')).toBe(1999);
    expect(parseMoneyToMinor('1.10')).toBe(110);
  });

  it('rejects ambiguous or malformed input instead of guessing', () => {
    for (const input of ['', 'abc', '-5', '12,50', '1,234.50', '1.234', '.5', '5.', '1e3']) {
      expect(parseMoneyToMinor(input)).toBeNull();
    }
  });
});

describe('money formatting', () => {
  it('round-trips through the input format', () => {
    expect(minorToInput(1250)).toBe('12.50');
    expect(parseMoneyToMinor(minorToInput(99))).toBe(99);
  });

  it('formats with the requested currency', () => {
    expect(formatMoney(123450, 'USD', 'en-US')).toBe('$1,234.50');
  });

  it('falls back to a plain format for an unknown currency code', () => {
    expect(formatMoney(500, 'not-a-code')).toBe('not-a-code 5.00');
  });
});
