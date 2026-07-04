import type { TaxInput } from './tax/types'

const KEY = 'tax-visualizer:input:v1'

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
