import { describe, it, expect } from 'vitest';
import { groupRows, parseAmount } from './rows';
import { item } from '../test/importFixtures';

describe('parseAmount', () => {
  it('parses plain and comma-grouped whole dollars', () => {
    expect(parseAmount('1234')).toBe(1234);
    expect(parseAmount('$1,234')).toBe(1234);
    expect(parseAmount('118,000')).toBe(118000);
  });

  it('drops cents', () => {
    expect(parseAmount('2,100.00')).toBe(2100);
    expect(parseAmount('1,234.56')).toBe(1234);
  });

  it('reads negatives from a leading minus or wrapping parentheses', () => {
    expect(parseAmount('-4,000')).toBe(-4000);
    expect(parseAmount('(500)')).toBe(-500);
    expect(parseAmount('(2,500)')).toBe(-2500);
  });

  it('trims surrounding whitespace and reads zero', () => {
    expect(parseAmount('  1,000  ')).toBe(1000);
    expect(parseAmount('$0')).toBe(0);
  });

  it('returns null for tokens without a numeric integer part', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-')).toBeNull();
  });

  it('returns null for a line-id-shaped token with a trailing letter (not an amount)', () => {
    expect(parseAmount('12e')).toBeNull();
    expect(parseAmount('5b')).toBeNull();
  });
});

describe('groupRows', () => {
  it('groups items sharing a baseline (within tolerance) into one row, ordered left-to-right', () => {
    const rows = groupRows([item('interest', 70, 560), item('2b', 40, 561), item('2,100', 520, 559)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].items.map((i) => i.text)).toEqual(['2b', 'interest', '2,100']);
    expect(rows[0].text).toBe('2b interest 2,100');
  });

  it('splits items beyond the baseline tolerance into separate rows, top-to-bottom', () => {
    const rows = groupRows([item('lower', 40, 500), item('upper', 40, 560)]);
    expect(rows.map((r) => r.text)).toEqual(['upper', 'lower']);
  });

  it('keeps items on different pages in different rows', () => {
    const rows = groupRows([item('p2', 40, 560, 2), item('p1', 40, 560, 1)]);
    expect(rows.map((r) => [r.page, r.text])).toEqual([
      [1, 'p1'],
      [2, 'p2'],
    ]);
  });

  it('skips empty-text items', () => {
    const rows = groupRows([item('', 10, 560), item('x', 40, 560)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('x');
  });

  it('joins normalized text and raw originalText independently', () => {
    const rows = groupRows([item('WAGES', 40, 560), item('Salaries', 90, 560)]);
    expect(rows[0].text).toBe('wages salaries');
    expect(rows[0].originalText).toBe('WAGES Salaries');
  });
});
