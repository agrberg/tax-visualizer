import { describe, it, expect } from 'vitest'
import { mergeParsedInput } from './parsedReturn'
import type { TaxInput } from '../tax/types'
import { makeInput } from '@/tax/testUtils'

const CURRENT = makeInput({ wages: 120000, interest: 2000, qualifiedDividends: 8000, longTermGains: 15000 })

describe('mergeParsedInput', () => {
  it('overrides only the detected fields and leaves the rest untouched', () => {
    const merged = mergeParsedInput(CURRENT, { wages: 118000, interest: 2100 })
    expect(merged.wages).toBe(118000)
    expect(merged.interest).toBe(2100)
    // untouched
    expect(merged.qualifiedDividends).toBe(8000)
    expect(merged.longTermGains).toBe(15000)
    expect(merged.filingStatus).toBe('single')
    expect(merged.taxYear).toBe(2026)
  })

  it('overlays filing status and tax year when detected', () => {
    const merged = mergeParsedInput(CURRENT, { filingStatus: 'mfj', taxYear: 2025 })
    expect(merged.filingStatus).toBe('mfj')
    expect(merged.taxYear).toBe(2025)
  })

  it('clamps a negative on the non-capital-gains fields and coerces non-finite to 0', () => {
    const merged = mergeParsedInput(CURRENT, {
      wages: Number.NaN,
      interest: Infinity,
      nonQualifiedDividends: -500, // a negative here is garbage, not a loss
    })
    expect(merged.wages).toBe(0)
    expect(merged.interest).toBe(0)
    expect(merged.nonQualifiedDividends).toBe(0)
  })

  it('preserves a negative capital gain (a loss) so it reaches the netting engine', () => {
    const merged = mergeParsedInput(CURRENT, { shortTermGains: -500, longTermGains: -1200 })
    expect(merged.shortTermGains).toBe(-500)
    expect(merged.longTermGains).toBe(-1200)
    // non-finite is still coerced to 0 even for the signed fields.
    expect(mergeParsedInput(CURRENT, { shortTermGains: Number.NaN }).shortTermGains).toBe(0)
  })

  it('resets an unrecognized filing status to single', () => {
    const merged = mergeParsedInput(CURRENT, {
      filingStatus: 'qss' as TaxInput['filingStatus'],
    })
    expect(merged.filingStatus).toBe('single')
  })

  it('falls back to the default year for an unsupported tax year', () => {
    const merged = mergeParsedInput(CURRENT, { taxYear: 2019 })
    expect(merged.taxYear).toBe(2026)
  })

  it('is a no-op (normalized copy of current) when no fields are detected', () => {
    const merged = mergeParsedInput(CURRENT, {})
    expect(merged).toEqual(CURRENT)
    expect(merged).not.toBe(CURRENT)
  })
})
