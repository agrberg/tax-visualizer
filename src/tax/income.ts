import { ORDINARY_SOURCES, PREFERENTIAL_SOURCES, type TaxInput } from './types'

/** Income clamped to ≥0 and split into the ordinary and preferential pools. */
export interface ClassifiedIncome {
  ordinaryAmounts: Record<string, number>
  preferentialAmounts: Record<string, number>
  ordinaryIncome: number
  preferentialIncome: number
  totalIncome: number
  /** Everything except wages — the base NIIT is measured against. */
  netInvestmentIncome: number
}

/** Normalize a raw input (clamp negatives) and classify it by tax treatment. */
export function classifyIncome(input: TaxInput): ClassifiedIncome {
  const amt = (n: number) => Math.max(0, n)
  const ordinaryAmounts: Record<string, number> = {
    wages: amt(input.wages),
    interest: amt(input.interest),
    nonQualifiedDividends: amt(input.nonQualifiedDividends),
    shortTermGains: amt(input.shortTermGains),
  }
  const preferentialAmounts: Record<string, number> = {
    qualifiedDividends: amt(input.qualifiedDividends),
    longTermGains: amt(input.longTermGains),
  }
  const ordinaryIncome = ORDINARY_SOURCES.reduce((s, k) => s + ordinaryAmounts[k], 0)
  const preferentialIncome = PREFERENTIAL_SOURCES.reduce((s, k) => s + preferentialAmounts[k], 0)
  return {
    ordinaryAmounts,
    preferentialAmounts,
    ordinaryIncome,
    preferentialIncome,
    totalIncome: ordinaryIncome + preferentialIncome,
    netInvestmentIncome: ordinaryIncome - ordinaryAmounts.wages + preferentialIncome,
  }
}
