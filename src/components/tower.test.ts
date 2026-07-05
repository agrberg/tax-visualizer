import { describe, it, expect } from 'vitest'
import { axisMaxFor, ordinaryAxisMaxFor, nextOrdinaryBracket, tall } from './tower'
import { calculateTax } from '@/tax/calculate'
import type { TaxInput } from '@/tax/types'
import {
  STANDARD_DEDUCTION,
  CAPITAL_GAINS_BREAKPOINTS,
} from '@/tax/brackets'

function input(overrides: Partial<TaxInput> = {}): TaxInput {
  return {
    filingStatus: 'mfj',
    wages: 0,
    interest: 0,
    nonQualifiedDividends: 0,
    shortTermGains: 0,
    qualifiedDividends: 0,
    longTermGains: 0,
    ...overrides,
  }
}

describe('ordinaryAxisMaxFor', () => {
  it('leaves a gap above the income but does not extend proportionally to the next bracket', () => {
    // $254k gross ordinary (MFJ) → $221,800 taxable, in the 24% bracket. The 32%
    // boundary is ~$180k of taxable income away and must NOT stretch the axis (that
    // is what created the giant empty void); the tower pins 32% to the top instead.
    const r = calculateTax(input({ wages: 245000, interest: 4000, nonQualifiedDividends: 5000 }))
    const axis = ordinaryAxisMaxFor(r)
    expect(axis).toBeGreaterThan(254000) // some gap above the income
    expect(axis).toBeLessThan(STANDARD_DEDUCTION.mfj + 403550) // but nowhere near the 32% line
  })
})

describe('nextOrdinaryBracket', () => {
  it('returns the bracket above the marginal one (income in 24% → 32% is next)', () => {
    const r = calculateTax(input({ wages: 245000, interest: 4000, nonQualifiedDividends: 5000 }))
    expect(nextOrdinaryBracket(r)?.rate).toBe(0.32)
  })

  it('returns 24% when the income lands in the 22% bracket', () => {
    const r = calculateTax(input({ wages: 215000, interest: 4000, nonQualifiedDividends: 5000 }))
    expect(nextOrdinaryBracket(r)?.rate).toBe(0.24)
  })

  it('returns 12% when income is fully shielded (marginal bracket is the 10%)', () => {
    const r = calculateTax(input({ wages: 20000 })) // below the $32,200 deduction
    expect(nextOrdinaryBracket(r)?.rate).toBe(0.12)
  })

  it('returns null when income is already in the top bracket', () => {
    const r = calculateTax(input({ wages: 2000000 }))
    expect(nextOrdinaryBracket(r)).toBeNull()
  })
})

describe('axisMaxFor', () => {
  it('includes the 0% cap-gains ceiling and the shielded preferential deduction', () => {
    // Long-term gains only, below the deduction+rate0Max: rate0Max drives the axis
    // and the preferential deduction shields part of the gains.
    const r = calculateTax(input({ filingStatus: 'single', longTermGains: 20000 }))
    expect(r.preferentialIncome).toBeGreaterThan(0)
    expect(r.federal.preferentialDeduction).toBeGreaterThan(0)

    const { rate0Max } = CAPITAL_GAINS_BREAKPOINTS.single
    const fed = r.federal
    const topOfGains = fed.capitalGainsBaseline + fed.preferentialTaxable
    let base = Math.max(topOfGains, fed.ordinaryTaxable)
    // The 0% cap-gains ceiling is included since there is preferential income.
    base = Math.max(base, rate0Max)
    base = (base + fed.preferentialDeduction) * 1.08
    const expected = Math.max(50000, Math.ceil(base / 10000) * 10000)

    const axis = axisMaxFor(r)
    expect(axis).toBe(expected)
    // Sanity: without the rate0Max floor the axis would be much smaller.
    expect(axis).toBeGreaterThan(rate0Max)
  })

  it('is driven by max(topOfGains, ordinaryTaxable) with no preferential income', () => {
    const r = calculateTax(input({ filingStatus: 'single', wages: 100000 }))
    expect(r.preferentialIncome).toBe(0)

    const fed = r.federal
    const topOfGains = fed.capitalGainsBaseline + fed.preferentialTaxable
    let base = Math.max(topOfGains, fed.ordinaryTaxable)
    base = (base + fed.preferentialDeduction) * 1.08
    const expected = Math.max(50000, Math.ceil(base / 10000) * 10000)

    expect(axisMaxFor(r)).toBe(expected)
  })
})

describe('tall', () => {
  it('is true at exactly 7% of the axis', () => {
    expect(tall(7000, 100000)).toBe(true)
  })

  it('is true above 7%', () => {
    expect(tall(20000, 100000)).toBe(true)
  })

  it('is false below 7%', () => {
    expect(tall(6999, 100000)).toBe(false)
  })
})
