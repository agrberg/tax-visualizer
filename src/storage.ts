import { ALL_SOURCES, type TaxInput } from './tax/types'
import { isFilingStatus } from './tax/brackets'
import { DEFAULT_TAX_YEAR, isTaxYear } from './tax/years'
import type { Scenarios } from './scenarios'

const KEY = 'tax-visualizer:input:v1'
const SCENARIOS_KEY = 'tax-visualizer:saved:v1'

/**
 * Fill any missing or non-finite income field with 0, and reset an unrecognized
 * filing status to `single`. Input saved before a source existed (e.g. retirement
 * distributions) would otherwise carry `undefined`, which renders as "undefined" in
 * the form and breaks the math; a hand-edited or corrupted filing status would have
 * no bracket table and crash the engine on load. Input saved before multi-year
 * support (or with a dropped/unsupported year) falls back to the default year.
 */
export function normalizeInput(input: TaxInput): TaxInput {
  const normalized = { ...input }
  for (const source of ALL_SOURCES) {
    const n = normalized[source]
    normalized[source] = Number.isFinite(n) ? n : 0
  }
  if (!isFilingStatus(normalized.filingStatus)) {
    normalized.filingStatus = 'single'
  }
  if (!isTaxYear(normalized.taxYear)) {
    normalized.taxYear = DEFAULT_TAX_YEAR
  }
  return normalized
}

export function loadInput(): TaxInput | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeInput(JSON.parse(raw) as TaxInput) : null
  } catch {
    return null
  }
}

export function saveInput(input: TaxInput): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(input))
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function loadScenarios(): Scenarios {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const normalized: Scenarios = {}
    for (const [name, value] of Object.entries(parsed as Scenarios)) {
      normalized[name] = normalizeInput(value)
    }
    return normalized
  } catch {
    return {}
  }
}

export function saveScenarios(scenarios: Scenarios): void {
  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios))
  } catch {
    // ignore quota / privacy-mode errors
  }
}

/** Remove only this app's persisted keys — used to recover from corrupted saved input. */
export function clearStoredData(): void {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(SCENARIOS_KEY)
  } catch (err) {
    // On the recovery path, surface the failure rather than swallowing it silently:
    // if the reset can't clear storage, the reload will hit the same corrupt data.
    console.error('Failed to clear saved tax-visualizer data:', err)
  }
}
