import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  upsertSaved,
  removeSaved,
  renameSaved,
  sortedNames,
  type SavedInputs,
} from './savedInputs'
import type { TaxInput } from './tax/types'

function input(overrides: Partial<TaxInput> = {}): TaxInput {
  return {
    filingStatus: 'single',
    wages: 0,
    interest: 0,
    nonQualifiedDividends: 0,
    shortTermGains: 0,
    qualifiedDividends: 0,
    longTermGains: 0,
    ...overrides,
  }
}

describe('normalizeName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeName('  Bonus year  ')).toBe('Bonus year')
  })

  it('returns null for empty or whitespace-only names', () => {
    expect(normalizeName('')).toBeNull()
    expect(normalizeName('   ')).toBeNull()
  })
})

describe('upsertSaved', () => {
  it('adds a new named version', () => {
    const next = upsertSaved({}, 'Base', input({ wages: 100 }))
    expect(next.Base.wages).toBe(100)
  })

  it('overwrites an existing name', () => {
    const start: SavedInputs = { Base: input({ wages: 100 }) }
    const next = upsertSaved(start, 'Base', input({ wages: 200 }))
    expect(next.Base.wages).toBe(200)
    expect(Object.keys(next)).toEqual(['Base'])
  })

  it('returns a new object without mutating the original', () => {
    const start: SavedInputs = {}
    const next = upsertSaved(start, 'Base', input())
    expect(next).not.toBe(start)
    expect(start).toEqual({})
  })

  it('stores a decoupled copy of the input', () => {
    const live = input({ wages: 100 })
    const next = upsertSaved({}, 'Base', live)
    live.wages = 999
    expect(next.Base.wages).toBe(100)
  })
})

describe('removeSaved', () => {
  it('removes a present key', () => {
    const start: SavedInputs = { A: input(), B: input() }
    const next = removeSaved(start, 'A')
    expect(Object.keys(next)).toEqual(['B'])
  })

  it('is a no-op for an absent key and returns a new object', () => {
    const start: SavedInputs = { A: input() }
    const next = removeSaved(start, 'missing')
    expect(next).toEqual(start)
    expect(next).not.toBe(start)
  })
})

describe('renameSaved', () => {
  it('moves a value from the old name to the new name', () => {
    const start: SavedInputs = { Old: input({ wages: 100 }) }
    const next = renameSaved(start, 'Old', 'New')
    expect(next.New.wages).toBe(100)
    expect(next.Old).toBeUndefined()
  })

  it('overwrites when the new name collides with a different existing key', () => {
    const start: SavedInputs = { Old: input({ wages: 100 }), Taken: input({ wages: 5 }) }
    const next = renameSaved(start, 'Old', 'Taken')
    expect(next.Taken.wages).toBe(100)
    expect(next.Old).toBeUndefined()
  })

  it('is a no-op when the old name does not exist', () => {
    const start: SavedInputs = { A: input() }
    const next = renameSaved(start, 'missing', 'New')
    expect(next).toEqual(start)
  })

  it('stores a decoupled copy of the moved value', () => {
    const original = input({ wages: 100 })
    const start: SavedInputs = { Old: original }
    const next = renameSaved(start, 'Old', 'New')
    next.New.wages = 999
    expect(original.wages).toBe(100)
  })
})

describe('sortedNames', () => {
  it('returns names in alphabetical order', () => {
    const saved: SavedInputs = { charlie: input(), alpha: input(), bravo: input() }
    expect(sortedNames(saved)).toEqual(['alpha', 'bravo', 'charlie'])
  })

  it('returns an empty array for an empty hash', () => {
    expect(sortedNames({})).toEqual([])
  })
})
