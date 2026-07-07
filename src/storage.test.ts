import { describe, it, expect, vi } from 'vitest'
import { normalizeInput, clearStoredData } from './storage'
import type { TaxInput } from './tax/types'

// Minimal in-memory localStorage for the node test env (no DOM by default).
function stubLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
  return store
}

describe('normalizeInput', () => {
  it('fills a field missing from older saved input with 0', () => {
    // Input persisted before retirementIncome existed.
    const stale = { filingStatus: 'single', wages: 50000, interest: 2000 } as unknown as TaxInput
    const normalized = normalizeInput(stale)
    expect(normalized.retirementIncome).toBe(0)
    expect(normalized.wages).toBe(50000)
    expect(normalized.interest).toBe(2000)
    expect(normalized.longTermGains).toBe(0)
    expect(normalized.filingStatus).toBe('single')
  })

  it('coerces non-finite amounts to 0 and leaves valid ones untouched', () => {
    const dirty = { filingStatus: 'mfj', wages: NaN, longTermGains: 15000 } as unknown as TaxInput
    const normalized = normalizeInput(dirty)
    expect(normalized.wages).toBe(0)
    expect(normalized.longTermGains).toBe(15000)
  })

  it('coerces an unknown filing status back to single (a bad one would crash the engine)', () => {
    const dirty = { filingStatus: 'xyz', wages: 100000 } as unknown as TaxInput
    const normalized = normalizeInput(dirty)
    expect(normalized.filingStatus).toBe('single')
  })

  it('rejects inherited Object.prototype keys (regression: `in` would accept "toString")', () => {
    for (const key of ['toString', 'constructor', 'hasOwnProperty']) {
      const dirty = { filingStatus: key } as unknown as TaxInput
      expect(normalizeInput(dirty).filingStatus).toBe('single')
    }
  })

  it('keeps a valid filing status untouched', () => {
    for (const status of ['single', 'mfj', 'hoh', 'mfs'] as const) {
      expect(normalizeInput({ filingStatus: status } as unknown as TaxInput).filingStatus).toBe(status)
    }
  })

  it('defaults a missing or unsupported tax year to the default year', () => {
    // Input persisted before multi-year support had no taxYear.
    const legacy = { filingStatus: 'single', wages: 50000 } as unknown as TaxInput
    expect(normalizeInput(legacy).taxYear).toBe(2026)
    const bogus = { filingStatus: 'single', taxYear: 1999 } as unknown as TaxInput
    expect(normalizeInput(bogus).taxYear).toBe(2026)
  })

  it('keeps a supported tax year untouched', () => {
    const input = { filingStatus: 'single', taxYear: 2025 } as unknown as TaxInput
    expect(normalizeInput(input).taxYear).toBe(2025)
  })
})

describe('clearStoredData', () => {
  it('removes only this app\'s keys and leaves unrelated origin data intact', () => {
    const store = stubLocalStorage()
    store.set('tax-visualizer:input:v1', '{}')
    store.set('tax-visualizer:saved:v1', '{}')
    store.set('other-app:data', 'keep')
    clearStoredData()
    expect(store.has('tax-visualizer:input:v1')).toBe(false)
    expect(store.has('tax-visualizer:saved:v1')).toBe(false)
    expect(store.get('other-app:data')).toBe('keep')
    vi.unstubAllGlobals()
  })

  it('swallows and logs a removeItem failure instead of throwing (recovery path)', () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('storage access denied')
      },
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => clearStoredData()).not.toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    vi.unstubAllGlobals()
  })
})
