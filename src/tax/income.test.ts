import { describe, it, expect } from 'vitest'
import { classifyIncome, nettedCapitalGains } from './income'
import { makeInput as input } from './testUtils'

const net = (st: number, lt: number) => nettedCapitalGains(st, lt)

describe('nettedCapitalGains', () => {
  it('leaves two gains untouched (each taxed in its own pool)', () => {
    expect(net(100, 1000)).toEqual({
      shortTermGains: 100,
      longTermGains: 1000,
      shortTermLoss: 0,
      longTermLoss: 0,
    })
  })

  it('offsets a short-term loss against a long-term gain, surviving as long-term (§1222(11))', () => {
    expect(net(-100, 1000)).toMatchObject({ shortTermGains: 0, longTermGains: 900 })
  })

  it('offsets a long-term loss against a short-term gain, surviving as short-term', () => {
    expect(net(1000, -100)).toMatchObject({ shortTermGains: 900, longTermGains: 0 })
  })

  it('treats a net long-term loss as $0 taxable, preserving the loss by character', () => {
    // +100 ST, −1000 LT → combined −900 net loss on the long-term character.
    expect(net(100, -1000)).toEqual({
      shortTermGains: 0,
      longTermGains: 0,
      shortTermLoss: 0,
      longTermLoss: 900,
    })
  })

  it('sums two losses by character', () => {
    expect(net(-100, -1000)).toEqual({
      shortTermGains: 0,
      longTermGains: 0,
      shortTermLoss: 100,
      longTermLoss: 1000,
    })
  })

  it('treats an exactly-offsetting pair as a wash (no gain, no loss)', () => {
    expect(net(-1000, 1000)).toEqual({
      shortTermGains: 0,
      longTermGains: 0,
      shortTermLoss: 0,
      longTermLoss: 0,
    })
  })

  it('handles a lone gain or lone loss on either leg', () => {
    expect(net(0, 500)).toMatchObject({ longTermGains: 500 })
    expect(net(500, 0)).toMatchObject({ shortTermGains: 500 })
    expect(net(0, -500)).toMatchObject({ longTermLoss: 500 })
    expect(net(-500, 0)).toMatchObject({ shortTermLoss: 500 })
  })

  it('preserves the full loss by character regardless of magnitude (the cap is applied downstream)', () => {
    // A lone $20,000 long-term loss keeps its full magnitude here; the §1211(b) cap and the
    // income limit are applied by the jurisdiction, not this pure netting step.
    expect(net(0, -20000)).toMatchObject({ longTermLoss: 20000 })
  })

  it('coerces non-finite inputs to 0', () => {
    expect(net(Number.NaN, 500)).toMatchObject({ shortTermGains: 0, longTermGains: 500 })
    expect(net(300, Number.POSITIVE_INFINITY)).toMatchObject({ shortTermGains: 300, longTermGains: 0 })
  })
})

describe('classifyIncome capital-gains netting', () => {
  it('nets a short-term loss into the long-term gain before pooling', () => {
    const c = classifyIncome(input({ wages: 100000, shortTermGains: -100, longTermGains: 1000 }))
    expect(c.amounts.shortTermGains).toBe(0)
    expect(c.amounts.longTermGains).toBe(900)
    expect(c.ordinaryIncome).toBe(100000) // the ST loss did not subtract from ordinary income
    expect(c.preferentialIncome).toBe(900)
    expect(c.capitalNetLoss).toEqual({ shortTerm: 0, longTerm: 0 })
  })

  it('reports a net capital loss as $0 taxable gains plus the residual loss by character', () => {
    const c = classifyIncome(input({ wages: 100000, shortTermGains: 100, longTermGains: -1000 }))
    expect(c.amounts.shortTermGains).toBe(0)
    expect(c.amounts.longTermGains).toBe(0)
    expect(c.capitalNetLoss).toEqual({ shortTerm: 0, longTerm: 900 })
  })

  it('never offsets qualified dividends with a capital loss', () => {
    const c = classifyIncome(input({ qualifiedDividends: 500, longTermGains: -1000 }))
    expect(c.amounts.qualifiedDividends).toBe(500) // untouched — dividends are not capital gains
    expect(c.amounts.longTermGains).toBe(0)
    expect(c.preferentialIncome).toBe(500)
    expect(c.capitalNetLoss).toEqual({ shortTerm: 0, longTerm: 1000 })
  })

  it('keeps net investment income at ≥0 under a capital loss', () => {
    const c = classifyIncome(input({ interest: 200, longTermGains: -5000 }))
    expect(c.netInvestmentIncome).toBe(200) // only the surviving positive sources
    expect(c.netInvestmentIncome).toBeGreaterThanOrEqual(0)
  })
})
