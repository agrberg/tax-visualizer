import { describe, it, expect } from 'vitest';
import { normalizeInput, MAX_INPUT_AMOUNT } from './input';
import type { TaxInput } from './types';
import { makeInput } from './testUtils';

describe('normalizeInput', () => {
  it('fills a field missing from older saved input with 0', () => {
    // Input persisted before retirementIncome existed.
    const stale = { filingStatus: 'single', wages: 50000, interest: 2000 } as unknown as TaxInput;
    const normalized = normalizeInput(stale);
    expect(normalized.retirementIncome).toBe(0);
    expect(normalized.wages).toBe(50000);
    expect(normalized.interest).toBe(2000);
    expect(normalized.longTermGains).toBe(0);
    expect(normalized.filingStatus).toBe('single');
  });

  it('coerces non-finite amounts to 0 and leaves valid ones untouched', () => {
    const dirty = { filingStatus: 'mfj', wages: NaN, longTermGains: 15000 } as unknown as TaxInput;
    const normalized = normalizeInput(dirty);
    expect(normalized.wages).toBe(0);
    expect(normalized.longTermGains).toBe(15000);
  });

  it('preserves negative capital-gains amounts (losses round-trip through storage)', () => {
    // A stored capital loss must survive normalization unchanged so it reaches the engine to be netted.
    const withLosses = {
      filingStatus: 'single',
      shortTermGains: -500,
      longTermGains: -1200,
    } as unknown as TaxInput;
    const normalized = normalizeInput(withLosses);
    expect(normalized.shortTermGains).toBe(-500);
    expect(normalized.longTermGains).toBe(-1200);
  });

  it('clamps a negative non-capital amount to 0 (only capital-gains fields may be signed)', () => {
    // Corrupted or hand-edited localStorage could carry a negative wage; the form would render
    // it back as negative. normalizeInput enforces the same sign rule as the other input
    // boundaries — only the capital-gains fields keep a sign.
    const dirty = { filingStatus: 'single', wages: -500, interest: -20 } as unknown as TaxInput;
    const normalized = normalizeInput(dirty);
    expect(normalized.wages).toBe(0);
    expect(normalized.interest).toBe(0);
  });

  it('coerces an unknown filing status back to single (a bad one would crash the engine)', () => {
    const dirty = { filingStatus: 'xyz', wages: 100000 } as unknown as TaxInput;
    const normalized = normalizeInput(dirty);
    expect(normalized.filingStatus).toBe('single');
  });

  it('rejects inherited Object.prototype keys (regression: `in` would accept "toString")', () => {
    for (const key of ['toString', 'constructor', 'hasOwnProperty']) {
      const dirty = { filingStatus: key } as unknown as TaxInput;
      expect(normalizeInput(dirty).filingStatus).toBe('single');
    }
  });

  it('keeps a valid filing status untouched', () => {
    for (const status of ['single', 'mfj', 'hoh', 'mfs'] as const) {
      expect(normalizeInput({ filingStatus: status } as unknown as TaxInput).filingStatus).toBe(status);
    }
  });

  it('defaults a missing or unsupported tax year to the default year', () => {
    // Input persisted before multi-year support had no taxYear.
    const legacy = { filingStatus: 'single', wages: 50000 } as unknown as TaxInput;
    expect(normalizeInput(legacy).taxYear).toBe(2026);
    const bogus = { filingStatus: 'single', taxYear: 1999 } as unknown as TaxInput;
    expect(normalizeInput(bogus).taxYear).toBe(2026);
  });

  it('keeps a supported tax year untouched', () => {
    const input = { filingStatus: 'single', taxYear: 2025 } as unknown as TaxInput;
    expect(normalizeInput(input).taxYear).toBe(2025);
  });

  it('rounds fractional amounts to whole dollars', () => {
    expect(normalizeInput(makeInput({ wages: 1.5, longTermGains: -2.4 }))).toMatchObject({
      wages: 2,
      longTermGains: -2,
    });
  });

  it('turns a fraction that rounds to negative zero into plain 0', () => {
    const n = normalizeInput(makeInput({ longTermGains: -0.4 }));
    expect(Object.is(n.longTermGains, 0)).toBe(true);
  });

  it('clamps amounts to the supported range', () => {
    const n = normalizeInput(makeInput({ wages: 1e308, shortTermGains: -1e308, deduction: 1e308 }));
    expect(n.wages).toBe(MAX_INPUT_AMOUNT);
    expect(n.shortTermGains).toBe(-MAX_INPUT_AMOUNT);
    expect(n.deduction).toBe(MAX_INPUT_AMOUNT);
  });
});

describe('normalizeInput — deduction field', () => {
  it('passes null through unchanged (standard deduction mode)', () => {
    const r = normalizeInput({ filingStatus: 'single', taxYear: 2026, deduction: null } as unknown as TaxInput);
    expect(r.deduction).toBeNull();
  });

  it('normalizes a missing deduction field (old saved data) to null', () => {
    const legacy = { filingStatus: 'single', taxYear: 2026 } as unknown as TaxInput;
    expect(normalizeInput(legacy).deduction).toBeNull();
  });

  it('passes a valid positive custom deduction through unchanged', () => {
    const r = normalizeInput({ filingStatus: 'single', taxYear: 2026, deduction: 25000 } as unknown as TaxInput);
    expect(r.deduction).toBe(25000);
  });

  it('treats a negative deduction as null (falls back to standard)', () => {
    const r = normalizeInput({ filingStatus: 'single', taxYear: 2026, deduction: -500 } as unknown as TaxInput);
    expect(r.deduction).toBeNull();
  });

  it('treats a non-finite deduction as null', () => {
    const nan = normalizeInput({ filingStatus: 'single', taxYear: 2026, deduction: NaN } as unknown as TaxInput);
    const inf = normalizeInput({ filingStatus: 'single', taxYear: 2026, deduction: Infinity } as unknown as TaxInput);
    expect(nan.deduction).toBeNull();
    expect(inf.deduction).toBeNull();
  });

  it('rounds a fractional custom deduction to whole dollars', () => {
    const r = normalizeInput({ filingStatus: 'single', taxYear: 2026, deduction: 1234.5 } as unknown as TaxInput);
    expect(r.deduction).toBe(1235);
  });

  it('treats deduction of 0 as a valid custom value (explicit zero deduction)', () => {
    const r = normalizeInput({ filingStatus: 'single', taxYear: 2026, deduction: 0 } as unknown as TaxInput);
    expect(r.deduction).toBe(0);
  });
});
