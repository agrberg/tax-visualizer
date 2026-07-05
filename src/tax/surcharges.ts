import {
  ADDITIONAL_MEDICARE_RATE,
  ADDITIONAL_MEDICARE_THRESHOLD,
  NIIT_RATE,
  NIIT_THRESHOLD,
} from './brackets'
import type { FilingStatus, MarginalScenario, SurchargeResult } from './types'

/** The income facts a surcharge is assessed against. */
export interface SurchargeContext {
  wages: number
  netInvestmentIncome: number
  magi: number
}

/**
 * How a surcharge's dollars attach to income sources in the per-source breakdown:
 * `wages` puts the whole amount on wages; `investment` spreads it proportionally
 * over the investment sources by gross amount.
 */
export type SurchargeAttribution = { kind: 'wages' } | { kind: 'investment' }

/**
 * A surcharge rule owns *both* how it is assessed and how it hits the next dollar,
 * so the two never drift apart. `marginalRate` returns the rate this surcharge adds
 * to one more dollar of the given income type, given its own assessed result.
 * `attribution` declares how its dollars land on sources in the breakdown.
 */
export interface SurchargeRule {
  key: string
  label: string
  shortLabel: string
  rate: number
  attribution: SurchargeAttribution
  assess(ctx: SurchargeContext): SurchargeResult
  marginalRate(type: MarginalScenario['key'], assessed: SurchargeResult): number
}

/** NIIT: 3.8% on the lesser of net investment income and MAGI over the threshold. */
export function niitRule(filingStatus: FilingStatus): SurchargeRule {
  const threshold = NIIT_THRESHOLD[filingStatus]
  const label = 'Net Investment Income Tax'
  return {
    key: 'niit',
    label,
    shortLabel: 'NIIT',
    rate: NIIT_RATE,
    attribution: { kind: 'investment' },
    assess(ctx) {
      const incomeOverThreshold = Math.max(0, ctx.magi - threshold)
      const taxedAmount = Math.min(ctx.netInvestmentIncome, incomeOverThreshold)
      const amount = taxedAmount * NIIT_RATE
      return {
        key: 'niit',
        label,
        applies: amount > 0,
        rate: NIIT_RATE,
        threshold,
        incomeMeasured: ctx.magi,
        incomeOverThreshold,
        taxedAmount,
        amount,
        investmentIncome: ctx.netInvestmentIncome,
      }
    },
    // An investment/preferential dollar always incurs NIIT once MAGI is over the
    // threshold. A wage dollar does only when the MAGI-over-threshold cap is below
    // net investment income (raising MAGI then pulls more NII under the cap).
    marginalRate(type, a) {
      if (a.incomeOverThreshold <= 0) return 0
      if (type === 'wages') return a.incomeOverThreshold < (a.investmentIncome ?? 0) ? NIIT_RATE : 0
      return NIIT_RATE
    },
  }
}

/** Additional Medicare Tax: 0.9% on wages over the (statutory) threshold. */
export function medicareRule(filingStatus: FilingStatus): SurchargeRule {
  const threshold = ADDITIONAL_MEDICARE_THRESHOLD[filingStatus]
  const label = 'Additional Medicare Tax'
  return {
    key: 'additionalMedicare',
    label,
    shortLabel: "Add'l Medicare",
    rate: ADDITIONAL_MEDICARE_RATE,
    attribution: { kind: 'wages' },
    assess(ctx) {
      const incomeOverThreshold = Math.max(0, ctx.wages - threshold)
      const amount = incomeOverThreshold * ADDITIONAL_MEDICARE_RATE
      return {
        key: 'additionalMedicare',
        label,
        applies: amount > 0,
        rate: ADDITIONAL_MEDICARE_RATE,
        threshold,
        incomeMeasured: ctx.wages,
        incomeOverThreshold,
        taxedAmount: incomeOverThreshold,
        amount,
      }
    },
    marginalRate(type, a) {
      return type === 'wages' && a.incomeOverThreshold > 0 ? ADDITIONAL_MEDICARE_RATE : 0
    },
  }
}

/** The surcharges that ride on top of the federal income tax. */
export function federalSurchargeRules(filingStatus: FilingStatus): SurchargeRule[] {
  return [niitRule(filingStatus), medicareRule(filingStatus)]
}
