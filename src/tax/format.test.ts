import { describe, it, expect } from 'vitest'
import { compositionSegments, blendBackground, formatRatePercent, taxComponents, SOURCE_META, SOURCE_COLOR } from './format'
import { calculateTax } from './calculate'
import { makeInput as input } from './testUtils'

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

  it('merges interest, non-qual dividends, and ST gains into one ordinaryInvestment bucket', () => {
    const r = calculateTax(
      input({ wages: 80000, interest: 5000, nonQualifiedDividends: 4000, shortTermGains: 3000 }),
    )
    const segments = compositionSegments(r)

    const bucket = segments.find((s) => s.key === 'ordinaryInvestment')!
    expect(bucket).toBeDefined()

    const int = r.sourceBreakdown.find((s) => s.source === 'interest')!
    const nq = r.sourceBreakdown.find((s) => s.source === 'nonQualifiedDividends')!
    const st = r.sourceBreakdown.find((s) => s.source === 'shortTermGains')!
    expect(bucket.amount).toBe(int.amount + nq.amount + st.amount)
    expect(bucket.tax).toBe(int.tax + nq.tax + st.tax)
    expect(bucket.effectiveRate).toBe(bucket.tax / bucket.amount)
    expect(bucket.colors).toHaveLength(3)

    // Individual investment rows are folded into the bucket, not shown separately.
    expect(segments.some((s) => s.key === 'interest')).toBe(false)
    expect(segments.some((s) => s.key === 'nonQualifiedDividends')).toBe(false)
    expect(segments.filter((s) => s.key === 'ordinaryInvestment')).toHaveLength(1)
  })

  it('labels a single investment source with its own key/short (not the merged bucket)', () => {
    const r = calculateTax(input({ wages: 80000, interest: 5000 }))
    const segments = compositionSegments(r)

    expect(segments.some((s) => s.key === 'ordinaryInvestment')).toBe(false)
    const interest = segments.find((s) => s.key === 'interest')!
    expect(interest.short).toBe(SOURCE_META.interest.short)
    expect(interest.colors).toEqual([SOURCE_COLOR.interest])
  })

  it('keeps wages and retirement separate from the investment bucket', () => {
    const r = calculateTax(
      input({ wages: 80000, retirementIncome: 20000, interest: 5000, nonQualifiedDividends: 4000 }),
    )
    const segments = compositionSegments(r)

    expect(segments.some((s) => s.key === 'wages')).toBe(true)
    expect(segments.some((s) => s.key === 'retirementIncome')).toBe(true)
    expect(segments.some((s) => s.key === 'ordinaryInvestment')).toBe(true)
    // Order: wages, retirement, investment bucket.
    expect(segments.map((s) => s.key)).toEqual(['wages', 'retirementIncome', 'ordinaryInvestment'])
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

  it('cycles through all colors for a three-color bucket', () => {
    const a = 'var(--color-src-interest)'
    const b = 'var(--color-src-nonqual)'
    const c = 'var(--color-src-stgains)'
    const style = blendBackground([a, b, c])
    expect(style.backgroundImage).toContain('repeating-linear-gradient')
    expect(style.backgroundImage).toContain(a)
    expect(style.backgroundImage).toContain(b)
    expect(style.backgroundImage).toContain(c)
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

describe('taxComponents', () => {
  it('splits the total into income tax, payroll tax, and surtaxes that sum to totalTax', () => {
    // single, wages 300k + 5k interest: income tax + FICA + Add'l Medicare + NIIT all present
    const r = calculateTax(input({ wages: 300000, interest: 5000 }))
    const c = taxComponents(r)
    const by = (k: string) => c.find((x) => x.key === k)!

    expect(by('income').amount).toBeCloseTo(r.federal.ordinaryTax + r.federal.capitalGainsTax, 2)
    // payroll = Social Security (capped) + base Medicare
    const ss = r.federal.surcharges.find((s) => s.key === 'socialSecurity')!.amount
    const med = r.federal.surcharges.find((s) => s.key === 'medicare')!.amount
    expect(by('payroll').amount).toBeCloseTo(ss + med, 2)
    // surtax = Additional Medicare + NIIT
    const addl = r.federal.surcharges.find((s) => s.key === 'additionalMedicare')!.amount
    const niit = r.federal.surcharges.find((s) => s.key === 'niit')!.amount
    expect(by('surtax').amount).toBeCloseTo(addl + niit, 2)

    const sum = c.reduce((acc, x) => acc + x.amount, 0)
    expect(sum).toBeCloseTo(r.totalTax, 2)
  })

  it('reports zero payroll and surtax for retirement-only income', () => {
    const r = calculateTax(input({ retirementIncome: 100000 }))
    const c = taxComponents(r)
    expect(c.find((x) => x.key === 'payroll')!.amount).toBe(0)
    expect(c.find((x) => x.key === 'surtax')!.amount).toBe(0)
    expect(c.find((x) => x.key === 'income')!.amount).toBeCloseTo(r.totalTax, 2)
  })
})
