import { describe, it, expect } from 'vitest';
import { taxTablesFor, isSupportedTaxYear, DEFAULT_TAX_YEAR } from './years';

// This spec covers only the year registry — lookup and the supported-year guard. Cross-year
// calculation (that each year's tables produce the right tax) lives in calculate.test.ts, next to
// the engine that owns the arithmetic.

describe('taxTablesFor', () => {
  it('returns the requested year', () => {
    expect(taxTablesFor(2025).year).toBe(2025);
    expect(taxTablesFor(2026).year).toBe(2026);
  });

  it('falls back to the default year for an unsupported year', () => {
    expect(taxTablesFor(1999).year).toBe(DEFAULT_TAX_YEAR);
  });
});

describe('isSupportedTaxYear', () => {
  it('accepts supported years and rejects everything else', () => {
    expect(isSupportedTaxYear(2026)).toBe(true);
    expect(isSupportedTaxYear(2019)).toBe(true);
    expect(isSupportedTaxYear(1999)).toBe(false);
    expect(isSupportedTaxYear('2026')).toBe(false);
    expect(isSupportedTaxYear(undefined)).toBe(false);
  });
});
