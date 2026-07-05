import { describe, it, expect } from 'vitest'
import { axisMaxFor, ordinaryAxisMaxFor, tall } from './tower'
import { calculateTax } from '@/tax/calculate'
import type { TaxInput } from '@/tax/types'
import {
  STANDARD_DEDUCTION,
  ORDINARY_BRACKETS,
  CAPITAL_GAINS_BREAKPOINTS,
} from '@/tax/brackets'

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

describe('ordinaryAxisMaxFor', () => {
  it('does NOT reserve first-bracket headroom when income is fully shielded', () => {
    // MFJ with wages below the standard deduction: no taxable ordinary income.
    const r = calculateTax(input({ filingStatus: 'mfj', wages: 24000 }))
    expect(r.federal.ordinaryTaxable).toBe(0)

    const axis = ordinaryAxisMaxFor(r)
    // Fully-shielded income under the deduction rounds to the 50k floor.
    expect(axis).toBe(50000)

    // Regression guard: the old formula reserved the first bracket above the
    // deduction, floating a lone bracket marker in an empty void.
    const deduction = STANDARD_DEDUCTION.mfj
    const brackets = ORDINARY_BRACKETS.mfj
    const oldFormula = Math.ceil(((deduction + brackets[1].min) * 1.08) / 5000) * 5000
    expect(axis).toBeLessThan(oldFormula)
  })

  it('reserves context up to deduction + first bracket min when income is taxable', () => {
    // MFJ wages well above the deduction: ordinaryTaxable > 0, income drives the axis.
    const r = calculateTax(input({ filingStatus: 'mfj', wages: 120000 }))
    expect(r.federal.ordinaryTaxable).toBeGreaterThan(0)

    const deduction = STANDARD_DEDUCTION.mfj
    const brackets = ORDINARY_BRACKETS.mfj
    const context = deduction + brackets[1].min
    const base = Math.max(r.ordinaryIncome, context)
    const expected = Math.max(50000, Math.ceil((base * 1.08) / 5000) * 5000)

    expect(ordinaryAxisMaxFor(r)).toBe(expected)
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
