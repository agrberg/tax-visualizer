import { describe, it, expect } from 'vitest'
import {
  AXIS_HEADROOM,
  axisMaxFor,
  marginalOrdinaryIdx,
  ordinaryAxisMaxFor,
  nextOrdinaryBracket,
  tall,
} from './tower'
import { calculateTax } from '@/tax/calculate'
import type { TaxInput } from '@/tax/types'
import { taxTablesFor } from '@/tax/years'

const { standardDeduction: STANDARD_DEDUCTION, ordinaryBrackets: ORDINARY_BRACKETS } = taxTablesFor(2026)

import { makeInput } from '@/tax/testUtils'

// The tower specs default to an MFJ filer (wider brackets) rather than the shared default.
const input = (overrides: Partial<TaxInput> = {}): TaxInput => makeInput({ filingStatus: 'mfj', ...overrides })

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

describe('marginalOrdinaryIdx', () => {
  it('is the index of the bracket holding the last taxable dollar', () => {
    const r = calculateTax(input({ wages: 245000, interest: 4000, nonQualifiedDividends: 5000 }))
    expect(ORDINARY_BRACKETS.mfj[marginalOrdinaryIdx(r)].rate).toBe(0.24)
  })

  it('is the lowest bracket (10%) when income is fully shielded', () => {
    const r = calculateTax(input({ wages: 20000 }))
    expect(marginalOrdinaryIdx(r)).toBe(0)
  })
})

describe('axisMaxFor', () => {
  it('scales to the top of the gains stack plus headroom', () => {
    // Long-term gains below the deduction+rate0Max: the deduction shields part of
    // the gains, so the fill top includes the spilled deduction.
    const r = calculateTax(input({ filingStatus: 'single', longTermGains: 20000 }))
    expect(r.preferentialIncome).toBeGreaterThan(0)
    expect(r.federal.preferentialDeduction).toBeGreaterThan(0)

    const fed = r.federal
    const fillTop = fed.preferentialDeduction + fed.capitalGainsBaseline + fed.preferentialTaxable
    expect(axisMaxFor(r)).toBeCloseTo(fillTop * AXIS_HEADROOM, 5)
  })

  it('tracks the ordinary baseline when there is no preferential income', () => {
    const r = calculateTax(input({ filingStatus: 'single', wages: 100000 }))
    expect(r.preferentialIncome).toBe(0)

    const fed = r.federal
    const fillTop = fed.preferentialDeduction + fed.capitalGainsBaseline + fed.preferentialTaxable
    expect(axisMaxFor(r)).toBeCloseTo(fillTop * AXIS_HEADROOM, 5)
  })

  it('lands the two towers at the same fill height', () => {
    const r = calculateTax(
      input({ wages: 245000, interest: 4000, nonQualifiedDividends: 5000, qualifiedDividends: 70000 }),
    )
    const fed = r.federal
    const ordFill = Math.max(r.ordinaryIncome, fed.standardDeduction) / ordinaryAxisMaxFor(r)
    const capFill =
      (fed.preferentialDeduction + fed.capitalGainsBaseline + fed.preferentialTaxable) / axisMaxFor(r)
    expect(ordFill).toBeCloseTo(capFill, 5)
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
