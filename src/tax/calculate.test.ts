import { describe, it, expect } from 'vitest'
import { calculateTax, marginalNextDollar } from './calculate'
import type { TaxInput, IncomeSource, MarginalScenario } from './types'

import { makeInput as input } from './testUtils'

const sourceTax = (r: ReturnType<typeof calculateTax>, s: IncomeSource) =>
  r.sourceBreakdown.find((b) => b.source === s)?.tax ?? 0

const niitOf = (r: ReturnType<typeof calculateTax>) =>
  r.federal.surcharges.find((s) => s.key === 'niit')!
const medicareOf = (r: ReturnType<typeof calculateTax>) =>
  r.federal.surcharges.find((s) => s.key === 'additionalMedicare')!
const surchargeAmount = (r: ReturnType<typeof calculateTax>, key: string) =>
  r.federal.surcharges.find((s) => s.key === key)?.amount ?? 0

describe('ordinary income only', () => {
  it('taxes $100k wages (single) across the 10/12/22 brackets after the standard deduction', () => {
    const r = calculateTax(input({ wages: 100000 }))
    // taxable = 100000 - 16100 = 83900
    expect(r.federal.ordinaryTaxable).toBe(83900)
    // 1240 + 4560 + 7370
    expect(r.federal.ordinaryTax).toBeCloseTo(13170, 2)
    expect(r.federal.capitalGainsTax).toBe(0)
    // income tax 13170 + FICA on 100k wages (6.2% + 1.45% = 7650)
    expect(r.totalTax).toBeCloseTo(20820, 2)
    expect(r.federal.marginalOrdinaryRate).toBe(0.22)
    // taxable income 83900 sits in the 15% cap-gains band (single 0% ends at 49450)
    expect(r.federal.marginalCapitalGainsRate).toBe(0.15)
    expect(r.effectiveRate).toBeCloseTo(0.2082, 4)
    expect(r.federal.roomAt0).toBe(0)
    expect(r.federal.roomAt15).toBeCloseTo(545500 - 83900, 2)
  })

  it('marginal ordinary rate is 0 while income is still inside the standard deduction', () => {
    const r = calculateTax(input({ wages: 10000 })) // single, deduction 16100
    expect(r.federal.ordinaryTaxable).toBe(0)
    expect(r.federal.ordinaryTax).toBe(0)
    // the next ordinary dollar just uses up more deduction — it is not taxed
    expect(r.federal.marginalOrdinaryRate).toBe(0)
  })

  it('marginal ordinary rate is the current bracket once past the deduction', () => {
    const r = calculateTax(input({ wages: 100000 })) // single, taxable 83900 in 22% bracket
    expect(r.federal.marginalOrdinaryRate).toBe(0.22)
  })
})

describe('capital gains stacking on top of ordinary income', () => {
  it('splits LTCG across the 0% and 15% bands based on where ordinary income ends', () => {
    const r = calculateTax(input({ wages: 50000, longTermGains: 20000 }))
    // ordinary taxable = 33900, gains occupy [33900, 53900)
    expect(r.federal.capitalGainsBaseline).toBe(33900)
    // 15550 at 0%, 4450 at 15% = 667.50
    expect(r.federal.capitalGainsTax).toBeCloseTo(667.5, 2)
    const fill0 = r.federal.capitalGainsFills.find((f) => f.rate === 0)!
    const fill15 = r.federal.capitalGainsFills.find((f) => f.rate === 0.15)!
    expect(fill0.amountInBracket).toBeCloseTo(15550, 2)
    expect(fill15.amountInBracket).toBeCloseTo(4450, 2)
    expect(r.federal.roomAt0).toBe(0)
  })

  it('taxes gains entirely at 0% when they fit under the 0% ceiling, and reports room', () => {
    const r = calculateTax(input({ wages: 30000, longTermGains: 10000 }))
    // ordinary taxable = 13900, gains [13900, 23900) all under 49450
    expect(r.federal.capitalGainsTax).toBe(0)
    expect(r.federal.roomAt0).toBeCloseTo(49450 - 23900, 2)
  })

  it('reaches the 20% band for very large gains (single)', () => {
    const r = calculateTax(input({ longTermGains: 700000 }))
    // ordinary taxable = 0; deduction 16100 spills onto gains -> 683900 taxable
    expect(r.federal.preferentialTaxable).toBe(683900)
    const fill20 = r.federal.capitalGainsFills.find((f) => f.rate === 0.2)!
    expect(fill20.amountInBracket).toBeCloseTo(683900 - 545500, 2)
    expect(r.federal.roomAt15).toBe(0)
  })
})

describe('standard deduction spilling onto preferential income', () => {
  it('applies leftover deduction to preferential income when ordinary is exhausted', () => {
    const r = calculateTax(input({ wages: 10000, qualifiedDividends: 8000 }))
    expect(r.federal.ordinaryTaxable).toBe(0)
    // leftover deduction 6100 reduces the 8000 of qualified dividends to 1900 taxable
    expect(r.federal.preferentialTaxable).toBe(1900)
    expect(r.federal.preferentialDeduction).toBe(6100)
    // no income tax, but FICA still applies to the 10000 of gross wages (7.65% = 765)
    expect(r.federal.ordinaryTax).toBe(0)
    expect(r.federal.capitalGainsTax).toBe(0)
    expect(r.totalTax).toBeCloseTo(765, 2)
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
    expect(r.federal.preferentialDeduction).toBe(8200)
    // both sources reduced by the same 41% (8200/20000), not qual div first
    const qual = r.federal.layers.preferential.find((l) => l.source === 'qualifiedDividends')!
    const lt = r.federal.layers.preferential.find((l) => l.source === 'longTermGains')!
    expect(qual.taxableAmount).toBeCloseTo(5900, 2)
    expect(lt.taxableAmount).toBeCloseTo(5900, 2)
    expect(r.federal.preferentialTaxable).toBeCloseTo(11800, 2)
  })
})

describe('surcharges (light-bulb triggers)', () => {
  it('applies NIIT on the lesser of net investment income and MAGI over the threshold', () => {
    const r = calculateTax(input({ wages: 150000, longTermGains: 80000 }))
    // MAGI 230000, over 30000; NII 80000; base = min = 30000 -> 1140
    expect(niitOf(r).applies).toBe(true)
    expect(niitOf(r).taxedAmount).toBeCloseTo(30000, 2)
    expect(niitOf(r).amount).toBeCloseTo(1140, 2)
    expect(medicareOf(r).applies).toBe(false)
  })

  it('does not apply NIIT below the MAGI threshold', () => {
    const r = calculateTax(input({ wages: 50000, longTermGains: 20000 }))
    expect(niitOf(r).applies).toBe(false)
    expect(niitOf(r).amount).toBe(0)
  })

  it('applies Additional Medicare Tax on wages over the threshold', () => {
    const r = calculateTax(input({ wages: 250000 }))
    // 50000 over * 0.9%
    expect(medicareOf(r).applies).toBe(true)
    expect(medicareOf(r).amount).toBeCloseTo(450, 2)
    expect(niitOf(r).applies).toBe(false)
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

  it('attributes the wage-based surcharges (FICA + Additional Medicare) to wages', () => {
    const r = calculateTax(input({ wages: 250000 }))
    // wages carry every wage-attributed surcharge: SS (capped), Medicare, Add'l Medicare
    const wageSurcharges = r.federal.surcharges.reduce((s, x) => s + x.amount, 0)
    expect(wageSurcharges).toBeCloseTo(11439 + 3625 + 450, 2) // SS 184500*6.2% + Medicare 250k*1.45% + Add'l 50k*0.9%
    expect(sourceTax(r, 'wages')).toBeCloseTo(r.federal.ordinaryTax + wageSurcharges, 2)
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
    // so a wage dollar does NOT drag more NII under the cap. Wages 500k > SS cap, so
    // no more SS — but base Medicare (1.45%) + Add'l Medicare (0.9%) still ride the dollar.
    expect(rate(m, 'wages').totalRate).toBeCloseTo(0.3435, 5) // 32% + 1.45% Medicare + 0.9% Add'l
    expect(rate(m, 'wages').surtaxes.map((s) => s.label)).toEqual(['Medicare', "Add'l Medicare"])
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
    // wages 214k > SS cap (no SS) and < 250k (no Add'l Medicare), so base Medicare 1.45% + NIIT 3.8%
    expect(rate(m, 'wages').totalRate).toBeCloseTo(0.2725, 5) // 22% + 1.45% Medicare + 3.8% NIIT
    expect(rate(m, 'wages').surtaxes.map((s) => s.label)).toEqual(['Medicare', 'NIIT'])
    expect(rate(m, 'ordinaryInvestment').totalRate).toBeCloseTo(0.258, 5)
    expect(rate(m, 'preferential').totalRate).toBeCloseTo(0.188, 5)
  })

  it('charges 0 income tax inside the deduction, but FICA still hits the next wage dollar', () => {
    // MFJ, ordinary 24000 < 32200 deduction; preferential also partly shielded
    const r = calculateTax(
      input({ filingStatus: 'mfj', wages: 15000, interest: 4000, nonQualifiedDividends: 5000, qualifiedDividends: 60000 }),
    )
    const m = marginalNextDollar(r)
    // FICA is on gross wages regardless of the deduction: 6.2% SS + 1.45% Medicare
    expect(rate(m, 'wages').totalRate).toBeCloseTo(0.0765, 5)
    expect(rate(m, 'wages').surtaxes.map((s) => s.label)).toEqual(['Soc. Sec.', 'Medicare'])
    // an interest dollar carries no FICA — the wages-vs-interest difference
    expect(rate(m, 'ordinaryInvestment').totalRate).toBe(0)
    // gains top out at 51800 taxable, well inside the 0% cap-gains band
    expect(rate(m, 'preferential').totalRate).toBe(0)
  })

  it('bumps a shielded ordinary dollar that un-shields a gain onto the top of the stack', () => {
    // MFJ, ordinary 31200 < 32200 deduction → 1000 of deduction spills onto the gains.
    // A wage/interest dollar is inside the deduction (0% ordinary tax), but consuming it
    // un-shields a qualified-dividend dollar that lands at the top of the stack (in 15%).
    const r = calculateTax(
      input({ filingStatus: 'mfj', wages: 22200, interest: 4000, nonQualifiedDividends: 5000, qualifiedDividends: 100000 }),
    )
    expect(r.federal.ordinaryTaxable).toBe(0)
    expect(r.federal.preferentialTaxable).toBe(99000) // 100000 - 1000 spilled deduction
    expect(r.federal.marginalCapitalGainsRate).toBe(0.15) // 98900 at 0%, 100 at 15%
    expect(r.federal.marginalOrdinaryRate).toBe(0) // the dollar itself is inside the deduction
    expect(r.federal.marginalGainsBump).toEqual({ rate: 0.15, fromRate: 0, toRate: 0.15 })
    const m = marginalNextDollar(r)
    // interest dollar: 0 income tax + 15% bump = 15%. Wage dollar adds 7.65% FICA on top.
    expect(rate(m, 'wages').totalRate).toBeCloseTo(0.2265, 5)
    expect(rate(m, 'wages').surtaxes).toEqual([
      { label: 'Soc. Sec.', rate: 0.062, tone: 'surtax' },
      { label: 'Medicare', rate: 0.0145, tone: 'surtax' },
      { label: 'pushes a gain 0%→15%', rate: 0.15, tone: 'bump' },
    ])
    expect(rate(m, 'ordinaryInvestment').totalRate).toBeCloseTo(0.15, 5)
    expect(rate(m, 'preferential').totalRate).toBe(0.15)
  })

  it('bumps a taxable ordinary dollar that lifts the gains stack across the 0% ceiling', () => {
    // MFJ, ordinary income exactly at the 32200 deduction, gains fill 0% to the brim.
    // The next wage dollar is now taxable at 10% AND lifts the stack, shoving its top
    // qualified-dividend dollar out of 0% into 15%: 10¢ + 15¢ = 25¢.
    const r = calculateTax(
      input({ filingStatus: 'mfj', wages: 23200, interest: 4000, nonQualifiedDividends: 5000, qualifiedDividends: 98900 }),
    )
    expect(r.federal.ordinaryTaxable).toBe(0)
    expect(r.federal.roomAt0).toBe(0) // gains top out exactly at the 0% ceiling
    expect(r.federal.marginalOrdinaryRate).toBe(0.1)
    expect(r.federal.marginalGainsBump).toEqual({ rate: 0.15, fromRate: 0, toRate: 0.15 })
    const m = marginalNextDollar(r)
    // interest: 10% + 15% bump = 25%. Wage dollar adds 7.65% FICA (wages < SS cap) → 32.65%.
    expect(rate(m, 'wages').totalRate).toBeCloseTo(0.3265, 5)
    expect(rate(m, 'ordinaryInvestment').totalRate).toBeCloseTo(0.25, 5)
    expect(rate(m, 'preferential').totalRate).toBe(0.15) // a preferential dollar just pays 15%, no bump
  })

  it('bumps ordinary income when LTCG straddles the 0%/15% line (the cap-gains bump zone)', () => {
    // MFJ, wages 90000 (taxable 57800, 12% bracket) with 100000 LTCG straddling 98900.
    const r = calculateTax(input({ filingStatus: 'mfj', wages: 90000, longTermGains: 100000 }))
    expect(r.federal.ordinaryTaxable).toBe(57800)
    expect(r.federal.marginalOrdinaryRate).toBe(0.12)
    expect(r.federal.marginalGainsBump).toEqual({ rate: 0.15, fromRate: 0, toRate: 0.15 })
    const m = marginalNextDollar(r)
    // 12% + 15% bump = 27%, plus 7.65% FICA (wages 90k < SS cap) → 34.65%
    expect(rate(m, 'wages').totalRate).toBeCloseTo(0.3465, 5)
  })

  it('reports a 0% marginal rate when a net loss is income-limited (next dollar is absorbed)', () => {
    // Single 2026: 17000 wages, 3000 LT loss, 16100 standard deduction. Only preLossTaxable
    // (900) of the loss is usable this year; 2100 carries forward. The next dollar of income
    // raises the usable loss dollar-for-dollar, so it's absorbed — a true 0% marginal rate,
    // not the 10% bracket rate the standard-deduction leftover alone would report.
    const r = calculateTax(input({ wages: 17000, longTermGains: -3000 }))
    expect(r.federal.taxableIncome).toBe(0)
    expect(r.capitalGains.lossDeduction).toBe(900)
    expect(r.capitalGains.carryover).toEqual({ shortTerm: 0, longTerm: 2100 })
    expect(r.federal.marginalOrdinaryRate).toBe(0)
    expect(r.federal.marginalGainsBump).toBeNull()
  })

  it('adds no income-tax surtaxes below the thresholds, but wages still carry FICA', () => {
    const r = calculateTax(input({ wages: 100000 })) // single, no investment income
    const m = marginalNextDollar(r)
    // wages: 22% ordinary + 7.65% FICA (no NIIT/Add'l Medicare below their thresholds)
    expect(rate(m, 'wages').totalRate).toBeCloseTo(0.2965, 5)
    expect(rate(m, 'wages').surRate).toBeCloseTo(0.0765, 5)
    expect(rate(m, 'wages').surtaxes.map((s) => s.label)).toEqual(['Soc. Sec.', 'Medicare'])
    // interest and preferential carry no surtaxes at all here
    expect(rate(m, 'ordinaryInvestment').totalRate).toBe(0.22) // 22% ordinary, no NIIT, no FICA
    expect(rate(m, 'preferential').totalRate).toBe(0.15) // 15% cap gains, no NIIT
    expect(rate(m, 'ordinaryInvestment').surRate).toBe(0)
  })
})

describe('retirement distributions (ordinary, non-wage, non-investment)', () => {
  it('taxes retirement income at ordinary rates, identically to wages, but with no FICA', () => {
    const rmd = calculateTax(input({ retirementIncome: 100000 }))
    const wage = calculateTax(input({ wages: 100000 }))
    // same ordinary bracket fill as $100k of wages
    expect(rmd.federal.ordinaryTaxable).toBe(83900)
    expect(rmd.federal.ordinaryTax).toBeCloseTo(wage.federal.ordinaryTax, 2)
    // but no payroll tax: total equals income tax alone (wages carried +7650 FICA)
    expect(rmd.totalTax).toBeCloseTo(rmd.federal.ordinaryTax, 2)
    expect(surchargeAmount(rmd, 'socialSecurity')).toBe(0)
    expect(surchargeAmount(rmd, 'medicare')).toBe(0)
    expect(surchargeAmount(rmd, 'additionalMedicare')).toBe(0)
  })

  it('excludes retirement income from net investment income (no NIIT on it alone)', () => {
    // single: MAGI 300000 > 200000 threshold, but retirement is not investment income
    const r = calculateTax(input({ retirementIncome: 300000 }))
    expect(r.federal.marginalOrdinaryRate).toBeGreaterThan(0)
    expect(niitOf(r).investmentIncome).toBe(0)
    expect(niitOf(r).applies).toBe(false)
    expect(niitOf(r).amount).toBe(0)
  })

  it('raises MAGI so retirement income can push other investment income into NIIT', () => {
    // interest alone (40k) is below the 200k single threshold → no NIIT
    const withoutRmd = calculateTax(input({ interest: 40000 }))
    expect(niitOf(withoutRmd).applies).toBe(false)
    // add a large RMD: MAGI 340000 over by 140000, but NII is still just the 40k interest
    const withRmd = calculateTax(input({ interest: 40000, retirementIncome: 300000 }))
    expect(niitOf(withRmd).incomeOverThreshold).toBe(140000)
    expect(niitOf(withRmd).investmentIncome).toBe(40000) // retirement excluded
    expect(niitOf(withRmd).taxedAmount).toBe(40000) // NII binds, not MAGI-over
    expect(niitOf(withRmd).amount).toBeCloseTo(1520, 2) // 40000 * 3.8%
  })

  it('charges no FICA on the next retirement dollar; NIIT only when the MAGI cap binds', () => {
    // simple case: below all thresholds — ordinary rate only, no surtaxes
    const simple = marginalNextDollar(calculateTax(input({ retirementIncome: 100000 })))
    const rmdSimple = simple.find((s) => s.key === 'retirement')!
    expect(rmdSimple.totalRate).toBe(0.22) // 22% ordinary, no FICA, no NIIT
    expect(rmdSimple.surtaxes).toEqual([])

    // MAGI-cap-binding case (mirror of the wages NIIT test): MAGI 294k over by 44k < NII 80k
    const r = calculateTax(
      input({
        filingStatus: 'mfj',
        retirementIncome: 214000,
        interest: 6000,
        nonQualifiedDividends: 10000,
        qualifiedDividends: 64000,
      }),
    )
    const rmd = marginalNextDollar(r).find((s) => s.key === 'retirement')!
    // 22% ordinary + 3.8% NIIT (raising the RMD pulls more NII under the cap), but NO FICA
    expect(rmd.totalRate).toBeCloseTo(0.258, 5)
    expect(rmd.surtaxes.map((s) => s.label)).toEqual(['NIIT'])
  })
})

describe('filing status differences', () => {
  it('uses MFJ brackets and deduction', () => {
    const r = calculateTax(input({ filingStatus: 'mfj', wages: 100000 }))
    // taxable = 100000 - 32200 = 67800
    expect(r.federal.ordinaryTaxable).toBe(67800)
    // 10% on 24800 = 2480; 12% on (67800-24800)=43000 -> 5160
    expect(r.federal.ordinaryTax).toBeCloseTo(7640, 2)
    expect(r.federal.marginalOrdinaryRate).toBe(0.12)
  })

  it('uses HoH brackets, deduction, and LTCG breakpoints', () => {
    const r = calculateTax(input({ filingStatus: 'hoh', wages: 100000, longTermGains: 100000 }))
    // taxable = 100000 - 24150 = 75850
    expect(r.federal.ordinaryTaxable).toBe(75850)
    // 10%*17700 + 12%*(67450-17700) + 22%*(75850-67450) = 1770 + 5970 + 1848
    expect(r.federal.ordinaryTax).toBeCloseTo(9588, 2)
    expect(r.federal.marginalOrdinaryRate).toBe(0.22)
    // gains stack from 75850; HoH 0% ends at 66200 (already passed) -> all in 15%
    expect(r.federal.capitalGainsTax).toBeCloseTo(15000, 2) // 100000 * 15%
    expect(r.federal.roomAt0).toBe(0)
  })

  it('uses MFS brackets and deduction', () => {
    const r = calculateTax(input({ filingStatus: 'mfs', wages: 60000 }))
    // taxable = 60000 - 16100 = 43900
    expect(r.federal.ordinaryTaxable).toBe(43900)
    // 10%*12400 + 12%*(43900-12400) = 1240 + 3780
    expect(r.federal.ordinaryTax).toBeCloseTo(5020, 2)
    expect(r.federal.marginalOrdinaryRate).toBe(0.12)
  })

  it('reaches the MFS 20% LTCG band at its lower breakpoint', () => {
    // MFS 15% top is 306850; big gains cross into 20%
    const r = calculateTax(input({ filingStatus: 'mfs', longTermGains: 400000 }))
    // deduction 16100 spills onto gains -> 383900 taxable
    expect(r.federal.preferentialTaxable).toBe(383900)
    const fill20 = r.federal.capitalGainsFills.find((f) => f.rate === 0.2)!
    expect(fill20.amountInBracket).toBeCloseTo(383900 - 306850, 2) // 77050 at 20%
  })
})

describe('income classification and NIIT branches', () => {
  it('taxes short-term gains and non-qualified dividends as ordinary income', () => {
    const r = calculateTax(input({ shortTermGains: 40000, nonQualifiedDividends: 10000 }))
    expect(r.preferentialIncome).toBe(0)
    expect(r.ordinaryIncome).toBe(50000)
    // single: taxable 33900 -> 10%*12400 + 12%*(33900-12400)
    expect(r.federal.ordinaryTaxable).toBe(33900)
    expect(r.federal.ordinaryTax).toBeCloseTo(3820, 2)
    expect(r.federal.capitalGainsTax).toBe(0)
  })

  it('taxes NIIT on net investment income when it is the binding lesser', () => {
    // single: MAGI 305000, over 105000, but NII is only 5000 -> NII binds
    const r = calculateTax(input({ wages: 300000, interest: 5000 }))
    expect(niitOf(r).incomeOverThreshold).toBe(105000)
    expect(niitOf(r).investmentIncome).toBe(5000)
    expect(niitOf(r).taxedAmount).toBe(5000)
    expect(niitOf(r).amount).toBeCloseTo(190, 2) // 5000 * 3.8%
    // Additional Medicare: wages 300000 over 200000 -> 100000 * 0.9%
    expect(medicareOf(r).amount).toBeCloseTo(900, 2)
  })

  it('does not add NIIT to the next wage dollar when NII is the binding lesser', () => {
    const r = calculateTax(input({ wages: 300000, interest: 5000 }))
    const m = marginalNextDollar(r)
    const wages = m.find((s) => s.key === 'wages')!
    // 35% ordinary + 1.45% Medicare + 0.9% Add'l Medicare; NO NIIT (raising wages can't
    // pull more than NII allows) and NO SS (wages 300k > cap).
    expect(wages.totalRate).toBeCloseTo(0.3735, 5)
    expect(wages.surtaxes.map((s) => s.label)).toEqual(['Medicare', "Add'l Medicare"])
  })

  it('reaches a 20% + NIIT marginal rate on the next preferential dollar', () => {
    const r = calculateTax(input({ longTermGains: 600000 })) // single
    const m = marginalNextDollar(r)
    // taxable gains 583900 > 545500 -> 20% band; MAGI over threshold -> +3.8% NIIT
    expect(r.federal.marginalCapitalGainsRate).toBe(0.2)
    expect(m.find((s) => s.key === 'preferential')!.totalRate).toBeCloseTo(0.238, 5)
  })
})

describe('edge cases', () => {
  it('handles zero income without dividing by zero', () => {
    const r = calculateTax(input({}))
    expect(r.totalIncome).toBe(0)
    expect(r.totalTax).toBe(0)
    expect(r.effectiveRate).toBe(0)
    expect(r.federal.marginalOrdinaryRate).toBe(0) // still inside the deduction
  })

  it('clamps negative inputs to zero', () => {
    const r = calculateTax(input({ wages: -5000, interest: -100 }))
    expect(r.totalIncome).toBe(0)
    expect(r.ordinaryIncome).toBe(0)
  })

  it('treats a missing field (e.g. older saved input) as 0, not NaN', () => {
    // Simulate localStorage saved before retirementIncome existed.
    const stale = { filingStatus: 'single', wages: 50000 } as unknown as TaxInput
    const r = calculateTax(stale)
    expect(r.ordinaryIncome).toBe(50000)
    expect(Number.isNaN(r.totalTax)).toBe(false)
    expect(r.totalTax).toBeGreaterThan(0)
  })
})

describe('capital-gains netting and net-loss deduction', () => {
  it('nets a short-term loss into the long-term gain (survives as long-term)', () => {
    const r = calculateTax(input({ wages: 50000, shortTermGains: -100, longTermGains: 20000 }))
    expect(r.capitalGains.taxableShortTerm).toBe(0)
    expect(r.capitalGains.taxableLongTerm).toBe(19900) // 20000 − 100 ST loss
    expect(r.capitalGains.lossDeduction).toBe(0)
    expect(r.preferentialIncome).toBe(19900)
    // ordinary income is untouched: the ST loss offset the LT gain, not wages.
    expect(r.ordinaryIncome).toBe(50000)
  })

  it('reduces ordinary tax by exactly the net-loss deduction × marginal rate', () => {
    const base = calculateTax(input({ wages: 100000 })) // ordinaryTaxable 83900 in the 22% band
    const withLoss = calculateTax(input({ wages: 100000, shortTermGains: 100, longTermGains: -1000 }))
    // Net loss = 900 → $900 deducted from ordinary income (all inside the 22% band).
    expect(withLoss.capitalGains.taxableShortTerm).toBe(0)
    expect(withLoss.capitalGains.taxableLongTerm).toBe(0)
    expect(withLoss.capitalGains.lossDeduction).toBe(900)
    // 100000 wages − 900 net loss − 16100 single standard deduction
    expect(withLoss.federal.ordinaryTaxable).toBe(83000)
    expect(base.federal.ordinaryTax - withLoss.federal.ordinaryTax).toBeCloseTo(900 * 0.22, 2)
    // FICA on wages is unchanged, so total tax drops by the same amount.
    expect(base.totalTax - withLoss.totalTax).toBeCloseTo(900 * 0.22, 2)
  })

  it('caps the deduction at $3,000 and reports the long-term carryover', () => {
    const r = calculateTax(input({ wages: 100000, longTermGains: -20000 }))
    expect(r.capitalGains.lossDeduction).toBe(3000)
    expect(r.capitalGains.carryover).toEqual({ shortTerm: 0, longTerm: 17000 })
    expect(r.federal.ordinaryTaxable).toBe(80900) // 100000 − 3000 loss − 16100 deduction
  })

  it('applies the $1,500 cap for married-filing-separately', () => {
    const r = calculateTax(input({ filingStatus: 'mfs', wages: 100000, longTermGains: -5000 }))
    expect(r.capitalGains.lossDeduction).toBe(1500)
    expect(r.capitalGains.carryover).toEqual({ shortTerm: 0, longTerm: 3500 })
  })

  it('never offsets qualified dividends with a capital loss', () => {
    const r = calculateTax(input({ wages: 50000, qualifiedDividends: 5000, longTermGains: -1000 }))
    expect(r.preferentialIncome).toBe(5000) // dividends survive; only the LT gain is zeroed
    expect(r.capitalGains.taxableLongTerm).toBe(0)
    expect(r.capitalGains.lossDeduction).toBe(1000)
    expect(sourceTax(r, 'qualifiedDividends')).toBeGreaterThanOrEqual(0)
    expect(sourceTax(r, 'longTermGains')).toBe(0)
  })

  it('passes two capital gains through unchanged', () => {
    const r = calculateTax(input({ wages: 50000, shortTermGains: 100, longTermGains: 1000 }))
    expect(r.capitalGains.taxableShortTerm).toBe(100)
    expect(r.capitalGains.taxableLongTerm).toBe(1000)
    expect(r.capitalGains.lossDeduction).toBe(0)
  })

  it('keeps NIIT non-negative and unassessed under a capital loss', () => {
    const r = calculateTax(input({ wages: 100000, interest: 500, longTermGains: -5000 }))
    const niit = niitOf(r)
    expect(niit.amount).toBe(0)
    expect(niit.taxedAmount).toBeGreaterThanOrEqual(0)
  })

  it('assesses NIIT on the netted gain, not the gross long-term gain', () => {
    // High wages keep MAGI far over the $200k threshold, so NIIT is bound by net
    // investment income rather than the MAGI overage. A −$30,000 short-term loss nets
    // the $50,000 long-term gain down to $20,000, and NIIT is assessed on that netted
    // $20,000 — not the $50,000 gross gain (which would tax $760 more).
    const r = calculateTax(input({ wages: 400000, shortTermGains: -30000, longTermGains: 50000 }))
    expect(r.capitalGains.taxableLongTerm).toBe(20000)
    expect(niitOf(r).applies).toBe(true)
    expect(niitOf(r).taxedAmount).toBeCloseTo(20000, 2)
    expect(niitOf(r).amount).toBeCloseTo(760, 2) // 20000 × 3.8%
  })

  it('drops NIIT when a net capital loss pulls MAGI back under the threshold', () => {
    // $199k wages + $2k interest = $201k MAGI, just over the single $200k threshold, so
    // NIIT applies (on the $1,000 overage).
    const base = calculateTax(input({ wages: 199000, interest: 2000 }))
    expect(niitOf(base).applies).toBe(true)
    // A net capital loss deducts $3,000 from income, dropping MAGI to $198,000 — under
    // the threshold — so NIIT is no longer assessed at all.
    const withLoss = calculateTax(input({ wages: 199000, interest: 2000, longTermGains: -5000 }))
    expect(withLoss.capitalGains.lossDeduction).toBe(3000)
    expect(niitOf(withLoss).applies).toBe(false)
    expect(niitOf(withLoss).amount).toBe(0)
  })

  it('uses short-term losses first against the deduction, carrying long-term forward', () => {
    // −2000 ST, −2000 LT: allowed capped at $3,000; ST $2,000 used first, then $1,000 LT,
    // leaving $1,000 of long-term loss to carry forward.
    const r = calculateTax(input({ wages: 100000, shortTermGains: -2000, longTermGains: -2000 }))
    expect(r.capitalGains.lossDeduction).toBe(3000)
    expect(r.capitalGains.carryover).toEqual({ shortTerm: 0, longTerm: 1000 })
  })

  it('carries the whole loss forward when income is below the standard deduction', () => {
    // $2,000 of wages is fully covered by the $16,100 standard deduction, so there is no
    // taxable income for the loss to offset — the entire $3,000 carries forward.
    const r = calculateTax(input({ wages: 2000, longTermGains: -3000 }))
    expect(r.capitalGains.lossDeduction).toBe(0)
    expect(r.capitalGains.carryover).toEqual({ shortTerm: 0, longTerm: 3000 })
    expect(r.federal.ordinaryTaxable).toBe(0)
  })

  it('limits the deduction to the taxable income available to absorb it', () => {
    // $17,000 wages − $16,100 standard deduction = $900 of taxable income, so only $900 of
    // the loss is used this year and $2,100 carries forward.
    const r = calculateTax(input({ wages: 17000, longTermGains: -3000 }))
    expect(r.capitalGains.lossDeduction).toBe(900)
    expect(r.capitalGains.carryover).toEqual({ shortTerm: 0, longTerm: 2100 })
    expect(r.federal.ordinaryTaxable).toBe(0)
  })

  it('lets a loss offset preferential taxable income when ordinary income is tiny', () => {
    // Only $2,000 ordinary income but $50,000 qualified dividends: taxable income is ample,
    // so the full $3,000 loss is used (spilling past ordinary onto the preferential base)
    // and nothing carries forward.
    const r = calculateTax(input({ wages: 2000, qualifiedDividends: 50000, longTermGains: -3000 }))
    expect(r.capitalGains.lossDeduction).toBe(3000)
    expect(r.capitalGains.carryover).toEqual({ shortTerm: 0, longTerm: 0 })
  })

  it('keeps per-source attribution reconciled when a loss spills onto preferential income', () => {
    // Same spill case ($2k wages / $50k QD / $3k LT loss): $1,000 of the loss deduction lands
    // on the preferential base. The per-source slices must still sum to the totals — the
    // preferential layers to preferentialTaxable, and every source's tax to totalTax. (Before
    // the fix, attribution shrank the gross $50k by only the standard-deduction shield, missing
    // the loss spill, so qualified dividends over-summed.)
    const r = calculateTax(input({ wages: 2000, qualifiedDividends: 50000, longTermGains: -3000 }))
    const prefTaxableSum = r.federal.layers.preferential.reduce((s, l) => s + l.taxableAmount, 0)
    expect(prefTaxableSum).toBeCloseTo(r.federal.preferentialTaxable, 2)
    const sourceTaxSum = r.sourceBreakdown.reduce((acc, b) => acc + b.tax, 0)
    expect(sourceTaxSum).toBeCloseTo(r.totalTax, 2)
  })
})
