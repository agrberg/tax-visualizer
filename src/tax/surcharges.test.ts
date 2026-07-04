import { describe, it, expect } from 'vitest'
import { medicareRule, niitRule } from './surcharges'

describe('niitRule', () => {
  const rule = niitRule('mfj') // threshold 250000

  it('taxes the lesser of NII and MAGI over the threshold', () => {
    const a = rule.assess({ wages: 200000, netInvestmentIncome: 100000, magi: 300000 })
    expect(a.incomeOverThreshold).toBe(50000) // MAGI over is the lesser
    expect(a.taxedAmount).toBe(50000)
    expect(a.amount).toBeCloseTo(1900, 5)
    expect(a.applies).toBe(true)
  })

  it('does not apply below the threshold', () => {
    const a = rule.assess({ wages: 100000, netInvestmentIncome: 50000, magi: 150000 })
    expect(a.applies).toBe(false)
    expect(a.amount).toBe(0)
  })

  it('hits a wage dollar only when the MAGI cap binds below NII', () => {
    const capBinds = rule.assess({ wages: 200000, netInvestmentIncome: 100000, magi: 290000 }) // over 40k < NII 100k
    expect(rule.marginalRate('wages', capBinds)).toBeCloseTo(0.038, 5)
    expect(rule.marginalRate('ordinaryInvestment', capBinds)).toBeCloseTo(0.038, 5)

    const niiBinds = rule.assess({ wages: 500000, netInvestmentIncome: 100000, magi: 600000 }) // over 350k > NII 100k
    expect(rule.marginalRate('wages', niiBinds)).toBe(0) // more wages can't pull more NII under the cap
    expect(rule.marginalRate('preferential', niiBinds)).toBeCloseTo(0.038, 5)
  })
})

describe('medicareRule', () => {
  const rule = medicareRule('single') // threshold 200000

  it('taxes wages over the threshold', () => {
    const a = rule.assess({ wages: 250000, netInvestmentIncome: 0, magi: 250000 })
    expect(a.incomeOverThreshold).toBe(50000)
    expect(a.amount).toBeCloseTo(450, 5)
    expect(rule.marginalRate('wages', a)).toBeCloseTo(0.009, 5)
    expect(rule.marginalRate('ordinaryInvestment', a)).toBe(0)
    expect(rule.marginalRate('preferential', a)).toBe(0)
  })
})
