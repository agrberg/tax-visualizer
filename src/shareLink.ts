import { allowsNegativeAmount, coerceDeduction, type TaxInput } from './tax/types';
import { isFilingStatus } from './tax/filingStatus';
import { DEFAULT_TAX_YEAR, isTaxYear } from './tax/years';

const SHARE_VERSION = '1';

// Short, stable public URL aliases for each numeric field — kept separate from
// the internal TaxInput field names so a future rename can't break old links.
const FIELD_ALIAS = {
  wages: 'wages',
  retirementIncome: 'retire',
  interest: 'interest',
  nonQualifiedDividends: 'nqd',
  shortTermGains: 'stcg',
  qualifiedDividends: 'qd',
  longTermGains: 'ltcg',
} as const;

type NumericField = keyof typeof FIELD_ALIAS;

/** Encode inputs as readable, versioned params: `v=1&filing=mfj&y=2025&wages=…` (zeros omitted). */
export function encodeInput(input: TaxInput): string {
  const params = new URLSearchParams();
  params.set('v', SHARE_VERSION);
  params.set('filing', input.filingStatus);
  params.set('y', String(input.taxYear));
  for (const field of Object.keys(FIELD_ALIAS) as NumericField[]) {
    const value = input[field];
    // Only emit finite values (a non-finite one would serialize to `NaN`/`Infinity` and decode
    // back to 0, silently dropping it): any non-zero signed field (so a capital loss survives),
    // other fields only when > 0.
    const keep = Number.isFinite(value) && (allowsNegativeAmount(field) ? value !== 0 : value > 0);
    if (keep) params.set(FIELD_ALIAS[field], String(value));
  }
  // Omit `ded` for the standard deduction (the default) so old links without the param still
  // decode correctly; emit it only for a valid custom amount (coerceDeduction rejects the
  // negatives/non-finite the decoder would drop anyway, keeping the round-trip invertible).
  const ded = coerceDeduction(input.deduction);
  if (ded !== null) params.set('ded', String(ded));
  return params.toString();
}

/**
 * Decode inputs from the share params. Requires the version marker to match the
 * current SHARE_VERSION (a missing or different version → null, so a link written by
 * a future format isn't silently mis-parsed under the old rules); unknown filing
 * status → null. For the capital-gains fields a finite negative is kept (a shared loss);
 * every other field takes negative / missing / non-numeric → 0 — so a hand-edited or
 * stale link can never inject a bad TaxInput. A missing or unsupported year falls back
 * to the default (older links have no `y`). Null if unusable.
 */
export function decodeInput(encoded: string): TaxInput | null {
  const params = new URLSearchParams(encoded);
  if (params.get('v') !== SHARE_VERSION) return null;
  const filingStatus = params.get('filing');
  if (!isFilingStatus(filingStatus)) return null;
  const year = Number(params.get('y'));
  const input = { filingStatus, taxYear: isTaxYear(year) ? year : DEFAULT_TAX_YEAR } as TaxInput;
  for (const field of Object.keys(FIELD_ALIAS) as NumericField[]) {
    const n = Number(params.get(FIELD_ALIAS[field]));
    const valid = allowsNegativeAmount(field) ? Number.isFinite(n) : Number.isFinite(n) && n > 0;
    input[field] = valid ? n : 0;
  }
  const dedParam = params.get('ded');
  input.deduction = dedParam === null ? null : coerceDeduction(Number(dedParam));
  return input;
}

/** The URL hash fragment that carries a shared input, e.g. `#v=1&filing=mfj&…`. */
export function shareHash(input: TaxInput): string {
  return `#${encodeInput(input)}`;
}

/** Decode a shared input from a URL hash string; null when absent or invalid. */
export function parseShareHash(hash: string): TaxInput | null {
  return decodeInput(hash.replace(/^#/, ''));
}
