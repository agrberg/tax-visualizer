import { describe, it, expect } from 'vitest'
import { encodeInput, decodeInput, shareHash, parseShareHash } from './shareLink'
import type { TaxInput } from './tax/types'

const sample: TaxInput = {
  filingStatus: 'mfj',
  taxYear: 2025,
  wages: 245000,
  retirementIncome: 30000,
  interest: 4000,
  nonQualifiedDividends: 5000,
  shortTermGains: 0,
  qualifiedDividends: 70000,
  longTermGains: 0,
}

describe('encodeInput / decodeInput', () => {
  it('round-trips a full input', () => {
    expect(decodeInput(encodeInput(sample))).toEqual(sample)
  })

  it('produces readable named params with a version marker', () => {
    const encoded = encodeInput(sample)
    expect(encoded).toContain('v=1')
    expect(encoded).toContain('filing=mfj')
    expect(encoded).toContain('wages=245000')
    expect(encoded).toContain('retire=30000')
    expect(encoded).toContain('qd=70000')
  })

  it('omits zero-valued amounts to keep the link short', () => {
    const encoded = encodeInput(sample) // shortTermGains + longTermGains are 0
    expect(encoded).not.toContain('stcg=')
    expect(encoded).not.toContain('ltcg=')
  })

  it('clamps negative amounts to 0', () => {
    expect(decodeInput(encodeInput({ ...sample, wages: -500 }))?.wages).toBe(0)
  })

  it('defaults missing amounts to 0 and a missing year to the default', () => {
    expect(decodeInput('v=1&filing=single')).toEqual({
      filingStatus: 'single',
      taxYear: 2026,
      wages: 0,
      retirementIncome: 0,
      interest: 0,
      nonQualifiedDividends: 0,
      shortTermGains: 0,
      qualifiedDividends: 0,
      longTermGains: 0,
    })
  })

  it('carries the tax year in the link and round-trips it', () => {
    expect(encodeInput(sample)).toContain('y=2025')
    expect(decodeInput(encodeInput(sample))?.taxYear).toBe(2025)
  })

  it('falls back to the default year for an unsupported or non-numeric year', () => {
    expect(decodeInput('v=1&filing=single&y=1999')?.taxYear).toBe(2026)
    expect(decodeInput('v=1&filing=single&y=abc')?.taxYear).toBe(2026)
  })

  it('treats a non-numeric amount as 0', () => {
    expect(decodeInput('v=1&filing=single&wages=abc')?.wages).toBe(0)
  })

  it('returns null for an unknown filing status', () => {
    expect(decodeInput('v=1&filing=bogus')).toBeNull()
  })

  it('returns null for inherited Object.prototype keys (regression: `in` would accept "toString")', () => {
    expect(decodeInput('v=1&filing=toString')).toBeNull()
    expect(decodeInput('v=1&filing=constructor')).toBeNull()
  })

  it('returns null without the version marker', () => {
    expect(decodeInput('filing=single&wages=100')).toBeNull()
    expect(decodeInput('')).toBeNull()
  })
})

describe('shareHash / parseShareHash', () => {
  it('round-trips through a #hash', () => {
    expect(parseShareHash(shareHash(sample))).toEqual(sample)
  })

  it('starts the hash with the version marker', () => {
    expect(shareHash(sample).startsWith('#v=1')).toBe(true)
  })

  it('returns null when the hash has no share payload', () => {
    expect(parseShareHash('')).toBeNull()
    expect(parseShareHash('#other=1')).toBeNull()
  })
})
