import type { TaxInput } from './tax/types'
import type { SavedInputs } from './savedInputs'

const KEY = 'tax-visualizer:input:v1'
const SAVED_KEY = 'tax-visualizer:saved:v1'

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

export function loadSavedInputs(): SavedInputs {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as SavedInputs) : {}
  } catch {
    return {}
  }
}

export function saveSavedInputs(saved: SavedInputs): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved))
  } catch {
    // ignore quota / privacy-mode errors
  }
}
