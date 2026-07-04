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

  it('marginal ordinary rate is 0 while income is still inside the standard deduction', () => {
    const r = calculateTax(input({ wages: 10000 })) // single, deduction 15000
    expect(r.ordinaryTaxable).toBe(0)
    expect(r.ordinaryTax).toBe(0)
    // the next ordinary dollar just uses up more deduction — it is not taxed
    expect(r.marginalOrdinaryRate).toBe(0)
  })

  it('marginal ordinary rate is the current bracket once past the deduction', () => {
    const r = calculateTax(input({ wages: 100000 })) // single, taxable 84900 in 22% bracket
    expect(r.marginalOrdinaryRate).toBe(0.22)
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
    expect(r.preferentialDeduction).toBe(6100)
    expect(r.totalTax).toBe(0)
  })

  it('shields preferential income proportionally, not sequentially by source', () => {
    // MFJ: ordinary 24000 < 32200; leftover 8200 spills onto 20000 of preferential
    const r = calculateTax(
      input({
        filingStatus: 'mfj',
        wages: 15000,
        interest: 4000,
        nonQualifiedDividends: 5000,
        qualifiedDividends: 10000,
        longTermGains: 10000,
      }),
    )
    expect(r.preferentialDeduction).toBe(8200)
    // both sources reduced by the same 41% (8200/20000), not qual div first
    const qual = r.preferentialLayers.find((l) => l.source === 'qualifiedDividends')!
    const lt = r.preferentialLayers.find((l) => l.source === 'longTermGains')!
    expect(qual.taxableAmount).toBeCloseTo(5900, 2)
    expect(lt.taxableAmount).toBeCloseTo(5900, 2)
    expect(r.preferentialTaxable).toBeCloseTo(11800, 2)
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
    // marginal ordinary 32%, cap-gains 15%; MAGI-over (391k) exceeds NII (141k),
    // so a wage dollar does NOT drag more NII under the cap — Medicare only.
    expect(rate(m, 'wages').totalRate).toBeCloseTo(0.329, 5) // 32% + 0.9% Medicare
    expect(rate(m, 'wages').surtaxes.map((s) => s.label)).toEqual(["Add'l Medicare"])
    expect(rate(m, 'ordinaryInvestment').totalRate).toBeCloseTo(0.358, 5) // 32% + 3.8% NIIT
    expect(rate(m, 'preferential').totalRate).toBeCloseTo(0.188, 5) // 15% + 3.8% NIIT
  })

  it('charges NIIT on the next wage dollar when the MAGI cap is binding (below NII)', () => {
    // MAGI 294k over by 44k < NII 80k → raising wages pulls more NII under the cap
    const r = calculateTax(
      input({
        filingStatus: 'mfj',
        wages: 214000,
        interest: 6000,
        nonQualifiedDividends: 10000,
        qualifiedDividends: 64000,
      }),
    )
    const m = marginalNextDollar(r)
    expect(rate(m, 'wages').totalRate).toBeCloseTo(0.258, 5) // 22% + 3.8% NIIT (wages < 250k, no Medicare)
    expect(rate(m, 'wages').surtaxes.map((s) => s.label)).toEqual(['NIIT'])
    expect(rate(m, 'ordinaryInvestment').totalRate).toBeCloseTo(0.258, 5)
    expect(rate(m, 'preferential').totalRate).toBeCloseTo(0.188, 5)
  })

  it('charges 0 on the next dollar while everything is inside the standard deduction', () => {
    // MFJ, ordinary 24000 < 32200 deduction; preferential also partly shielded
    const r = calculateTax(
      input({ filingStatus: 'mfj', wages: 15000, interest: 4000, nonQualifiedDividends: 5000, qualifiedDividends: 60000 }),
    )
    const m = marginalNextDollar(r)
    expect(rate(m, 'wages').totalRate).toBe(0)
    expect(rate(m, 'ordinaryInvestment').totalRate).toBe(0)
    // gains top out at 51800 taxable, well inside the 0% cap-gains band
    expect(rate(m, 'preferential').totalRate).toBe(0)
  })

  it('charges the top-of-stack gains rate on a shielded ordinary dollar that displaces the deduction', () => {
    // MFJ, ordinary 31200 < 32200 deduction → 1000 of deduction spills onto the gains.
    // A wage/interest dollar is inside the deduction, but consuming it un-shields a
    // qualified-dividend dollar that lands at the top of the stack (already in 15%).
    const r = calculateTax(
      input({ filingStatus: 'mfj', wages: 22200, interest: 4000, nonQualifiedDividends: 5000, qualifiedDividends: 100000 }),
    )
    expect(r.ordinaryTaxable).toBe(0)
    expect(r.preferentialTaxable).toBe(99000) // 100000 - 1000 spilled deduction
    // 98900 at 0%, 100 at 15% → the stack tops out in the 15% band
    expect(r.marginalCapitalGainsRate).toBe(0.15)
    // so the next shielded ordinary dollar really costs 15%, not 0
    expect(r.marginalOrdinaryRate).toBe(0.15)
    const m = marginalNextDollar(r)
    expect(rate(m, 'wages').totalRate).toBe(0.15)
    expect(rate(m, 'ordinaryInvestment').totalRate).toBe(0.15)
    expect(rate(m, 'preferential').totalRate).toBe(0.15)
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

  it('uses HoH brackets, deduction, and LTCG breakpoints', () => {
    const r = calculateTax(input({ filingStatus: 'hoh', wages: 100000, longTermGains: 100000 }))
    // taxable = 100000 - 24150 = 75850
    expect(r.ordinaryTaxable).toBe(75850)
    // 10%*17700 + 12%*(67450-17700) + 22%*(75850-67450) = 1770 + 5970 + 1848
    expect(r.ordinaryTax).toBeCloseTo(9588, 2)
    expect(r.marginalOrdinaryRate).toBe(0.22)
    // gains stack from 75850; HoH 0% ends at 66200 (already passed) -> all in 15%
    expect(r.capitalGainsTax).toBeCloseTo(15000, 2) // 100000 * 15%
    expect(r.roomAt0).toBe(0)
  })

  it('uses MFS brackets and deduction', () => {
    const r = calculateTax(input({ filingStatus: 'mfs', wages: 60000 }))
    // taxable = 60000 - 16100 = 43900
    expect(r.ordinaryTaxable).toBe(43900)
    // 10%*12400 + 12%*(43900-12400) = 1240 + 3780
    expect(r.ordinaryTax).toBeCloseTo(5020, 2)
    expect(r.marginalOrdinaryRate).toBe(0.12)
  })

  it('reaches the MFS 20% LTCG band at its lower breakpoint', () => {
    // MFS 15% top is 306850; big gains cross into 20%
    const r = calculateTax(input({ filingStatus: 'mfs', longTermGains: 400000 }))
    // deduction 16100 spills onto gains -> 383900 taxable
    expect(r.preferentialTaxable).toBe(383900)
    const fill20 = r.capitalGainsFills.find((f) => f.rate === 0.2)!
    expect(fill20.amountInBracket).toBeCloseTo(383900 - 306850, 2) // 77050 at 20%
  })
})

describe('income classification and NIIT branches', () => {
  it('taxes short-term gains and non-qualified dividends as ordinary income', () => {
    const r = calculateTax(input({ shortTermGains: 40000, nonQualifiedDividends: 10000 }))
    expect(r.preferentialIncome).toBe(0)
    expect(r.ordinaryIncome).toBe(50000)
    // single: taxable 33900 -> 10%*12400 + 12%*(33900-12400)
    expect(r.ordinaryTaxable).toBe(33900)
    expect(r.ordinaryTax).toBeCloseTo(3820, 2)
    expect(r.capitalGainsTax).toBe(0)
  })

  it('taxes NIIT on net investment income when it is the binding lesser', () => {
    // single: MAGI 305000, over 105000, but NII is only 5000 -> NII binds
    const r = calculateTax(input({ wages: 300000, interest: 5000 }))
    expect(r.niit.incomeOverThreshold).toBe(105000)
    expect(r.niit.investmentIncome).toBe(5000)
    expect(r.niit.taxedAmount).toBe(5000)
    expect(r.niit.amount).toBeCloseTo(190, 2) // 5000 * 3.8%
    // Additional Medicare: wages 300000 over 200000 -> 100000 * 0.9%
    expect(r.additionalMedicare.amount).toBeCloseTo(900, 2)
  })

  it('does not add NIIT to the next wage dollar when NII is the binding lesser', () => {
    const r = calculateTax(input({ wages: 300000, interest: 5000 }))
    const m = marginalNextDollar(r)
    const wages = m.find((s) => s.key === 'wages')!
    // 35% ordinary + 0.9% Medicare, but NO NIIT (raising wages can't pull more than NII allows)
    expect(wages.totalRate).toBeCloseTo(0.359, 5)
    expect(wages.surtaxes.map((s) => s.label)).toEqual(["Add'l Medicare"])
  })

  it('reaches a 20% + NIIT marginal rate on the next preferential dollar', () => {
    const r = calculateTax(input({ longTermGains: 600000 })) // single
    const m = marginalNextDollar(r)
    // taxable gains 583900 > 545500 -> 20% band; MAGI over threshold -> +3.8% NIIT
    expect(r.marginalCapitalGainsRate).toBe(0.2)
    expect(m.find((s) => s.key === 'preferential')!.totalRate).toBeCloseTo(0.238, 5)
  })
})

describe('edge cases', () => {
  it('handles zero income without dividing by zero', () => {
    const r = calculateTax(input({}))
    expect(r.totalIncome).toBe(0)
    expect(r.totalTax).toBe(0)
    expect(r.effectiveRate).toBe(0)
    expect(r.marginalOrdinaryRate).toBe(0) // still inside the deduction
  })

  it('clamps negative inputs to zero', () => {
    const r = calculateTax(input({ wages: -5000, interest: -100 }))
    expect(r.totalIncome).toBe(0)
    expect(r.ordinaryIncome).toBe(0)
  })
})
