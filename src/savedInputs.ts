import type { TaxInput } from './tax/types'

export type SavedInputs = Record<string, TaxInput>

export function normalizeName(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export function upsertSaved(saved: SavedInputs, name: string, input: TaxInput): SavedInputs {
  return { ...saved, [name]: { ...input } }
}

export function removeSaved(saved: SavedInputs, name: string): SavedInputs {
  const next = { ...saved }
  delete next[name]
  return next
}

export function renameSaved(saved: SavedInputs, oldName: string, newName: string): SavedInputs {
  const value = saved[oldName]
  if (!value) return { ...saved }
  const next = { ...saved }
  delete next[oldName]
  next[newName] = { ...value }
  return next
}

export function sortedNames(saved: SavedInputs): string[] {
  return Object.keys(saved).sort((a, b) => a.localeCompare(b))
}
