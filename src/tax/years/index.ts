import type { TaxYearTables } from '../types';
import { TAX_YEAR_2019 } from './2019';
import { TAX_YEAR_2020 } from './2020';
import { TAX_YEAR_2021 } from './2021';
import { TAX_YEAR_2022 } from './2022';
import { TAX_YEAR_2023 } from './2023';
import { TAX_YEAR_2024 } from './2024';
import { TAX_YEAR_2025 } from './2025';
import { TAX_YEAR_2026 } from './2026';

/**
 * Every supported tax year, keyed by year. Add a new year by dropping in its file and
 * registering it here; `AVAILABLE_YEARS` is derived from these keys, so it surfaces in the
 * picker automatically.
 *
 * Typed as a total `Record<number, …>` even though only a sparse set of years exists:
 * every read goes through `taxTablesFor`, which falls back to the default year, and every
 * externally-supplied year is validated by `isSupportedTaxYear` at the storage / share-link boundary.
 * A precise key union would buy no real safety — an out-of-range year can only arrive by
 * hand-editing storage or the URL, and those paths are already guarded — so the looser type
 * is kept for the simpler call sites.
 */
export const TAX_YEARS: Record<number, TaxYearTables> = {
  2019: TAX_YEAR_2019,
  2020: TAX_YEAR_2020,
  2021: TAX_YEAR_2021,
  2022: TAX_YEAR_2022,
  2023: TAX_YEAR_2023,
  2024: TAX_YEAR_2024,
  2025: TAX_YEAR_2025,
  2026: TAX_YEAR_2026,
};

/**
 * Selectable years, newest first — drives the dropdown order. Derived from the registry so it
 * can't drift out of sync: every year with tables is offered. Integer object keys always iterate
 * ascending regardless of literal order, so sort descending explicitly for newest-first display.
 */
export const AVAILABLE_YEARS: readonly number[] = Object.keys(TAX_YEARS)
  .map(Number)
  .sort((a, b) => b - a);

/** Year used when none is specified or a stored/shared year is unrecognized. */
export const DEFAULT_TAX_YEAR = 2026;

/** Runtime guard for a supported tax year. Own-property check mirrors isFilingStatus. */
export function isSupportedTaxYear(value: unknown): value is number {
  return typeof value === 'number' && Object.hasOwn(TAX_YEARS, value);
}

/** Tables for a year, falling back to the default year for anything unrecognized. */
export function taxTablesFor(year: number): TaxYearTables {
  return TAX_YEARS[year] ?? TAX_YEARS[DEFAULT_TAX_YEAR];
}
