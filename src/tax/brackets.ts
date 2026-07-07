import type { FilingStatus } from './types'

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
