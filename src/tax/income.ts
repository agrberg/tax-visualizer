import {
  INVESTMENT_SOURCES,
  ORDINARY_SOURCES,
  PREFERENTIAL_SOURCES,
  type IncomeSource,
  type TaxInput,
} from './types'

/** Income clamped to ≥0 and split into the ordinary and preferential pools. */
export interface ClassifiedIncome {
  amounts: Record<IncomeSource, number>
  ordinaryIncome: number
  preferentialIncome: number
  totalIncome: number
  /** Everything except wages — the base NIIT is measured against. */
  netInvestmentIncome: number
}

/** Normalize a raw input (clamp negatives) and classify it by tax treatment. */
export function classifyIncome(input: TaxInput): ClassifiedIncome {
  const amt = (n: number) => Math.max(0, n)
  const amounts: Record<IncomeSource, number> = {
    wages: amt(input.wages),
    interest: amt(input.interest),
    nonQualifiedDividends: amt(input.nonQualifiedDividends),
    shortTermGains: amt(input.shortTermGains),
    qualifiedDividends: amt(input.qualifiedDividends),
    longTermGains: amt(input.longTermGains),
  }
  const ordinaryIncome = ORDINARY_SOURCES.reduce((s, k) => s + amounts[k], 0)
  const preferentialIncome = PREFERENTIAL_SOURCES.reduce((s, k) => s + amounts[k], 0)
  return {
    amounts,
    ordinaryIncome,
    preferentialIncome,
    totalIncome: ordinaryIncome + preferentialIncome,
    netInvestmentIncome: INVESTMENT_SOURCES.reduce((s, k) => s + amounts[k], 0),
  }
}
