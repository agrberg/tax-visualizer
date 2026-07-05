import { describe, it, expect } from 'vitest'
import { normalizeInput } from './storage'
import type { TaxInput } from './tax/types'

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
})
