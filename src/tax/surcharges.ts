import {
  ADDITIONAL_MEDICARE_RATE,
  ADDITIONAL_MEDICARE_THRESHOLD,
  MEDICARE_RATE,
  NIIT_RATE,
  NIIT_THRESHOLD,
  SOCIAL_SECURITY_RATE,
  SOCIAL_SECURITY_WAGE_BASE,
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
  const label = 'Net Investment Income'
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
  const label = 'Additional Medicare'
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

/**
 * Social Security (OASDI): 6.2% on wages up to the wage-base cap, 0% above it. The cap is
 * the inverse of a threshold — the rate applies *below* it — so `cap` carries that boundary.
 */
export function socialSecurityRule(): SurchargeRule {
  const cap = SOCIAL_SECURITY_WAGE_BASE
  const label = 'Social Security'
  return {
    key: 'socialSecurity',
    label,
    shortLabel: 'Soc. Sec.',
    rate: SOCIAL_SECURITY_RATE,
    attribution: { kind: 'wages' },
    assess(ctx) {
      const taxedAmount = Math.min(ctx.wages, cap)
      const amount = taxedAmount * SOCIAL_SECURITY_RATE
      return {
        key: 'socialSecurity',
        label,
        applies: amount > 0,
        rate: SOCIAL_SECURITY_RATE,
        threshold: 0,
        cap,
        incomeMeasured: ctx.wages,
        // Wages above the cap escape SS — informative for the display, not itself taxed.
        incomeOverThreshold: Math.max(0, ctx.wages - cap),
        taxedAmount,
        amount,
      }
    },
    // A wage dollar incurs SS only while wages are still under the cap.
    marginalRate(type, a) {
      return type === 'wages' && a.incomeMeasured < cap ? SOCIAL_SECURITY_RATE : 0
    },
  }
}

/** Medicare (HI): 1.45% on all wages, no cap. The 0.9% Additional Medicare rides on top. */
export function medicareBaseRule(): SurchargeRule {
  const label = 'Medicare'
  return {
    key: 'medicare',
    label,
    shortLabel: 'Medicare',
    rate: MEDICARE_RATE,
    attribution: { kind: 'wages' },
    assess(ctx) {
      const amount = ctx.wages * MEDICARE_RATE
      return {
        key: 'medicare',
        label,
        applies: amount > 0,
        rate: MEDICARE_RATE,
        threshold: 0,
        incomeMeasured: ctx.wages,
        incomeOverThreshold: 0,
        taxedAmount: ctx.wages,
        amount,
      }
    },
    marginalRate(type) {
      return type === 'wages' ? MEDICARE_RATE : 0
    },
  }
}

/** The surcharges that ride on top of the federal income tax. */
export function federalSurchargeRules(filingStatus: FilingStatus): SurchargeRule[] {
  return [socialSecurityRule(), medicareBaseRule(), medicareRule(filingStatus), niitRule(filingStatus)]
}
