import { describe, it, expect } from 'vitest';
import { taxTablesFor, isSupportedTaxYear, DEFAULT_TAX_YEAR, AVAILABLE_YEARS } from './years';
import { FILING_STATUSES } from './filingStatus';

// This spec covers the year registry (lookup and the supported-year guard) and the structural
// invariants every year's tables must satisfy. Cross-year calculation (that each year's tables
// produce the right tax) lives in calculate.test.ts, next to the engine that owns the arithmetic.

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

describe.each(AVAILABLE_YEARS)('tax tables for %i', (year) => {
  const tables = taxTablesFor(year);

  it('is registered under its own year', () => {
    expect(tables.year).toBe(year);
  });

  it('keeps the statutory relationships between filing statuses', () => {
    const { standardDeduction } = tables;
    expect(standardDeduction.mfj).toBe(standardDeduction.single * 2);
    expect(standardDeduction.mfs).toBe(standardDeduction.single);
    expect(standardDeduction.hoh).toBeGreaterThan(standardDeduction.single);
    expect(standardDeduction.hoh).toBeLessThan(standardDeduction.mfj);

    // Both surcharge thresholds are fixed by statute, unindexed: HoH matches single, MFS is half of MFJ.
    for (const { threshold } of [tables.niit, tables.additionalMedicare]) {
      expect(threshold.hoh).toBe(threshold.single);
      expect(threshold.mfj).toBeGreaterThan(threshold.single);
      expect(threshold.mfs).toBe(threshold.mfj / 2);
    }
  });

  describe.each(FILING_STATUSES)('%s', (status) => {
    const brackets = tables.ordinaryBrackets[status];

    it('has contiguous, increasing ordinary brackets from 0 to Infinity', () => {
      expect(brackets[0].min).toBe(0);
      brackets.forEach((bracket, i) => {
        expect(bracket.min).toBeLessThan(bracket.max);
        if (i > 0) {
          expect(bracket.min).toBe(brackets[i - 1].max);
          expect(bracket.rate).toBeGreaterThan(brackets[i - 1].rate);
        }
      });
      expect(brackets[brackets.length - 1].max).toBe(Infinity);
    });

    it('has ordered capital-gains breakpoints', () => {
      const { rate0Max, rate15Max } = tables.capitalGains.breakpoints[status];
      expect(rate0Max).toBeGreaterThan(0);
      expect(rate15Max).toBeGreaterThan(rate0Max);
    });

    it('has a positive standard deduction and surcharge thresholds', () => {
      expect(tables.standardDeduction[status]).toBeGreaterThan(0);
      expect(tables.niit.threshold[status]).toBeGreaterThan(0);
      expect(tables.additionalMedicare.threshold[status]).toBeGreaterThan(0);
    });
  });
});
