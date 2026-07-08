import type { FilingStatus } from './types'

/**
 * Filing-status runtime values — the display labels, canonical order, and validity
 * guard. These are structural to the app (unlike the yearly tax figures in years/),
 * change rarely, and are shared across the form, storage, and share-link paths, so
 * they live together here rather than beside any one year's tables.
 */

/** All filing statuses in canonical display order (drives the form dropdown). */
export const FILING_STATUSES: FilingStatus[] = ['single', 'mfj', 'hoh', 'mfs']

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  mfj: 'Married filing jointly',
  hoh: 'Head of household',
  mfs: 'Married filing separately',
}

/**
 * Runtime guard for a valid filing status. Uses an own-property check so inherited
 * `Object.prototype` keys (e.g. "toString", "constructor") are rejected — `in` would
 * accept them, and the bad key would then crash the bracket lookup. Shared by the
 * localStorage and share-link input paths so both validate identically.
 */
export function isFilingStatus(value: unknown): value is FilingStatus {
  return typeof value === 'string' && Object.hasOwn(FILING_STATUS_LABELS, value)
}
