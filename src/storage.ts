import { ALL_SOURCES, type TaxInput } from './tax/types'
import type { Scenarios } from './scenarios'

const KEY = 'tax-visualizer:input:v1'
const SCENARIOS_KEY = 'tax-visualizer:saved:v1'

/**
 * Fill any missing or non-finite income field with 0. Input saved before a source
 * existed (e.g. retirement distributions) would otherwise carry `undefined`, which
 * renders as "undefined" in the form and breaks the math.
 */
export function normalizeInput(input: TaxInput): TaxInput {
  const normalized = { ...input }
  for (const source of ALL_SOURCES) {
    const n = normalized[source]
    normalized[source] = Number.isFinite(n) ? n : 0
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
