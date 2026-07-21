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
 * year, and falls back to the stable printed *label* (see `amountForLabel`) when the year is
 * undetected, older than the earliest change-point, or the id read comes up empty. Because
 * label-anchoring is the fallback, a year we haven't mapped still parses.
 */

/** A drifting field's line id together with the first tax year it applies to. */
export interface FieldDriftPoint {
  id: string;
  since: number;
}

/** Fields whose line id never drifts across the supported window — read straight by id. */
export const STABLE_FIELD_IDS = {
  interest: '2b',
  qualifiedDividends: '3a',
  ordinaryDividends: '3b',
  iraDistributions: '4b',
} as const satisfies Record<string, string>;

/**
 * Fields whose id drifts. Each list is sorted **newest-first** (by `since` descending); resolve a
 * year to the first entry with `since` ≤ year. Add a new year by prepending one change-point.
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
    { since: 2025, id: '12e' }, // moved to page 2 in the 2025 redesign; found by first occurrence
    { since: 2022, id: '12' },
    { since: 2021, id: '12a' },
    { since: 2020, id: '12' },
    { since: 2019, id: '9' },
  ],
} as const satisfies Record<string, FieldDriftPoint[]>;

export type DriftingField = keyof typeof DRIFTING_FIELD_IDS;

/**
 * The earliest tax year any drifting field is mapped for; years before this fall back to label reads.
 * Derived from the map (the oldest change-point) so it can't drift out of sync — prepend a pre-2019
 * change-point and this moves with it.
 */
export const EARLIEST_MAPPED_YEAR = Math.min(
  ...Object.values(DRIFTING_FIELD_IDS).flatMap((points) => points.map((point) => point.since)),
);

/**
 * The printed line id a drifting field sits on for a given tax year — the first (newest) change-point
 * whose `since` is ≤ `year` — or `null` when `year` predates the field's earliest mapping (caller
 * falls back to the printed label). `year` is assumed already validated as a real detected year.
 */
export function lineIdForYear(field: DriftingField, year: number): string | null {
  for (const point of DRIFTING_FIELD_IDS[field]) {
    if (point.since <= year) return point.id;
  }
  return null;
}

/**
 * The current (newest) line id for a drifting field — the first change-point, since the lists are
 * sorted newest-first. Lets a caller reach the field's modern/expected line without hard-coding it, so
 * a future form change is a one-line prepend to the map above and nothing else moves.
 */
export function currentLineId(field: DriftingField): string {
  return DRIFTING_FIELD_IDS[field][0].id;
}
