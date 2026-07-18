import { describe, it, expect } from 'vitest'
import { calculateTax, marginalNextDollar } from './calculate'
import { taxTablesFor, isTaxYear, DEFAULT_TAX_YEAR } from './years'
import type { TaxInput } from './types'

import { makeInput } from './testUtils'

// This spec exercises year-specific tables, so it defaults to 2025 rather than the shared default.
const input = (overrides: Partial<TaxInput> = {}): TaxInput => makeInput({ taxYear: 2025, ...overrides })

describe('taxTablesFor', () => {
  it('returns the requested year', () => {
    expect(taxTablesFor(2025).year).toBe(2025)
    expect(taxTablesFor(2026).year).toBe(2026)
  })

  it('falls back to the default year for an unsupported year', () => {
    expect(taxTablesFor(1999).year).toBe(DEFAULT_TAX_YEAR)
  })
})

describe('isTaxYear', () => {
  it('accepts supported years and rejects everything else', () => {
    expect(isTaxYear(2025)).toBe(true)
    expect(isTaxYear(2026)).toBe(true)
    expect(isTaxYear(1999)).toBe(false)
    expect(isTaxYear('2025')).toBe(false)
    expect(isTaxYear(undefined)).toBe(false)
  })
})

describe('2025 tables drive the calculation', () => {
  it('uses the 2025 standard deduction ($15,750 single, per OBBBA)', () => {
    // Wages exactly at the 2025 single standard deduction → no taxable income.
    const r = calculateTax(input({ wages: 15750 }))
    expect(r.federal.deduction).toBe(15750)
    expect(r.federal.taxableIncome).toBe(0)
    expect(r.federal.ordinaryTax).toBe(0)
  })

  it('places the top of the 10% ordinary bracket at $11,925 (single)', () => {
    // Taxable income exactly $11,925 (wages = deduction + 11,925) is fully in the 10%
    // bracket ($1,192.50 tax); the next dollar crosses into 12%, confirming the ceiling.
    const r = calculateTax(input({ wages: 15750 + 11925 }))
    expect(r.federal.ordinaryTaxable).toBe(11925)
    expect(r.federal.ordinaryTax).toBeCloseTo(1192.5, 2)
    expect(r.federal.marginalOrdinaryRate).toBe(0.12)
  })

  it('caps Social Security at the 2025 wage base ($176,100)', () => {
    const r = calculateTax(input({ wages: 200000 }))
    const ss = r.federal.surcharges.find((s) => s.key === 'socialSecurity')!
    expect(ss.cap).toBe(176100)
    expect(ss.taxedAmount).toBe(176100)
    expect(ss.amount).toBeCloseTo(176100 * 0.062, 2)
  })
})

describe('switching only the year changes the tax', () => {
  it('2025 taxes more than 2026 on identical income (lower deduction + brackets)', () => {
    const income = { wages: 120000, longTermGains: 15000, interest: 2000 } as const
    const r2025 = calculateTax(input({ ...income, taxYear: 2025 }))
    const r2026 = calculateTax(input({ ...income, taxYear: 2026 }))
    expect(r2025.taxYear).toBe(2025)
    expect(r2026.taxYear).toBe(2026)
    // 2026's higher standard deduction and wider brackets lower the bill.
    expect(r2025.totalTax).toBeGreaterThan(r2026.totalTax)
  })
})

describe('the selected year threads through marginalNextDollar', () => {
  it("drops Social Security from the next wage dollar once wages clear that year's cap", () => {
    // $180k wages sits above the 2025 SS wage base ($176,100) but below 2026's ($184,500),
    // so the next wage dollar still incurs SS in 2026 but not in 2025 — proving the year's
    // tables reach the marginal calc, not just the assessment.
    const wagesSs = (year: number) => {
      const wages = marginalNextDollar(calculateTax(input({ wages: 180000, taxYear: year }))).find(
        (m) => m.key === 'wages',
      )!
      return wages.surtaxes.find((s) => s.label === 'Soc. Sec.')?.rate ?? 0
    }
    expect(wagesSs(2025)).toBe(0)
    expect(wagesSs(2026)).toBeCloseTo(0.062, 5)
  })
})
