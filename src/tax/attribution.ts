import {
  ORDINARY_SOURCES,
  PREFERENTIAL_SOURCES,
  type IncomeLayer,
  type IncomeSource,
  type SourceBreakdown,
} from './types'
import { taxOverRange, type Band } from './engine'

/** Ordinary sources as taxable slices (deduction eats from the bottom, wages first). */
export function ordinaryLayers(
  amounts: Record<string, number>,
  deductionOnOrdinary: number,
  bands: Band[],
): IncomeLayer[] {
  const layers: IncomeLayer[] = []
  let deductionLeft = deductionOnOrdinary
  let base = 0
  for (const source of ORDINARY_SOURCES) {
    const amount = amounts[source]
    const absorbed = Math.min(deductionLeft, amount)
    deductionLeft -= absorbed
    const taxableAmount = amount - absorbed
    layers.push({ source, taxableAmount, base, tax: taxOverRange(base, taxableAmount, bands) })
    base += taxableAmount
  }
  return layers
}

/** Preferential sources stacked on the ordinary baseline, shielded proportionally. */
export function preferentialLayers(
  amounts: Record<string, number>,
  shieldFraction: number,
  baseline: number,
  bands: Band[],
): IncomeLayer[] {
  const layers: IncomeLayer[] = []
  let base = baseline
  for (const source of PREFERENTIAL_SOURCES) {
    const amount = amounts[source]
    const taxableAmount = amount * (1 - shieldFraction)
    layers.push({ source, taxableAmount, base, tax: taxOverRange(base, taxableAmount, bands) })
    base += taxableAmount
  }
  return layers
}

interface BreakdownArgs {
  ordinaryAmounts: Record<string, number>
  preferentialAmounts: Record<string, number>
  ordinaryLayers: IncomeLayer[]
  preferentialLayers: IncomeLayer[]
  niitAmount: number
  netInvestmentIncome: number
  medicareAmount: number
}

/** Combine per-layer income tax with the surcharges to get per-source totals. */
export function buildBreakdown(args: BreakdownArgs): SourceBreakdown[] {
  const breakdown: SourceBreakdown[] = []
  const tax: Partial<Record<IncomeSource, number>> = {}
  const gross: Partial<Record<IncomeSource, number>> = {}

  for (const layer of [...args.ordinaryLayers, ...args.preferentialLayers]) {
    tax[layer.source] = layer.tax
  }
  for (const source of ORDINARY_SOURCES) gross[source] = args.ordinaryAmounts[source]
  for (const source of PREFERENTIAL_SOURCES) gross[source] = args.preferentialAmounts[source]

  // Additional Medicare Tax → wages.
  tax.wages = (tax.wages ?? 0) + args.medicareAmount

  // NIIT → distributed across investment sources proportionally to their gross amounts.
  if (args.niitAmount > 0 && args.netInvestmentIncome > 0) {
    const investmentSources: IncomeSource[] = [
      'interest',
      'nonQualifiedDividends',
      'shortTermGains',
      'qualifiedDividends',
      'longTermGains',
    ]
    for (const source of investmentSources) {
      const share = (gross[source] ?? 0) / args.netInvestmentIncome
      tax[source] = (tax[source] ?? 0) + args.niitAmount * share
    }
  }

  const allSources: IncomeSource[] = [...ORDINARY_SOURCES, ...PREFERENTIAL_SOURCES]
  for (const source of allSources) {
    const amount = gross[source] ?? 0
    const t = tax[source] ?? 0
    breakdown.push({ source, amount, tax: t, effectiveRate: amount > 0 ? t / amount : 0 })
  }
  return breakdown
}
