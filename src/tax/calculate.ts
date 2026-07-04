import {
  ADDITIONAL_MEDICARE_RATE,
  ADDITIONAL_MEDICARE_THRESHOLD,
  CAPITAL_GAINS_BREAKPOINTS,
  NIIT_RATE,
  NIIT_THRESHOLD,
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

function capitalGainsBands(filingStatus: TaxInput['filingStatus']): Band[] {
  const { rate0Max, rate15Max } = CAPITAL_GAINS_BREAKPOINTS[filingStatus]
  return [
    { rate: 0, min: 0, max: rate0Max },
    { rate: 0.15, min: rate0Max, max: rate15Max },
    { rate: 0.2, min: rate15Max, max: Number.POSITIVE_INFINITY },
  ]
}

export function calculateTax(inputRaw: TaxInput): TaxResult {
  const input: TaxInput = {
    ...inputRaw,
    wages: Math.max(0, inputRaw.wages),
    interest: Math.max(0, inputRaw.interest),
    nonQualifiedDividends: Math.max(0, inputRaw.nonQualifiedDividends),
    shortTermGains: Math.max(0, inputRaw.shortTermGains),
    qualifiedDividends: Math.max(0, inputRaw.qualifiedDividends),
    longTermGains: Math.max(0, inputRaw.longTermGains),
  }
  const { filingStatus } = input
  const ordBands = bracketsToBands(ORDINARY_BRACKETS[filingStatus])
  const cgBands = capitalGainsBands(filingStatus)
  const deduction = STANDARD_DEDUCTION[filingStatus]

  const ordinaryAmounts: Record<string, number> = {
    wages: input.wages,
    interest: input.interest,
    nonQualifiedDividends: input.nonQualifiedDividends,
    shortTermGains: input.shortTermGains,
  }
  const preferentialAmounts: Record<string, number> = {
    qualifiedDividends: input.qualifiedDividends,
    longTermGains: input.longTermGains,
  }

  const ordinaryIncome = ORDINARY_SOURCES.reduce((s, k) => s + ordinaryAmounts[k], 0)
  const preferentialIncome = PREFERENTIAL_SOURCES.reduce((s, k) => s + preferentialAmounts[k], 0)
  const totalIncome = ordinaryIncome + preferentialIncome

  // Standard deduction applies to ordinary income first; leftover reduces preferential income.
  const deductionOnOrdinary = Math.min(deduction, ordinaryIncome)
  const leftoverDeduction = deduction - deductionOnOrdinary
  const ordinaryTaxable = ordinaryIncome - deductionOnOrdinary
  const preferentialTaxable = Math.max(0, preferentialIncome - leftoverDeduction)
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

  // --- Surcharges ---
  // NIIT: net investment income = everything except wages (MAGI approximated as total income).
  const netInvestmentIncome =
    input.interest +
    input.nonQualifiedDividends +
    input.shortTermGains +
    input.qualifiedDividends +
    input.longTermGains
  const magi = totalIncome
  const niitThreshold = NIIT_THRESHOLD[filingStatus]
  const niitOver = Math.max(0, magi - niitThreshold)
  const niitBase = Math.min(netInvestmentIncome, niitOver)
  const niitAmount = niitBase * NIIT_RATE
  const niit: SurchargeResult = {
    applies: niitAmount > 0,
    rate: NIIT_RATE,
    threshold: niitThreshold,
    incomeMeasured: magi,
    incomeOverThreshold: niitOver,
    taxedAmount: niitBase,
    amount: niitAmount,
    investmentIncome: netInvestmentIncome,
  }

  // Additional Medicare Tax: on earned income (wages) over the threshold.
  const medicareThreshold = ADDITIONAL_MEDICARE_THRESHOLD[filingStatus]
  const medicareOver = Math.max(0, input.wages - medicareThreshold)
  const medicareAmount = medicareOver * ADDITIONAL_MEDICARE_RATE
  const additionalMedicare: SurchargeResult = {
    applies: medicareAmount > 0,
    rate: ADDITIONAL_MEDICARE_RATE,
    threshold: medicareThreshold,
    incomeMeasured: input.wages,
    incomeOverThreshold: medicareOver,
    taxedAmount: medicareOver,
    amount: medicareAmount,
  }

  const totalTax = ordinaryTax + capitalGainsTax + niitAmount + medicareAmount

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

  // Preferential stack: leftover deduction shields income proportionally (qualified
  // dividends and LTCG are one pool taxed identically, so an ordering would be arbitrary),
  // then the taxable remainder stacks on the ordinary baseline.
  const preferentialDeduction = Math.min(leftoverDeduction, preferentialIncome)
  const shieldFraction = preferentialIncome > 0 ? preferentialDeduction / preferentialIncome : 0
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
    niitAmount,
    netInvestmentIncome,
    medicareAmount,
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
 * Marginal cost of the next $1 by income type, with surtaxes layered in.
 *
 * NIIT taxes min(net investment income, MAGI − threshold), so which surtaxes hit the
 * next dollar depends on the income type AND which side of that min is binding:
 * - An investment dollar always incurs NIIT once MAGI is over the threshold.
 * - A wage dollar incurs NIIT only when the MAGI-over-threshold cap is below net
 *   investment income (raising MAGI then pulls more NII under the cap).
 */
export function marginalNextDollar(result: TaxResult): MarginalScenario[] {
  const magiOver = result.niit.incomeOverThreshold
  const nii = result.niit.investmentIncome ?? 0
  const niitRate = result.niit.rate

  const niitOnInvestment = magiOver > 0 ? niitRate : 0
  const niitOnWages = magiOver > 0 && magiOver < nii ? niitRate : 0
  const medicareOnWages =
    result.additionalMedicare.incomeOverThreshold > 0 ? result.additionalMedicare.rate : 0

  // The capital-gains bump rides on ordinary dollars only (it lifts the gains stack).
  const bump = result.marginalGainsBump
  const pct = (r: number) => `${Math.round(r * 100)}%`
  const bumpComponent: MarginalComponent | null = bump
    ? { label: `pushes a gain ${pct(bump.fromRate)}→${pct(bump.toRate)}`, rate: bump.rate, tone: 'bump' }
    : null

  const build = (
    key: MarginalScenario['key'],
    baseRate: number,
    defs: (MarginalComponent | null)[],
  ): MarginalScenario => {
    const surtaxes = defs.filter((s): s is MarginalComponent => s !== null && s.rate > 0)
    const surRate = surtaxes.reduce((sum, s) => sum + s.rate, 0)
    return { key, baseRate, surtaxes, surRate, totalRate: baseRate + surRate }
  }

  const surtax = (label: string, rate: number): MarginalComponent => ({ label, rate, tone: 'surtax' })

  return [
    build('wages', result.marginalOrdinaryRate, [
      surtax("Add'l Medicare", medicareOnWages),
      surtax('NIIT', niitOnWages),
      bumpComponent,
    ]),
    build('ordinaryInvestment', result.marginalOrdinaryRate, [
      surtax('NIIT', niitOnInvestment),
      bumpComponent,
    ]),
    build('preferential', result.marginalCapitalGainsRate, [surtax('NIIT', niitOnInvestment)]),
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
