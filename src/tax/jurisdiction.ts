import { fillBands, marginalRateAt, type Band } from './engine'
import { applyDeduction } from './deduction'
import { ordinaryLayers, preferentialLayers } from './attribution'
import type { ClassifiedIncome } from './income'
import type { SurchargeRule } from './surcharges'
import type { JurisdictionResult } from './types'

/**
 * A taxing jurisdiction as data: an ordinary ladder, a deduction, an optional
 * preferential (capital-gains) ladder, and its surcharges. Federal supplies all
 * four; a typical state supplies ordinary brackets + deduction and no ladder.
 */
export interface Jurisdiction {
  key: string
  ordinaryBands: Band[]
  standardDeduction: number
  /** IRC §1211(b) annual net-capital-loss deduction limit for this filing status ($3,000/$1,500 MFS federally). */
  capitalLossLimit: number
  preferentialLadder?: Band[]
  surcharges: SurchargeRule[]
}

/** Run the shared classified income through one jurisdiction's rules. */
export function computeJurisdiction(j: Jurisdiction, income: ClassifiedIncome): JurisdictionResult {
  const ladder = j.preferentialLadder
  const hasLadder = ladder !== undefined

  // Without a preferential ladder (typical state), preferential income is taxed as
  // ordinary. Per-source attribution of that folded income is a follow-up for when
  // state support ships; federal always has a ladder, so this path is unused today.
  const grossOrdinary = hasLadder ? income.ordinaryIncome : income.ordinaryIncome + income.preferentialIncome
  const grossPreferential = hasLadder ? income.preferentialIncome : 0

  // A net capital loss offsets income (IRC §1211(b)), but only up to two limits: the annual
  // filing-status cap (`capitalLossLimit`) and the taxable income available to absorb it — it
  // can't drive taxable income below zero. `preLossTaxable` is the taxable income there would
  // be with no loss; the deduction is the net loss clamped by both, and the unused remainder
  // carries forward (IRC §1212(b)). The loss reduces AGI *before* the standard deduction,
  // ordinary side first; only a loss exceeding all ordinary income (rare: under ~$3k of
  // ordinary income) reaches the preferential base.
  const netCapitalLoss = income.capitalNetLoss.shortTerm + income.capitalNetLoss.longTerm
  const preLossTaxable = Math.max(0, grossOrdinary + grossPreferential - j.standardDeduction)
  const lossDeduction = Math.min(netCapitalLoss, j.capitalLossLimit, preLossTaxable)
  const ordinaryIncome = Math.max(0, grossOrdinary - lossDeduction)
  const lossAbsorbedOnOrdinary = grossOrdinary - ordinaryIncome
  const lossSpilledToPreferential = lossDeduction - lossAbsorbedOnOrdinary
  const preferentialIncome = Math.max(0, grossPreferential - lossSpilledToPreferential)

  // §1212(b): carry the unused loss forward, short-term used against the deduction first.
  const usedShort = Math.min(lossDeduction, income.capitalNetLoss.shortTerm)
  const capitalLossCarryover = {
    shortTerm: income.capitalNetLoss.shortTerm - usedShort,
    longTerm: income.capitalNetLoss.longTerm - (lossDeduction - usedShort),
  }

  const { deductionOnOrdinary, leftoverDeduction, ordinaryTaxable, preferentialTaxable, preferentialDeduction } =
    applyDeduction(j.standardDeduction, ordinaryIncome, preferentialIncome)

  // Fraction of *gross* preferential income that ends up taxable, for per-source attribution.
  // Two things reduce the preferential base — the standard-deduction leftover and any spill of
  // the capital-loss deduction past ordinary income — and neither has holding-period character,
  // so they shrink each source proportionally. Deriving the fraction from grossPreferential
  // (not the loss-reduced base applyDeduction saw) keeps the per-source slices summing to
  // preferentialTaxable when a loss spills over.
  const preferentialShieldFraction =
    grossPreferential > 0 ? 1 - preferentialTaxable / grossPreferential : 0

  const ordinaryFills = fillBands(0, ordinaryTaxable, j.ordinaryBands)
  const ordinaryTax = ordinaryFills.reduce((s, f) => s + f.taxInBracket, 0)

  // Preferential income stacks on top of ordinary taxable income.
  const capitalGainsBaseline = ordinaryTaxable
  const capitalGainsFills = ladder ? fillBands(capitalGainsBaseline, preferentialTaxable, ladder) : []
  const capitalGainsTax = capitalGainsFills.reduce((s, f) => s + f.taxInBracket, 0)

  const topOfGains = capitalGainsBaseline + preferentialTaxable
  const rate0Max = ladder?.[0]?.max ?? 0
  const rate15Max = ladder?.[1]?.max ?? 0
  const roomAt0 = hasLadder ? Math.max(0, rate0Max - topOfGains) : 0
  const roomAt15 = hasLadder ? Math.max(0, rate15Max - topOfGains) : 0

  const nextOrdinaryDollarShielded = leftoverDeduction > 0
  const nextPreferentialDollarShielded = leftoverDeduction > preferentialIncome

  // Rate a dollar at `pos` on the preferential ladder pays (ordinary ladder when none).
  const cgRateAt = (pos: number): number => marginalRateAt(pos, ladder ?? j.ordinaryBands)

  const marginalCapitalGainsRate = nextPreferentialDollarShielded ? 0 : cgRateAt(topOfGains)
  const marginalOrdinaryRate = nextOrdinaryDollarShielded ? 0 : marginalRateAt(ordinaryTaxable, j.ordinaryBands)

  // The "capital-gains bump": an ordinary dollar moves a gain between preferential
  // bands — inside the deduction it un-shields a gain onto the top of the stack, past
  // it lifts the whole stack (bottom-rate → top-rate). Only meaningful with a ladder.
  const bumpFrom = nextOrdinaryDollarShielded ? 0 : cgRateAt(capitalGainsBaseline)
  const bumpTo = nextOrdinaryDollarShielded ? marginalCapitalGainsRate : cgRateAt(topOfGains)
  const marginalGainsBump =
    hasLadder && bumpTo > bumpFrom ? { rate: bumpTo - bumpFrom, fromRate: bumpFrom, toRate: bumpTo } : null

  // The capital-loss deduction reduces AGI, hence MAGI (the NIIT threshold basis). Use the
  // amount actually used this year (income-limited), not the pre-limit allowance — a loss
  // the income couldn't absorb carried forward instead of reducing this year's MAGI.
  const magi = income.totalIncome - lossDeduction
  const surcharges = j.surcharges.map((rule) =>
    rule.assess({ wages: income.amounts.wages, netInvestmentIncome: income.netInvestmentIncome, magi }),
  )
  const surchargeTotal = surcharges.reduce((s, x) => s + x.amount, 0)

  return {
    key: j.key,
    standardDeduction: j.standardDeduction,
    deductionOnOrdinary,
    leftoverDeduction,
    preferentialDeduction,
    ordinaryTaxable,
    preferentialTaxable,
    taxableIncome: ordinaryTaxable + preferentialTaxable,
    ordinaryFills,
    capitalGainsFills,
    capitalGainsBaseline,
    roomAt0,
    roomAt15,
    ordinaryTax,
    capitalGainsTax,
    tax: ordinaryTax + capitalGainsTax + surchargeTotal,
    capitalLoss: { deduction: lossDeduction, carryover: capitalLossCarryover },
    surcharges,
    marginalOrdinaryRate,
    marginalCapitalGainsRate,
    marginalGainsBump,
    layers: {
      // The loss deduction shields the lowest ordinary layers alongside the standard
      // deduction, so per-source taxable slices still sum to ordinaryTaxable. Which
      // source is shielded is a visualizer approximation; total tax is exact.
      ordinary: ordinaryLayers(income.amounts, deductionOnOrdinary + lossAbsorbedOnOrdinary, j.ordinaryBands),
      preferential: ladder
        ? preferentialLayers(income.amounts, preferentialShieldFraction, capitalGainsBaseline, ladder)
        : [],
    },
  }
}
