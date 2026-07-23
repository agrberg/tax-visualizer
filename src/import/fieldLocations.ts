/**
 * Which printed line id each income field sits on, by tax year.
 *
 * Two tiers, both keyed by a clear 1040-field name:
 *
 *  - `STABLE_FIELD_IDS` — line ids that are the same on every supported 1040 (2019+). One id each.
 *  - `DRIFTING_FIELD_IDS` — fields whose id moves year to year. Each is a sparse list of change-points
 *    sorted **newest-first**; `lineIdForYear` returns the first whose `since` is ≤ the year, so a
 *    recent document — the common case — resolves on the very first check, and adding a new year is a
 *    one-line prepend. A field is listed only at the years it *changes*: e.g. 2023 has no entry
 *    because it matches 2022.
 *
 * No page number is recorded: the importer reads the 1040's own pages in order and matches the first
 * occurrence of an id, so a field is found wherever its line drifted to (e.g. the 2025 deduction on
 * page 2) without being told a page. The importer reads a field by its id for a detected, supported
 * year, and falls back to the stable printed *label* (see `amountAndIdForLabel`) when the year is
 * undetected, older than the earliest change-point, or the id read comes up empty. Because
 * label-anchoring is the fallback, a year we haven't mapped still parses.
 */

export interface FieldDriftPoint {
  id: string;
  /** The first tax year `id` applies to. */
  since: number;
}

export const STABLE_FIELD_IDS = {
  interest: '2b',
  qualifiedDividends: '3a',
  ordinaryDividends: '3b',
  iraDistributions: '4b',
} as const satisfies Record<string, string>;

/**
 * Most recent change first (`since` descending) so a year resolves to the first entry with `since` ≤ year.
 * The most common case is last year's form so we often match on the first check.
 * Add a new year by prepending one change-point; a field is listed only at the years it changes
 */
export const DRIFTING_FIELD_IDS = {
  wages: [
    { since: 2022, id: '1z' },
    { since: 2019, id: '1' },
  ],
  pensions: [
    { since: 2020, id: '5b' },
    { since: 2019, id: '4d' },
  ],
  capitalGain: [
    { since: 2025, id: '7a' },
    { since: 2020, id: '7' },
    { since: 2019, id: '6' },
  ],
  deduction: [
    { since: 2025, id: '12e' }, // technically on page 2; found by first occurrence
    { since: 2022, id: '12' },
    { since: 2021, id: '12a' },
    { since: 2020, id: '12' },
    { since: 2019, id: '9' },
  ],
} as const satisfies Record<string, FieldDriftPoint[]>;

export type DriftingField = keyof typeof DRIFTING_FIELD_IDS;

/** Years before this predate the id map, so reads for them fall back to the printed label (see
 *  `amountAndIdForLabel`). */
export const EARLIEST_MAPPED_YEAR = Math.min(
  ...Object.values(DRIFTING_FIELD_IDS).flatMap((points) => points.map((point) => point.since)),
);

/**
 * The most recent change-point for `year` (`since` ≤ `year`). `null` when `year` predates
 * the field's earliest mapping; fallback to label search
 */
export function lineIdForYear(field: DriftingField, year: number): string | null {
  return DRIFTING_FIELD_IDS[field].find((point) => point.since <= year)?.id ?? null;
}

/**
 * The most recent line id for a field. Used by the wages reader as a year-independent fallback
 * when the year is unknown or misdetected, the modern line's meaning is still stable enough to
 * recover the value without hard-coding the line here
 */
export function currentLineId(field: DriftingField): string {
  return DRIFTING_FIELD_IDS[field][0].id;
}
