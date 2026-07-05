import { PREFERENTIAL_SOURCES, type IncomeSource, type TaxResult } from './types'

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

// Colors are spread across the hue wheel so adjacent stacked slices stay distinct.
export const SOURCE_META: Record<IncomeSource, SourceMeta> = {
  wages: {
    label: 'Wages / earned income',
    short: 'Wages',
    hint: 'W-2 wages and self-employment income, taxed at ordinary marginal rates.',
    fill: 'bg-src-wages',
    swatch: 'bg-src-wages',
  },
  interest: {
    label: 'Taxable interest',
    short: 'Interest',
    hint: 'Bank/bond interest, taxed at ordinary rates and counted as investment income for NIIT.',
    fill: 'bg-src-interest',
    swatch: 'bg-src-interest',
  },
  nonQualifiedDividends: {
    label: 'Non-qualified dividends',
    short: 'Non-qual. div.',
    hint: 'Ordinary dividends that do not meet holding-period rules; taxed at ordinary rates.',
    fill: 'bg-src-nonqual',
    swatch: 'bg-src-nonqual',
  },
  shortTermGains: {
    label: 'Short-term capital gains',
    short: 'ST gains',
    hint: 'Gains on assets held ≤ 1 year; taxed at ordinary rates.',
    fill: 'bg-src-stgains',
    swatch: 'bg-src-stgains',
  },
  qualifiedDividends: {
    label: 'Qualified dividends',
    short: 'Qual. div.',
    hint: 'Dividends meeting holding-period rules; taxed on the 0/15/20% capital-gains ladder.',
    fill: 'bg-src-qualdiv',
    swatch: 'bg-src-qualdiv',
  },
  longTermGains: {
    label: 'Long-term capital gains',
    short: 'LT gains',
    hint: 'Gains on assets held > 1 year; taxed on the 0/15/20% capital-gains ladder.',
    fill: 'bg-src-ltgains',
    swatch: 'bg-src-ltgains',
  },
}

// Each source's theme-token color as a `var(--color-src-*)` string, for inline SVG
// fills and alpha-blended backgrounds that Tailwind's class scanner can't generate.
export const SOURCE_COLOR: Record<IncomeSource, string> = {
  wages: 'var(--color-src-wages)',
  interest: 'var(--color-src-interest)',
  nonQualifiedDividends: 'var(--color-src-nonqual)',
  shortTermGains: 'var(--color-src-stgains)',
  qualifiedDividends: 'var(--color-src-qualdiv)',
  longTermGains: 'var(--color-src-ltgains)',
}

/**
 * A row in the income/tax composition charts. Individual ordinary sources pass
 * through as-is; the two preferential sources are merged into one capital-gains
 * bucket, since their apparent per-source rate difference is only an artifact of
 * stacking order (whichever fills the remaining 0% room first looks cheaper).
 */
export interface CompositionSegment {
  key: string
  label: string
  short: string
  /** One color, or the two source colors when the capital-gains bucket blends both. */
  colors: string[]
  amount: number
  tax: number
  effectiveRate: number
}

export function compositionSegments(result: TaxResult): CompositionSegment[] {
  const rows = result.sourceBreakdown.filter((s) => s.amount > 0)
  const segments: CompositionSegment[] = rows
    .filter((s) => !PREFERENTIAL_SOURCES.includes(s.source))
    .map((s) => ({
      key: s.source,
      label: SOURCE_META[s.source].label,
      short: SOURCE_META[s.source].short,
      colors: [SOURCE_COLOR[s.source]],
      amount: s.amount,
      tax: s.tax,
      effectiveRate: s.effectiveRate,
    }))
  const preferential = rows
    .filter((s) => PREFERENTIAL_SOURCES.includes(s.source))
    .sort((a, b) => PREFERENTIAL_SOURCES.indexOf(a.source) - PREFERENTIAL_SOURCES.indexOf(b.source))
  if (preferential.length > 0) {
    const amount = preferential.reduce((sum, s) => sum + s.amount, 0)
    const tax = preferential.reduce((sum, s) => sum + s.tax, 0)
    // With only one preferential source, name it plainly; with both, they share a bucket.
    const only = preferential.length === 1 ? preferential[0].source : null
    segments.push({
      key: 'capitalGains',
      label: only ? SOURCE_META[only].label : 'Long-term gains & qualified dividends',
      short: only ? SOURCE_META[only].short : 'Cap. gains',
      colors: preferential.map((s) => SOURCE_COLOR[s.source]),
      amount,
      tax,
      effectiveRate: amount > 0 ? tax / amount : 0,
    })
  }
  return segments
}

/**
 * Background style for a segment fill or swatch: a solid color for a single source,
 * or diagonal stripes of both colors when a bucket blends two (long-term gains +
 * qualified dividends). `alpha` is an optional opacity percentage (0–100).
 */
export function blendBackground(
  colors: string[],
  opts: { stripe?: number; alpha?: number } = {},
): { backgroundColor?: string; backgroundImage?: string } {
  const stripe = opts.stripe ?? 8
  const tint = (c: string) =>
    opts.alpha === undefined ? c : `color-mix(in oklch, ${c} ${opts.alpha}%, transparent)`
  if (colors.length === 1) return { backgroundColor: tint(colors[0]) }
  const [a, b] = colors.map(tint)
  return {
    backgroundImage: `repeating-linear-gradient(45deg, ${a} 0, ${a} ${stripe}px, ${b} ${stripe}px, ${b} ${stripe * 2}px)`,
  }
}

/** Color for a capital-gains rate band. */
export function capitalGainsRateColor(rate: number): string {
  if (rate === 0) return 'bg-green-500'
  if (rate === 0.15) return 'bg-amber-500'
  return 'bg-red-500'
}

/** Green shade for a wages slice, darkening as the ordinary rate rises. */
export function wagesBracketFill(rate: number): string {
  switch (rate) {
    case 0.1:
      return 'bg-green-200'
    case 0.12:
      return 'bg-green-300'
    case 0.22:
      return 'bg-green-400'
    case 0.24:
      return 'bg-green-500'
    case 0.32:
      return 'bg-green-600'
    case 0.35:
      return 'bg-green-700'
    default:
      return 'bg-green-800'
  }
}
