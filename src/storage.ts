import type { TaxInput } from './tax/types'
import type { Scenarios } from './scenarios'

const KEY = 'tax-visualizer:input:v1'
const SCENARIOS_KEY = 'tax-visualizer:saved:v1'

export function loadInput(): TaxInput | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TaxInput) : null
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
    return parsed && typeof parsed === 'object' ? (parsed as Scenarios) : {}
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
