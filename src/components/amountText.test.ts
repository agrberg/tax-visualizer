import { describe, it, expect } from 'vitest';
import { parseAmountText, sanitizeAmountText } from './amountText';

describe('parseAmountText', () => {
  it('treats empty and a lone minus as 0', () => {
    expect(parseAmountText('')).toBe(0);
    expect(parseAmountText('-')).toBe(0);
  });

  it('parses positive and negative whole numbers', () => {
    expect(parseAmountText('100')).toBe(100);
    expect(parseAmountText('-2500')).toBe(-2500);
  });

  it('coerces a non-finite parse (overflowing paste) to 0', () => {
    expect(parseAmountText('1'.repeat(400))).toBe(0); // → Infinity
    expect(parseAmountText('abc')).toBe(0); // → NaN
  });
});

describe('sanitizeAmountText', () => {
  it('strips everything but digits', () => {
    expect(sanitizeAmountText('$1,000.50', false)).toBe('100050');
    expect(sanitizeAmountText('12a3', false)).toBe('123');
  });

  it('keeps a single leading minus only when negatives are allowed', () => {
    expect(sanitizeAmountText('-50', true)).toBe('-50');
    expect(sanitizeAmountText('-50', false)).toBe('50');
  });

  it('collapses interior/extra minuses to a single leading one', () => {
    expect(sanitizeAmountText('-1-2-3', true)).toBe('-123');
    expect(sanitizeAmountText('1-2-3', true)).toBe('123'); // no leading minus → unsigned
  });

  it('preserves a lone minus so a loss can be typed left-to-right', () => {
    expect(sanitizeAmountText('-', true)).toBe('-');
    expect(sanitizeAmountText('-', false)).toBe('');
  });
});
