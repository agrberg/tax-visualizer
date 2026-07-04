import {
  CAPITAL_GAINS_BREAKPOINTS,
  ORDINARY_BRACKETS,
  STANDARD_DEDUCTION,
  TAX_YEAR,
} from './brackets'
import {
  ORDINARY_SOURCES,
  PREFERENTIAL_SOURCES,
  type IncomeLayer,
  type IncomeSource,
  type MarginalComponent,
  type MarginalScenario,
  type SourceBreakdown,
  type SurchargeResult,
  type TaxInput,
  type TaxResult,
} from './types'
import { bracketsToBands, fillBands, marginalRateAt, taxOverRange, type Band } from './engine'
import { classifyIncome } from './income'
import { applyDeduction } from './deduction'
import { federalSurchargeRules } from './surcharges'

function capitalGainsBands(filingStatus: TaxInput['filingStatus']): Band[] {
  const { rate0Max, rate15Max } = CAPITAL_GAINS_BREAKPOINTS[filingStatus]
  return [
    { rate: 0, min: 0, max: rate0Max },
    { rate: 0.15, min: rate0Max, max: rate15Max },
    { rate: 0.2, min: rate15Max, max: Number.POSITIVE_INFINITY },
  ]
}

export function calculateTax(inputRaw: TaxInput): TaxResult {
  const { filingStatus } = inputRaw
  const ordBands = bracketsToBands(ORDINARY_BRACKETS[filingStatus])
  const cgBands = capitalGainsBands(filingStatus)
  const deduction = STANDARD_DEDUCTION[filingStatus]

  const { ordinaryAmounts, preferentialAmounts, ordinaryIncome, preferentialIncome, totalIncome, netInvestmentIncome } =
    classifyIncome(inputRaw)

  // Standard deduction applies to ordinary income first; leftover shields preferential income.
  const {
    deductionOnOrdinary,
    leftoverDeduction,
    ordinaryTaxable,
    preferentialTaxable,
    preferentialDeduction,
    shieldFraction,
  } = applyDeduction(deduction, ordinaryIncome, preferentialIncome)
  const taxableIncome = ordinaryTaxable + preferentialTaxable

  // Ordinary brackets filled from the bottom.
  const ordinaryFills = fillBands(0, ordinaryTaxable, ordBands)
  const ordinaryTax = ordinaryFills.reduce((s, f) => s + f.taxInBracket, 0)

  // Preferential income stacks on top of ordinary taxable income.
  const capitalGainsBaseline = ordinaryTaxable
  const capitalGainsFills = fillBands(capitalGainsBaseline, preferentialTaxable, cgBands)
  const capitalGainsTax = capitalGainsFills.reduce((s, f) => s + f.taxInBracket, 0)

  const { rate0Max, rate15Max } = CAPITAL_GAINS_BREAKPOINTS[filingStatus]
  const topOfGains = capitalGainsBaseline + preferentialTaxable
  const roomAt0 = Math.max(0, rate0Max - topOfGains)
  const roomAt15 = Math.max(0, rate15Max - topOfGains)

  // The next dollar is shielded while the standard deduction is not yet used up.
  const nextOrdinaryDollarShielded = leftoverDeduction > 0 // ordinary income below the deduction
  const nextPreferentialDollarShielded = leftoverDeduction > preferentialIncome // total below the deduction

  // Cap-gains rate at a given taxable-income position on the preferential ladder.
  const cgRateAt = (pos: number): number =>
    pos < rate0Max ? 0 : pos < rate15Max ? 0.15 : 0.2

  // Rate the next preferential dollar would be taxed at (where the stack currently tops out).
  const marginalCapitalGainsRate = nextPreferentialDollarShielded ? 0 : cgRateAt(topOfGains)
  // Ordinary income-tax rate on the next ordinary dollar (0 while inside the deduction).
  const marginalOrdinaryRate = nextOrdinaryDollarShielded ? 0 : marginalRateAt(ordinaryTaxable, ordBands)

  // The "capital-gains bump": the next ordinary dollar also moves a gain dollar between
  // preferential bands. Inside the deduction it un-shields a gain onto the top of the stack
  // (0% → top-of-stack rate); past the deduction it lifts the whole stack by $1, so its top
  // dollar climbs a band while its bottom dollar drops out (bottom-rate → top-rate).
  const bumpFrom = nextOrdinaryDollarShielded ? 0 : cgRateAt(capitalGainsBaseline)
  const bumpTo = nextOrdinaryDollarShielded ? marginalCapitalGainsRate : cgRateAt(topOfGains)
  const marginalGainsBump =
    bumpTo > bumpFrom ? { rate: bumpTo - bumpFrom, fromRate: bumpFrom, toRate: bumpTo } : null

  // --- Surcharges (NIIT, Additional Medicare) — each rule owns its own math. ---
  const surcharges = federalSurchargeRules(filingStatus).map((rule) =>
    rule.assess({ wages: ordinaryAmounts.wages, netInvestmentIncome, magi: totalIncome }),
  )
  const surcharge = (key: string): SurchargeResult => surcharges.find((s) => s.key === key)!
  const niit = surcharge('niit')
  const additionalMedicare = surcharge('additionalMedicare')

  const totalTax = ordinaryTax + capitalGainsTax + surcharges.reduce((s, x) => s + x.amount, 0)

  // --- Per-source attribution ---
  // Ordinary stack: deduction eats from the bottom (wages first), each slice taxed in place.
  const ordinaryLayers: IncomeLayer[] = []
  {
    let deductionLeft = deductionOnOrdinary
    let base = 0
    for (const source of ORDINARY_SOURCES) {
      const amount = ordinaryAmounts[source]
      const absorbed = Math.min(deductionLeft, amount)
      deductionLeft -= absorbed
      const taxableAmount = amount - absorbed
      ordinaryLayers.push({
        source,
        taxableAmount,
        base,
        tax: taxOverRange(base, taxableAmount, ordBands),
      })
      base += taxableAmount
    }
  }

  // Preferential stack: the leftover deduction shields income proportionally (see
  // applyDeduction), then the taxable remainder stacks on the ordinary baseline.
  const preferentialLayers: IncomeLayer[] = []
  {
    let base = capitalGainsBaseline
    for (const source of PREFERENTIAL_SOURCES) {
      const amount = preferentialAmounts[source]
      const taxableAmount = amount * (1 - shieldFraction)
      preferentialLayers.push({
        source,
        taxableAmount,
        base,
        tax: taxOverRange(base, taxableAmount, cgBands),
      })
      base += taxableAmount
    }
  }

  const sourceBreakdown = buildBreakdown({
    ordinaryAmounts,
    preferentialAmounts,
    ordinaryLayers,
    preferentialLayers,
    niitAmount: niit.amount,
    netInvestmentIncome,
    medicareAmount: additionalMedicare.amount,
  })

  return {
    filingStatus,
    taxYear: TAX_YEAR,
    totalIncome,
    ordinaryIncome,
    preferentialIncome,
    standardDeduction: deduction,
    preferentialDeduction,
    ordinaryTaxable,
    preferentialTaxable,
    taxableIncome,
    ordinaryFills,
    capitalGainsFills,
    roomAt0,
    roomAt15,
    capitalGainsBaseline,
    ordinaryTax,
    capitalGainsTax,
    niit,
    additionalMedicare,
    totalTax,
    effectiveRate: totalIncome > 0 ? totalTax / totalIncome : 0,
    marginalOrdinaryRate,
    marginalCapitalGainsRate,
    marginalGainsBump,
    sourceBreakdown,
    ordinaryLayers,
    preferentialLayers,
  }
}

/**
 * Marginal cost of the next $1 by income type. The surtax portion is derived from
 * the same surcharge rules that assessed the tax, so their next-dollar behavior
 * (e.g. NIIT's MAGI-cap nuance) can't drift from their assessment.
 */
export function marginalNextDollar(result: TaxResult): MarginalScenario[] {
  const rules = federalSurchargeRules(result.filingStatus)
  const assessed: Record<string, SurchargeResult> = {
    niit: result.niit,
    additionalMedicare: result.additionalMedicare,
  }

  // The capital-gains bump rides on ordinary dollars only (it lifts the gains stack).
  const bump = result.marginalGainsBump
  const pct = (r: number) => `${Math.round(r * 100)}%`
  const bumpComponent: MarginalComponent | null = bump
    ? { label: `pushes a gain ${pct(bump.fromRate)}→${pct(bump.toRate)}`, rate: bump.rate, tone: 'bump' }
    : null

  const build = (
    key: MarginalScenario['key'],
    baseRate: number,
    extra: (MarginalComponent | null)[] = [],
  ): MarginalScenario => {
    const fromRules = rules.map<MarginalComponent>((r) => ({
      label: r.shortLabel,
      rate: r.marginalRate(key, assessed[r.key]),
      tone: 'surtax',
    }))
    const surtaxes = [...fromRules, ...extra].filter(
      (s): s is MarginalComponent => s !== null && s.rate > 0,
    )
    const surRate = surtaxes.reduce((sum, s) => sum + s.rate, 0)
    return { key, baseRate, surtaxes, surRate, totalRate: baseRate + surRate }
  }

  return [
    build('wages', result.marginalOrdinaryRate, [bumpComponent]),
    build('ordinaryInvestment', result.marginalOrdinaryRate, [bumpComponent]),
    build('preferential', result.marginalCapitalGainsRate),
  ]
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
function buildBreakdown(args: BreakdownArgs): SourceBreakdown[] {
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
    breakdown.push({
      source,
      amount,
      tax: t,
      effectiveRate: amount > 0 ? t / amount : 0,
    })
  }
  return breakdown
}
