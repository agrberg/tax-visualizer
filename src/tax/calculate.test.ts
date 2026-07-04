import { describe, it, expect } from 'vitest'
import { calculateTax, marginalNextDollar } from './calculate'
import type { TaxInput, IncomeSource, MarginalScenario } from './types'

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

const sourceTax = (r: ReturnType<typeof calculateTax>, s: IncomeSource) =>
  r.sourceBreakdown.find((b) => b.source === s)?.tax ?? 0

describe('ordinary income only', () => {
  it('taxes $100k wages (single) across the 10/12/22 brackets after the standard deduction', () => {
    const r = calculateTax(input({ wages: 100000 }))
    // taxable = 100000 - 16100 = 83900
    expect(r.ordinaryTaxable).toBe(83900)
    // 1240 + 4560 + 7370
    expect(r.ordinaryTax).toBeCloseTo(13170, 2)
    expect(r.capitalGainsTax).toBe(0)
    expect(r.totalTax).toBeCloseTo(13170, 2)
    expect(r.marginalOrdinaryRate).toBe(0.22)
    // taxable income 83900 sits in the 15% cap-gains band (single 0% ends at 49450)
    expect(r.marginalCapitalGainsRate).toBe(0.15)
    expect(r.effectiveRate).toBeCloseTo(0.1317, 4)
    expect(r.roomAt0).toBe(0)
    expect(r.roomAt15).toBeCloseTo(545500 - 83900, 2)
  })

  it('marginal rate is the lowest bracket when taxable income is zero', () => {
    const r = calculateTax(input({ wages: 10000 }))
    expect(r.ordinaryTaxable).toBe(0)
    expect(r.ordinaryTax).toBe(0)
    expect(r.marginalOrdinaryRate).toBe(0.1)
  })
})

describe('capital gains stacking on top of ordinary income', () => {
  it('splits LTCG across the 0% and 15% bands based on where ordinary income ends', () => {
    const r = calculateTax(input({ wages: 50000, longTermGains: 20000 }))
    // ordinary taxable = 33900, gains occupy [33900, 53900)
    expect(r.capitalGainsBaseline).toBe(33900)
    // 15550 at 0%, 4450 at 15% = 667.50
    expect(r.capitalGainsTax).toBeCloseTo(667.5, 2)
    const fill0 = r.capitalGainsFills.find((f) => f.rate === 0)!
    const fill15 = r.capitalGainsFills.find((f) => f.rate === 0.15)!
    expect(fill0.amountInBracket).toBeCloseTo(15550, 2)
    expect(fill15.amountInBracket).toBeCloseTo(4450, 2)
    expect(r.roomAt0).toBe(0)
  })

  it('taxes gains entirely at 0% when they fit under the 0% ceiling, and reports room', () => {
    const r = calculateTax(input({ wages: 30000, longTermGains: 10000 }))
    // ordinary taxable = 13900, gains [13900, 23900) all under 49450
    expect(r.capitalGainsTax).toBe(0)
    expect(r.roomAt0).toBeCloseTo(49450 - 23900, 2)
  })

  it('reaches the 20% band for very large gains (single)', () => {
    const r = calculateTax(input({ longTermGains: 700000 }))
    // ordinary taxable = 0; deduction 16100 spills onto gains -> 683900 taxable
    expect(r.preferentialTaxable).toBe(683900)
    const fill20 = r.capitalGainsFills.find((f) => f.rate === 0.2)!
    expect(fill20.amountInBracket).toBeCloseTo(683900 - 545500, 2)
    expect(r.roomAt15).toBe(0)
  })
})

describe('standard deduction spilling onto preferential income', () => {
  it('applies leftover deduction to preferential income when ordinary is exhausted', () => {
    const r = calculateTax(input({ wages: 10000, qualifiedDividends: 8000 }))
    expect(r.ordinaryTaxable).toBe(0)
    // leftover deduction 6100 reduces the 8000 of qualified dividends to 1900 taxable
    expect(r.preferentialTaxable).toBe(1900)
    expect(r.totalTax).toBe(0)
  })
})

describe('surcharges (light-bulb triggers)', () => {
  it('applies NIIT on the lesser of net investment income and MAGI over the threshold', () => {
    const r = calculateTax(input({ wages: 150000, longTermGains: 80000 }))
    // MAGI 230000, over 30000; NII 80000; base = min = 30000 -> 1140
    expect(r.niit.applies).toBe(true)
    expect(r.niit.taxedAmount).toBeCloseTo(30000, 2)
    expect(r.niit.amount).toBeCloseTo(1140, 2)
    expect(r.additionalMedicare.applies).toBe(false)
  })

  it('does not apply NIIT below the MAGI threshold', () => {
    const r = calculateTax(input({ wages: 50000, longTermGains: 20000 }))
    expect(r.niit.applies).toBe(false)
    expect(r.niit.amount).toBe(0)
  })

  it('applies Additional Medicare Tax on wages over the threshold', () => {
    const r = calculateTax(input({ wages: 250000 }))
    // 50000 over * 0.9%
    expect(r.additionalMedicare.applies).toBe(true)
    expect(r.additionalMedicare.amount).toBeCloseTo(450, 2)
    expect(r.niit.applies).toBe(false)
  })
})

describe('per-source and overall aggregation', () => {
  it('per-source tax sums to total tax and the weighted rate is consistent', () => {
    const r = calculateTax(
      input({ wages: 150000, interest: 5000, qualifiedDividends: 20000, longTermGains: 10000 }),
    )
    const sum = r.sourceBreakdown.reduce((acc, b) => acc + b.tax, 0)
    expect(sum).toBeCloseTo(r.totalTax, 2)
    expect(r.effectiveRate).toBeCloseTo(r.totalTax / r.totalIncome, 6)
  })

  it('attributes Additional Medicare Tax to wages', () => {
    const r = calculateTax(input({ wages: 250000 }))
    // wages tax = ordinary tax + additional medicare 450
    expect(sourceTax(r, 'wages')).toBeCloseTo(r.ordinaryTax + 450, 2)
  })
})

describe('marginal cost of the next dollar', () => {
  const rate = (scenarios: MarginalScenario[], key: MarginalScenario['key']) =>
    scenarios.find((s) => s.key === key)!

  it('layers both surtaxes onto the next dollar for a high earner (MFJ)', () => {
    // MAGI 641000 > 250000 (NIIT on), wages 500000 > 250000 (Medicare on)
    const r = calculateTax(
      input({
        filingStatus: 'mfj',
        wages: 500000,
        interest: 10000,
        nonQualifiedDividends: 20000,
        shortTermGains: 1000,
        qualifiedDividends: 10000,
        longTermGains: 100000,
      }),
    )
    const m = marginalNextDollar(r)
    // marginal ordinary 32%, cap-gains 15%
    expect(rate(m, 'wages').totalRate).toBeCloseTo(0.329, 5) // 32% + 0.9% Medicare
    expect(rate(m, 'ordinaryInvestment').totalRate).toBeCloseTo(0.358, 5) // 32% + 3.8% NIIT
    expect(rate(m, 'preferential').totalRate).toBeCloseTo(0.188, 5) // 15% + 3.8% NIIT
  })

  it('adds no surtaxes below the thresholds', () => {
    const r = calculateTax(input({ wages: 100000 })) // single, no investment income
    const m = marginalNextDollar(r)
    expect(rate(m, 'wages').totalRate).toBe(0.22) // 22% ordinary, no Medicare
    expect(rate(m, 'ordinaryInvestment').totalRate).toBe(0.22) // 22% ordinary, no NIIT
    expect(rate(m, 'preferential').totalRate).toBe(0.15) // 15% cap gains, no NIIT
    expect(rate(m, 'wages').surRate).toBe(0)
  })
})

describe('filing status differences', () => {
  it('uses MFJ brackets and deduction', () => {
    const r = calculateTax(input({ filingStatus: 'mfj', wages: 100000 }))
    // taxable = 100000 - 32200 = 67800
    expect(r.ordinaryTaxable).toBe(67800)
    // 10% on 24800 = 2480; 12% on (67800-24800)=43000 -> 5160
    expect(r.ordinaryTax).toBeCloseTo(7640, 2)
    expect(r.marginalOrdinaryRate).toBe(0.12)
  })
})
