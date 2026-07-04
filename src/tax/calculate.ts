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
    federal: fed,
    sourceBreakdown,
    totalTax: fed.tax,
    effectiveRate: income.totalIncome > 0 ? fed.tax / income.totalIncome : 0,
  }
}

export { marginalNextDollar } from './marginal'
