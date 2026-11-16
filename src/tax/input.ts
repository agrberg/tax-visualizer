import { ALL_SOURCES, allowsNegativeAmount, coerceDeduction, type TaxInput } from './types';
import { isFilingStatus } from './filingStatus';
import { DEFAULT_TAX_YEAR, isSupportedTaxYear } from './years';

/** The largest magnitude any income or deduction amount can take; larger values clamp to it. */
export const MAX_INPUT_AMOUNT = 1_000_000_000_000;

/**
 * Fill any missing or non-finite income field with 0, and reset an unrecognized
 * filing status to `single`. Input saved before a source existed (e.g. retirement
 * distributions) would otherwise carry `undefined`, which renders as "undefined" in
 * the form and breaks the math; a hand-edited or corrupted filing status would have
 * no bracket table and crash the engine on load. Input saved before multi-year
 * support (or with a dropped/unsupported year) falls back to the default year.
 *
 * Enforces the per-field sign rule (`allowsNegativeAmount`): the capital-gains fields carry a
 * real sign (a loss) that the engine nets (see `nettedCapitalGains`); every other field is
 * clamped to ≥0, so a corrupted or hand-edited store can't reload a negative wage into the
 * form. Every amount is rounded to whole dollars and clamped to `MAX_INPUT_AMOUNT`, so a
 * fractional or astronomically large stored or shared value can't reach the engine.
 *
 * The one sanitizer behind every input boundary: storage, share links, and 1040 import.
 */
export function normalizeInput(input: TaxInput): TaxInput {
  const normalized = { ...input };
  for (const source of ALL_SOURCES) {
    const n = normalized[source];
    if (!Number.isFinite(n)) normalized[source] = 0;
    else {
      const min = allowsNegativeAmount(source) ? -MAX_INPUT_AMOUNT : 0;
      // `+ 0` turns the -0 that Math.round gives for (-0.5, 0) into 0.
      normalized[source] = Math.min(MAX_INPUT_AMOUNT, Math.max(min, Math.round(n))) + 0;
    }
  }
  if (!isFilingStatus(normalized.filingStatus)) {
    normalized.filingStatus = 'single';
  }
  if (!isSupportedTaxYear(normalized.taxYear)) {
    normalized.taxYear = DEFAULT_TAX_YEAR;
  }
  // Old saved data won't have this field; treat missing/invalid as null (standard deduction).
  const rawDed = (normalized as { deduction?: number | null }).deduction;
  const deduction = coerceDeduction(rawDed);
  normalized.deduction = deduction === null ? null : Math.min(MAX_INPUT_AMOUNT, Math.round(deduction));
  return normalized;
}
