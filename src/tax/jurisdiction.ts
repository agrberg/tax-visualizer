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
  deduction: number
  /** IRC §1211(b) annual net-capital-loss deduction limit for this filing status ($3,000/$1,500 MFS federally). */
  capitalLossLimit: number
  preferentialLadder?: Band[]
  surcharges: SurchargeRule[]
}

/**
 * Size the IRC §1211(b) net-capital-loss deduction and the §1212(b) carryover for one
 * jurisdiction. A net loss offsets income up to two limits — the annual filing-status cap
 * (`capitalLossLimit`) and the taxable income available to absorb it (`preLossTaxable`, which
 * keeps the deduction from driving taxable income below zero). The deduction is the net loss
 * clamped by both; the unused remainder carries forward, short-term used first. The loss reduces
 * income *before* the deduction, ordinary side first; only a loss exceeding all ordinary
 * income (rare: under ~$3k of ordinary income) reaches the preferential base. `incomeLimited` is
 * true when taxable income (not the cap or the loss itself) was the binding limit — meaning the
 * next dollar of income would grow the deduction and be absorbed (a genuine 0% marginal rate).
 */
function applyCapitalLoss(
  capitalNetLoss: ClassifiedIncome['capitalNetLoss'],
  grossOrdinary: number,
  grossPreferential: number,
  deductionAmount: number,
  capitalLossLimit: number,
) {
  const netCapitalLoss = capitalNetLoss.shortTerm + capitalNetLoss.longTerm
  const preLossTaxable = Math.max(0, grossOrdinary + grossPreferential - deductionAmount)
  const deduction = Math.min(netCapitalLoss, capitalLossLimit, preLossTaxable)
  const ordinaryIncome = Math.max(0, grossOrdinary - deduction)
  const absorbedOnOrdinary = grossOrdinary - ordinaryIncome
  const preferentialIncome = Math.max(0, grossPreferential - (deduction - absorbedOnOrdinary))

  const usedShort = Math.min(deduction, capitalNetLoss.shortTerm)
  const carryover = {
    shortTerm: capitalNetLoss.shortTerm - usedShort,
    longTerm: capitalNetLoss.longTerm - (deduction - usedShort),
  }

  return {
    deduction,
    ordinaryIncome,
    preferentialIncome,
    absorbedOnOrdinary,
    carryover,
    incomeLimited: deduction < Math.min(netCapitalLoss, capitalLossLimit),
  }
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

  // Size the §1211(b) deduction and §1212(b) carryover (see applyCapitalLoss). The loss reduces
  // income before the deduction, ordinary side first; `lossAbsorbsNextDollar` is true
  // when the binding limit was taxable income (so the next dollar of income would be absorbed).
  const {
    deduction: lossDeduction,
    ordinaryIncome,
    preferentialIncome,
    absorbedOnOrdinary: lossAbsorbedOnOrdinary,
    carryover: capitalLossCarryover,
    incomeLimited: lossAbsorbsNextDollar,
  } = applyCapitalLoss(
    income.capitalNetLoss,
    grossOrdinary,
    grossPreferential,
    j.deduction,
    j.capitalLossLimit,
  )

  const { deductionOnOrdinary, leftoverDeduction, ordinaryTaxable, preferentialTaxable, preferentialDeduction } =
    applyDeduction(j.deduction, ordinaryIncome, preferentialIncome)

  // Fraction of *gross* preferential income that ends up taxable, for per-source attribution.
  // Two things reduce the preferential base — the leftover deduction and any spill of
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

  // When the loss is income-limited (`lossAbsorbsNextDollar`, from applyCapitalLoss), the next
  // dollar of income grows the deduction and is absorbed — a genuine 0% marginal rate the
  // leftover deduction alone doesn't capture.
  const nextOrdinaryDollarShielded = leftoverDeduction > 0 || lossAbsorbsNextDollar
  const nextPreferentialDollarShielded = leftoverDeduction > preferentialIncome || lossAbsorbsNextDollar

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
    deduction: j.deduction,
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
      // The loss deduction shields the lowest ordinary layers alongside the income
      // deduction, so per-source taxable slices still sum to ordinaryTaxable. Which
      // source is shielded is a visualizer approximation; total tax is exact.
      ordinary: ordinaryLayers(income.amounts, deductionOnOrdinary + lossAbsorbedOnOrdinary, j.ordinaryBands),
      preferential: ladder
        ? preferentialLayers(income.amounts, preferentialShieldFraction, capitalGainsBaseline, ladder)
        : [],
    },
  }
}
