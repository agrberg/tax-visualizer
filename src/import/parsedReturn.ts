import { ALL_SOURCES, type TaxInput } from '../tax/types'
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
 * Negative income is clamped to 0 by default: the engine doesn't model losses yet, so
 * this is the boundary that keeps them out. Pass `clampNegatives: false` to preserve
 * the real sign — used to seed the import review draft so a capital loss is shown to
 * the user for reconciliation before Apply (which merges again with the clamp on)
 * writes an engine-safe value. Fields the reader didn't detect keep their current values.
 */
export function mergeParsedInput(
  current: TaxInput,
  fields: Partial<TaxInput>,
  { clampNegatives = true }: { clampNegatives?: boolean } = {},
): TaxInput {
  const merged = normalizeInput({ ...current, ...fields })
  if (clampNegatives) {
    for (const source of ALL_SOURCES) {
      if (merged[source] < 0) merged[source] = 0
    }
  }
  return merged
}
