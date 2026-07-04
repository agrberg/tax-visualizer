import type { IncomeSource } from './types'

const currency0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const currency2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(value: number, cents = false): string {
  if (!Number.isFinite(value)) return '—'
  return (cents ? currency2 : currency0).format(value)
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`
}

export interface SourceMeta {
  label: string
  short: string
  hint: string
  /** Tailwind bg class for the segment fill. */
  fill: string
  /** Tailwind bg class for the swatch/legend dot. */
  swatch: string
}

export const SOURCE_META: Record<IncomeSource, SourceMeta> = {
  wages: {
    label: 'Wages / earned income',
    short: 'Wages',
    hint: 'W-2 wages and self-employment income, taxed at ordinary marginal rates.',
    fill: 'bg-emerald-500',
    swatch: 'bg-emerald-500',
  },
  interest: {
    label: 'Taxable interest',
    short: 'Interest',
    hint: 'Bank/bond interest, taxed at ordinary rates and counted as investment income for NIIT.',
    fill: 'bg-teal-500',
    swatch: 'bg-teal-500',
  },
  nonQualifiedDividends: {
    label: 'Non-qualified dividends',
    short: 'Non-qual. div.',
    hint: 'Ordinary dividends that do not meet holding-period rules; taxed at ordinary rates.',
    fill: 'bg-cyan-500',
    swatch: 'bg-cyan-500',
  },
  shortTermGains: {
    label: 'Short-term capital gains',
    short: 'ST gains',
    hint: 'Gains on assets held ≤ 1 year; taxed at ordinary rates.',
    fill: 'bg-sky-500',
    swatch: 'bg-sky-500',
  },
  qualifiedDividends: {
    label: 'Qualified dividends',
    short: 'Qual. div.',
    hint: 'Dividends meeting holding-period rules; taxed on the 0/15/20% capital-gains ladder.',
    fill: 'bg-violet-500',
    swatch: 'bg-violet-500',
  },
  longTermGains: {
    label: 'Long-term capital gains',
    short: 'LT gains',
    hint: 'Gains on assets held > 1 year; taxed on the 0/15/20% capital-gains ladder.',
    fill: 'bg-purple-500',
    swatch: 'bg-purple-500',
  },
}

/** Color for a capital-gains rate band. */
export function capitalGainsRateColor(rate: number): string {
  if (rate === 0) return 'bg-green-500'
  if (rate === 0.15) return 'bg-amber-500'
  return 'bg-red-500'
}
