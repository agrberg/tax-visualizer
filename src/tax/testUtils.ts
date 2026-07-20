import type { TaxInput } from './types';

/**
 * Build a full `TaxInput` for tests from partial overrides. Defaults to a single filer in 2026
 * with every income field zeroed; specs override only what they exercise. Specs that need a
 * different baseline (e.g. a 2025 year or an MFJ filer) wrap this with their own defaults.
 */
export function makeInput(overrides: Partial<TaxInput> = {}): TaxInput {
  return {
    filingStatus: 'single',
    taxYear: 2026,
    wages: 0,
    retirementIncome: 0,
    interest: 0,
    nonQualifiedDividends: 0,
    shortTermGains: 0,
    qualifiedDividends: 0,
    longTermGains: 0,
    deduction: null,
    ...overrides,
  };
}
