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
  const ordinaryIncome = hasLadder ? income.ordinaryIncome : income.ordinaryIncome + income.preferentialIncome
  const preferentialIncome = hasLadder ? income.preferentialIncome : 0

  const { deductionOnOrdinary, leftoverDeduction, ordinaryTaxable, preferentialTaxable, preferentialDeduction, shieldFraction } =
    applyDeduction(j.standardDeduction, ordinaryIncome, preferentialIncome)

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

  const surcharges = j.surcharges.map((rule) =>
    rule.assess({ wages: income.amounts.wages, netInvestmentIncome: income.netInvestmentIncome, magi: income.totalIncome }),
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
    surcharges,
    marginalOrdinaryRate,
    marginalCapitalGainsRate,
    marginalGainsBump,
    layers: {
      ordinary: ordinaryLayers(income.amounts, deductionOnOrdinary, j.ordinaryBands),
      preferential: ladder
        ? preferentialLayers(income.amounts, shieldFraction, capitalGainsBaseline, ladder)
        : [],
    },
  }
}
