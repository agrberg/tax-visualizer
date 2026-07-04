import { TAX_YEAR } from './brackets'
import type { TaxInput, TaxResult } from './types'
import { classifyIncome } from './income'
import { federalJurisdiction } from './federal'
import { computeJurisdiction } from './jurisdiction'
import { buildBreakdown } from './attribution'

export function calculateTax(inputRaw: TaxInput): TaxResult {
  const income = classifyIncome(inputRaw)
  const fed = computeJurisdiction(federalJurisdiction(inputRaw.filingStatus), income)

  const niit = fed.surcharges.find((s) => s.key === 'niit')!
  const additionalMedicare = fed.surcharges.find((s) => s.key === 'additionalMedicare')!

  const sourceBreakdown = buildBreakdown({
    ordinaryAmounts: income.ordinaryAmounts,
    preferentialAmounts: income.preferentialAmounts,
    ordinaryLayers: fed.layers.ordinary,
    preferentialLayers: fed.layers.preferential,
    niitAmount: niit.amount,
    netInvestmentIncome: income.netInvestmentIncome,
    medicareAmount: additionalMedicare.amount,
  })

  return {
    filingStatus: inputRaw.filingStatus,
    taxYear: TAX_YEAR,
    totalIncome: income.totalIncome,
    ordinaryIncome: income.ordinaryIncome,
    preferentialIncome: income.preferentialIncome,
    standardDeduction: fed.standardDeduction,
    preferentialDeduction: fed.preferentialDeduction,
    ordinaryTaxable: fed.ordinaryTaxable,
    preferentialTaxable: fed.preferentialTaxable,
    taxableIncome: fed.taxableIncome,
    ordinaryFills: fed.ordinaryFills,
    capitalGainsFills: fed.capitalGainsFills,
    roomAt0: fed.roomAt0,
    roomAt15: fed.roomAt15,
    capitalGainsBaseline: fed.capitalGainsBaseline,
    ordinaryTax: fed.ordinaryTax,
    capitalGainsTax: fed.capitalGainsTax,
    niit,
    additionalMedicare,
    totalTax: fed.tax,
    effectiveRate: income.totalIncome > 0 ? fed.tax / income.totalIncome : 0,
    marginalOrdinaryRate: fed.marginalOrdinaryRate,
    marginalCapitalGainsRate: fed.marginalCapitalGainsRate,
    marginalGainsBump: fed.marginalGainsBump,
    sourceBreakdown,
    ordinaryLayers: fed.layers.ordinary,
    preferentialLayers: fed.layers.preferential,
  }
}

export { marginalNextDollar } from './marginal'
