import type { TaxYearTables } from '../types'
import { TAX_YEAR_2025 } from './2025'
import { TAX_YEAR_2026 } from './2026'

/**
 * Every supported tax year, keyed by year. Add a new year by dropping in its file here.
 *
 * Typed as a total `Record<number, …>` even though only a sparse set of years exists:
 * every read goes through `taxTablesFor`, which falls back to the default year, and every
 * externally-supplied year is validated by `isTaxYear` at the storage / share-link boundary.
 * A precise key union would buy no real safety — an out-of-range year can only arrive by
 * hand-editing storage or the URL, and those paths are already guarded — so the looser type
 * is kept for the simpler call sites.
 */
export const TAX_YEARS: Record<number, TaxYearTables> = {
  2025: TAX_YEAR_2025,
  2026: TAX_YEAR_2026,
}

/** Selectable years, newest first — drives the dropdown order. */
export const AVAILABLE_YEARS = [2026, 2025] as const

/** Year used when none is specified or a stored/shared year is unrecognized. */
export const DEFAULT_TAX_YEAR = 2026

/** Runtime guard for a supported tax year. Own-property check mirrors isFilingStatus. */
export function isTaxYear(value: unknown): value is number {
  return typeof value === 'number' && Object.hasOwn(TAX_YEARS, value)
}

/** Tables for a year, falling back to the default year for anything unrecognized. */
export function taxTablesFor(year: number): TaxYearTables {
  return TAX_YEARS[year] ?? TAX_YEARS[DEFAULT_TAX_YEAR]
}
