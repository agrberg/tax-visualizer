import { describe, it, expect } from 'vitest'
import { compositionSegments, blendBackground, formatRatePercent, SOURCE_META, SOURCE_COLOR } from './format'
import { calculateTax } from './calculate'
import type { TaxInput } from './types'

function input(overrides: Partial<TaxInput>): TaxInput {
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

describe('compositionSegments', () => {
  it('merges qualified dividends and long-term gains into one capitalGains bucket', () => {
    const r = calculateTax(input({ wages: 80000, qualifiedDividends: 10000, longTermGains: 20000 }))
    const segments = compositionSegments(r)

    const bucket = segments.find((s) => s.key === 'capitalGains')!
    expect(bucket).toBeDefined()

    const qd = r.sourceBreakdown.find((s) => s.source === 'qualifiedDividends')!
    const lt = r.sourceBreakdown.find((s) => s.source === 'longTermGains')!
    expect(bucket.amount).toBe(qd.amount + lt.amount)
    expect(bucket.tax).toBe(qd.tax + lt.tax)
    expect(bucket.effectiveRate).toBe(bucket.tax / bucket.amount)
    expect(bucket.short).toBe('Cap. gains')
    expect(bucket.colors).toHaveLength(2)

    // Only one merged preferential bucket exists.
    expect(segments.filter((s) => s.key === 'capitalGains')).toHaveLength(1)
  })

  it('labels a single preferential source with its own short/label (not "Cap. gains")', () => {
    const r = calculateTax(input({ wages: 80000, qualifiedDividends: 10000 }))
    const bucket = compositionSegments(r).find((s) => s.key === 'capitalGains')!

    expect(bucket.colors).toHaveLength(1)
    expect(bucket.short).toBe(SOURCE_META.qualifiedDividends.short)
    expect(bucket.label).toBe(SOURCE_META.qualifiedDividends.label)
    expect(bucket.short).not.toBe('Cap. gains')
  })

  it('passes ordinary sources through individually with a single color', () => {
    const r = calculateTax(input({ wages: 80000, interest: 5000 }))
    const segments = compositionSegments(r)

    const wages = segments.find((s) => s.key === 'wages')!
    expect(wages.colors).toEqual([SOURCE_COLOR.wages])
    expect(wages.short).toBe(SOURCE_META.wages.short)

    const interest = segments.find((s) => s.key === 'interest')!
    expect(interest.colors).toEqual([SOURCE_COLOR.interest])
  })

  it('omits sources with zero amount', () => {
    const r = calculateTax(input({ wages: 80000 }))
    const segments = compositionSegments(r)

    expect(segments.some((s) => s.key === 'interest')).toBe(false)
    expect(segments.some((s) => s.key === 'capitalGains')).toBe(false)
    expect(segments.map((s) => s.key)).toEqual(['wages'])
  })
})

describe('blendBackground', () => {
  it('returns a solid backgroundColor for one color (no alpha)', () => {
    const color = 'var(--color-src-wages)'
    expect(blendBackground([color])).toEqual({ backgroundColor: color })
  })

  it('wraps a single color in color-mix when alpha is given', () => {
    const color = 'var(--color-src-wages)'
    const style = blendBackground([color], { alpha: 15 })
    expect(style.backgroundColor).toBe(`color-mix(in oklch, ${color} 15%, transparent)`)
    expect(style.backgroundImage).toBeUndefined()
  })

  it('returns a repeating-linear-gradient with both colors for two colors', () => {
    const a = 'var(--color-src-qualdiv)'
    const b = 'var(--color-src-ltgains)'
    const style = blendBackground([a, b])
    expect(style.backgroundColor).toBeUndefined()
    expect(style.backgroundImage).toContain('repeating-linear-gradient')
    expect(style.backgroundImage).toContain(a)
    expect(style.backgroundImage).toContain(b)
  })
})

describe('formatRatePercent', () => {
  it('shows exact rates with trailing zeros trimmed (up to 2 decimals)', () => {
    expect(formatRatePercent(0.062)).toBe('6.2%')
    expect(formatRatePercent(0.0145)).toBe('1.45%') // the case formatPercent(_, 1) mis-rounds to 1.5%
    expect(formatRatePercent(0.038)).toBe('3.8%')
    expect(formatRatePercent(0.009)).toBe('0.9%')
  })
})
