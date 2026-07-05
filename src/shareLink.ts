import type { TaxInput } from './tax/types'
import { FILING_STATUS_LABELS } from './tax/brackets'

const SHARE_VERSION = '1'

// Short, stable public URL aliases for each numeric field — kept separate from
// the internal TaxInput field names so a future rename can't break old links.
const FIELD_ALIAS = {
  wages: 'wages',
  interest: 'interest',
  nonQualifiedDividends: 'nqd',
  shortTermGains: 'stcg',
  qualifiedDividends: 'qd',
  longTermGains: 'ltcg',
} as const

type NumericField = keyof typeof FIELD_ALIAS

/** Encode inputs as readable, versioned params: `v=1&filing=mfj&wages=…` (zeros omitted). */
export function encodeInput(input: TaxInput): string {
  const params = new URLSearchParams()
  params.set('v', SHARE_VERSION)
  params.set('filing', input.filingStatus)
  for (const field of Object.keys(FIELD_ALIAS) as NumericField[]) {
    if (input[field] > 0) params.set(FIELD_ALIAS[field], String(input[field]))
  }
  return params.toString()
}

/**
 * Decode inputs from the share params. Requires the version marker; unknown
 * filing status → null; negative / missing / non-numeric amounts → 0 — so a
 * hand-edited or stale link can never inject a bad TaxInput. Null if unusable.
 */
export function decodeInput(encoded: string): TaxInput | null {
  const params = new URLSearchParams(encoded)
  if (!params.has('v')) return null
  const filingStatus = params.get('filing')
  if (!filingStatus || !(filingStatus in FILING_STATUS_LABELS)) return null
  const input = { filingStatus } as TaxInput
  for (const field of Object.keys(FIELD_ALIAS) as NumericField[]) {
    const n = Number(params.get(FIELD_ALIAS[field]))
    input[field] = Number.isFinite(n) && n > 0 ? n : 0
  }
  return input
}

/** The URL hash fragment that carries a shared input, e.g. `#v=1&filing=mfj&…`. */
export function shareHash(input: TaxInput): string {
  return `#${encodeInput(input)}`
}

/** Decode a shared input from a URL hash string; null when absent or invalid. */
export function parseShareHash(hash: string): TaxInput | null {
  return decodeInput(hash.replace(/^#/, ''))
}
