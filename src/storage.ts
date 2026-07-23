import { ALL_SOURCES, allowsNegativeAmount, coerceDeduction, type TaxInput } from './tax/types';
import { isFilingStatus } from './tax/filingStatus';
import { DEFAULT_TAX_YEAR, isSupportedTaxYear } from './tax/years';
import type { Scenarios } from './scenarios';

const KEY = 'tax-visualizer:input:v1';
const SCENARIOS_KEY = 'tax-visualizer:saved:v1';

/**
 * Fill any missing or non-finite income field with 0, and reset an unrecognized
 * filing status to `single`. Input saved before a source existed (e.g. retirement
 * distributions) would otherwise carry `undefined`, which renders as "undefined" in
 * the form and breaks the math; a hand-edited or corrupted filing status would have
 * no bracket table and crash the engine on load. Input saved before multi-year
 * support (or with a dropped/unsupported year) falls back to the default year.
 *
 * Enforces the per-field sign rule (`allowsNegativeAmount`), the same invariant the other
 * input boundaries apply (`mergeParsedInput`, the share-link decoder): the capital-gains
 * fields carry a real sign (a loss) that the engine nets (see `nettedCapitalGains`); every
 * other field is clamped to ≥0, so a corrupted or hand-edited store can't reload a negative
 * wage into the form.
 */
export function normalizeInput(input: TaxInput): TaxInput {
  const normalized = { ...input };
  for (const source of ALL_SOURCES) {
    const n = normalized[source];
    if (!Number.isFinite(n)) normalized[source] = 0;
    else if (!allowsNegativeAmount(source)) normalized[source] = Math.max(0, n);
  }
  if (!isFilingStatus(normalized.filingStatus)) {
    normalized.filingStatus = 'single';
  }
  if (!isSupportedTaxYear(normalized.taxYear)) {
    normalized.taxYear = DEFAULT_TAX_YEAR;
  }
  // Old saved data won't have this field; treat missing/invalid as null (standard deduction).
  const rawDed = (normalized as { deduction?: number | null }).deduction;
  normalized.deduction = coerceDeduction(rawDed);
  return normalized;
}

export function loadInput(): TaxInput | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeInput(JSON.parse(raw) as TaxInput) : null;
  } catch {
    return null;
  }
}

export function saveInput(input: TaxInput): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function loadScenarios(): Scenarios {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const normalized: Scenarios = {};
    for (const [name, value] of Object.entries(parsed as Scenarios)) {
      normalized[name] = normalizeInput(value);
    }
    return normalized;
  } catch {
    return {};
  }
}

export function saveScenarios(scenarios: Scenarios): void {
  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

/** Remove only this app's persisted keys — used to recover from corrupted saved input. */
export function clearStoredData(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SCENARIOS_KEY);
  } catch (err) {
    // On the recovery path, surface the failure rather than swallowing it silently:
    // if the reset can't clear storage, the reload will hit the same corrupt data.
    console.error('Failed to clear saved tax-visualizer data:', err);
  }
}
