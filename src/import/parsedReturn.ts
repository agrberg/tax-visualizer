import { ALL_SOURCES, allowsNegativeAmount, type TaxInput } from '../tax/types'
import { normalizeInput } from '../storage'

/**
 * The result of reading a filed return. `fields` holds whatever income values,
 * filing status, and tax year we could detect; `provenance` records where each
 * came from (e.g. `{ wages: '1040 line 1z' }`) for the review UI; `warnings`
 * carries anything the user should know (a value we couldn't split, a field we
 * couldn't find). Every field is optional — the reader fills what it can, and the
 * merge below leaves the rest untouched.
 */
export interface ParsedReturn {
  fields: Partial<TaxInput>
  provenance: Partial<Record<keyof TaxInput, string>>
  warnings: string[]
}

/**
 * Overlay detected fields onto the current input, then run the same sanitizer the
 * rest of the app uses so imported values are held to the same invariants as
 * hand-entered or restored-from-storage input (non-finite → 0, bogus filing
 * status → single, unsupported tax year → default).
 *
 * Capital-gains fields keep their real sign — a short-/long-term loss flows through to
 * the engine, which nets it (see `nettedCapitalGains`). Every other source is clamped to
 * 0, since a negative wage or interest figure from a bad parse is garbage, not a loss.
 * Fields the reader didn't detect keep their current values.
 */
export function mergeParsedInput(current: TaxInput, fields: Partial<TaxInput>): TaxInput {
  const merged = normalizeInput({ ...current, ...fields })
  for (const source of ALL_SOURCES) {
    if (!allowsNegativeAmount(source) && merged[source] < 0) merged[source] = 0
  }
  return merged
}
