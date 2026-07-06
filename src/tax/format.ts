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

/**
 * A rate as a percent with just enough precision to be exact: up to 2 decimals,
 * trailing zeros trimmed (0.062 → "6.2%", 0.0145 → "1.45%", 0.038 → "3.8%").
 */
export function formatRatePercent(fraction: number): string {
  return `${+(fraction * 100).toFixed(2)}%`
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
  retirementIncome: {
    label: 'Retirement distributions',
    short: 'Retirement',
    hint: 'RMDs, pensions, and traditional IRA/401(k) withdrawals. Taxed at ordinary rates, but not earned income (no FICA) and not investment income (no NIIT).',
    fill: 'bg-src-retirement',
    swatch: 'bg-src-retirement',
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
  retirementIncome: 'var(--color-src-retirement)',
  interest: 'var(--color-src-interest)',
  nonQualifiedDividends: 'var(--color-src-nonqual)',
  shortTermGains: 'var(--color-src-stgains)',
  qualifiedDividends: 'var(--color-src-qualdiv)',
  longTermGains: 'var(--color-src-ltgains)',
}

/**
 * A row in the income/tax composition charts. Wages and retirement pass through
 * individually; the fungible investment-type ordinary sources (interest / non-qual
 * div / ST gains) merge into one bucket, and the two preferential sources merge
 * into a capital-gains bucket. Both merges exist because a per-source rate
 * difference *within* a bucket is only an artifact of stacking order (whichever
 * source fills the lower brackets / remaining 0% room first looks cheaper).
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

// Ordinary income taxed identically and treated as investment income (NIIT-eligible).
// They share a bracket ladder, so a per-source rate gap is only a stacking artifact.
const ORDINARY_INVESTMENT_SOURCES: IncomeSource[] = [
  'interest',
  'nonQualifiedDividends',
  'shortTermGains',
]

export function compositionSegments(result: TaxResult): CompositionSegment[] {
  const rows = result.sourceBreakdown.filter((s) => s.amount > 0)
  const passThrough = (s: (typeof rows)[number]): CompositionSegment => ({
    key: s.source,
    label: SOURCE_META[s.source].label,
    short: SOURCE_META[s.source].short,
    colors: [SOURCE_COLOR[s.source]],
    amount: s.amount,
    tax: s.tax,
    effectiveRate: s.effectiveRate,
  })

  // Wages and retirement are their own ordinary flavors (FICA / plain); pass them through.
  const segments: CompositionSegment[] = rows
    .filter(
      (s) =>
        !PREFERENTIAL_SOURCES.includes(s.source) && !ORDINARY_INVESTMENT_SOURCES.includes(s.source),
    )
    .map(passThrough)

  // Merge the investment-type ordinary sources into one bucket (one source names itself).
  const investment = rows
    .filter((s) => ORDINARY_INVESTMENT_SOURCES.includes(s.source))
    .sort(
      (a, b) =>
        ORDINARY_INVESTMENT_SOURCES.indexOf(a.source) - ORDINARY_INVESTMENT_SOURCES.indexOf(b.source),
    )
  if (investment.length === 1) {
    segments.push(passThrough(investment[0]))
  } else if (investment.length > 1) {
    const amount = investment.reduce((sum, s) => sum + s.amount, 0)
    const tax = investment.reduce((sum, s) => sum + s.tax, 0)
    segments.push({
      key: 'ordinaryInvestment',
      label: investment.map((s) => SOURCE_META[s.source].label).join(' · '),
      short: investment.map((s) => SOURCE_META[s.source].short).join(' · '),
      colors: investment.map((s) => SOURCE_COLOR[s.source]),
      amount,
      tax,
      effectiveRate: amount > 0 ? tax / amount : 0,
    })
  }

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

// Surcharge keys that are mandatory payroll tax (FICA) rather than income-tax surtaxes.
const PAYROLL_SURCHARGE_KEYS = new Set(['socialSecurity', 'medicare'])

/** One flavor of the total tax, for the headline-stat breakout. */
export interface TaxComponent {
  key: 'income' | 'payroll' | 'surtax'
  label: string
  amount: number
}

/**
 * Split the total tax into the three flavors folded into the headline "Total tax"
 * and effective rate: income tax (ordinary + capital gains), mandatory payroll tax
 * (Social Security + base Medicare), and income-tax surtaxes (NIIT + Additional
 * Medicare). Their amounts sum to `result.totalTax`.
 */
export function taxComponents(result: TaxResult): TaxComponent[] {
  const fed = result.federal
  let payroll = 0
  let surtax = 0
  for (const s of fed.surcharges) {
    if (PAYROLL_SURCHARGE_KEYS.has(s.key)) payroll += s.amount
    else surtax += s.amount
  }
  return [
    { key: 'income', label: 'Income tax', amount: fed.ordinaryTax + fed.capitalGainsTax },
    { key: 'payroll', label: 'Payroll tax (FICA)', amount: payroll },
    { key: 'surtax', label: "Surtaxes (NIIT, Add'l Medicare)", amount: surtax },
  ]
}

/**
 * Background style for a segment fill or swatch: a solid color for a single source,
 * or diagonal stripes cycling through every color when a bucket blends two or more
 * (e.g. long-term gains + qualified dividends, or the three ordinary investment
 * sources). `alpha` is an optional opacity percentage (0–100).
 */
export function blendBackground(
  colors: string[],
  opts: { stripe?: number; alpha?: number } = {},
): { backgroundColor?: string; backgroundImage?: string } {
  const stripe = opts.stripe ?? 8
  const tint = (c: string) =>
    opts.alpha === undefined ? c : `color-mix(in oklch, ${c} ${opts.alpha}%, transparent)`
  if (colors.length === 1) return { backgroundColor: tint(colors[0]) }
  const stops = colors
    .map(tint)
    .map((c, i) => `${c} ${i * stripe}px, ${c} ${(i + 1) * stripe}px`)
    .join(', ')
  return {
    backgroundImage: `repeating-linear-gradient(45deg, ${stops})`,
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
