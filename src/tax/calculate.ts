import type { TaxInput, TaxResult } from './types'
import { classifyIncome } from './income'
import { federalJurisdiction } from './federal'
import { computeJurisdiction } from './jurisdiction'
import { buildBreakdown } from './attribution'
import { taxTablesFor } from './years'

export function calculateTax(inputRaw: TaxInput): TaxResult {
  const income = classifyIncome(inputRaw)
  const tables = taxTablesFor(inputRaw.taxYear)
  const jurisdiction = federalJurisdiction(inputRaw.filingStatus, tables)
  const fed = computeJurisdiction(jurisdiction, income)

  const surcharges = jurisdiction.surcharges.map((rule, i) => ({ rule, result: fed.surcharges[i] }))

  const sourceBreakdown = buildBreakdown({
    amounts: income.amounts,
    ordinaryLayers: fed.layers.ordinary,
    preferentialLayers: fed.layers.preferential,
    surcharges,
    netInvestmentIncome: income.netInvestmentIncome,
  })

  return {
    filingStatus: inputRaw.filingStatus,
    taxYear: tables.year,
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
