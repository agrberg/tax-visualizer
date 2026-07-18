export type FilingStatus = 'single' | 'mfj' | 'hoh' | 'mfs'

/** Individual income sources the user enters. */
export type IncomeSource =
  | 'wages'
  | 'retirementIncome'
  | 'interest'
  | 'nonQualifiedDividends'
  | 'shortTermGains'
  | 'qualifiedDividends'
  | 'longTermGains'

/** Sources taxed at ordinary marginal rates. Order = layering order in the tower (bottom → top). */
export const ORDINARY_SOURCES: IncomeSource[] = [
  'wages',
  'retirementIncome',
  'interest',
  'nonQualifiedDividends',
  'shortTermGains',
]

/** Sources taxed on the preferential 0/15/20% capital-gains ladder. */
export const PREFERENTIAL_SOURCES: IncomeSource[] = [
  'qualifiedDividends',
  'longTermGains',
]

/** Every income source, ordinary pool first then preferential. */
export const ALL_SOURCES: IncomeSource[] = [...ORDINARY_SOURCES, ...PREFERENTIAL_SOURCES]

/**
 * The subset of sources that may be negative — a capital *loss*. Short- and long-term gains
 * net against each other (see `nettedCapitalGains`), so both carry a real sign end to end
 * (input → storage → share link → engine). Every other source is clamped to ≥0.
 */
export type SignedSource = 'shortTermGains' | 'longTermGains'

export const SIGNED_SOURCES: readonly SignedSource[] = ['shortTermGains', 'longTermGains']

/**
 * Whether a source may hold a negative amount (a capital loss). The one predicate behind
 * every place that asks "is this signed?" / "is a negative allowed here?" — input parsing,
 * the share-link codec, and the import merge clamp.
 *
 * A type predicate (`source is SignedSource`), so a `true` result also *narrows* the argument
 * to the signed subset for the compiler — callers can then treat it as a `SignedSource` without
 * a cast. The `as SignedSource` on the argument is only needed because `Array<SignedSource>`'s
 * `includes` accepts just `SignedSource`; the runtime check is still a plain membership test.
 */
export const allowsNegativeAmount = (source: IncomeSource): source is SignedSource =>
  SIGNED_SOURCES.includes(source as SignedSource)

/**
 * The investment sources that make up net investment income (the NIIT base).
 * An explicit allowlist — it excludes wages *and* retirement distributions, which
 * are ordinary income but not investment income.
 */
export const INVESTMENT_SOURCES: IncomeSource[] = [
  'interest',
  'nonQualifiedDividends',
  'shortTermGains',
  'qualifiedDividends',
  'longTermGains',
]

/**
 * Coerce a raw value to a valid custom deduction: a finite number ≥ 0, else `null` (meaning
 * "use the standard deduction"). The single predicate behind every input boundary — storage
 * normalization, the share-link codec, and 1040 import — so the rule lives in one place.
 */
export const coerceDeduction = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

export interface TaxInput {
  filingStatus: FilingStatus
  /** Tax year whose tables drive the calculation. See TaxYearTables / the years registry. */
  taxYear: number
  wages: number
  retirementIncome: number
  interest: number
  nonQualifiedDividends: number
  shortTermGains: number
  qualifiedDividends: number
  longTermGains: number
  /** Deduction applied before computing tax. null = use the standard deduction from tables. */
  deduction: number | null
}

/** A single ordinary-income bracket: [min, max) of taxable income at `rate`. */
export interface OrdinaryBracket {
  rate: number
  min: number
  max: number // Infinity for the top bracket
}

/** Long-term capital-gains / qualified-dividend breakpoints: 0% up to rate0Max, 15% up to rate15Max, 20% above. */
export interface CapitalGainsBreakpoints {
  rate0Max: number
  rate15Max: number
}

/**
 * Everything that varies from one tax year to the next, bundled so a new year is a
 * data edit rather than a code change. Thresholds move most (brackets, wage base,
 * cap-gains breakpoints); rates and the number of brackets can change too, so both
 * are data here. The federal surcharge *set* is fixed (see federalSurchargeRules);
 * only the rates/thresholds below drive it.
 */
export interface TaxYearTables {
  year: number
  /** Sourcing citation for these figures, surfaced in the app footer. */
  source: string
  ordinaryBrackets: Record<FilingStatus, OrdinaryBracket[]>
  standardDeduction: Record<FilingStatus, number>
  capitalGains: {
    breakpoints: Record<FilingStatus, CapitalGainsBreakpoints>
    rates: { rate0: number; rate15: number; rate20: number }
  }
  niit: { rate: number; threshold: Record<FilingStatus, number> }
  socialSecurity: { rate: number; wageBase: number }
  medicare: { rate: number }
  additionalMedicare: { rate: number; threshold: Record<FilingStatus, number> }
}

/** How many dollars of income landed in one bracket, and the tax on them. */
export interface BracketFill {
  rate: number
  min: number
  max: number
  amountInBracket: number
  taxInBracket: number
}

/** Result of a surcharge (NIIT / Additional Medicare) evaluation — drives the light-bulb. */
export interface SurchargeResult {
  key: string
  label: string
  applies: boolean
  rate: number
  threshold: number
  /** The income measured against the threshold (MAGI for NIIT, wages for Medicare/FICA). */
  incomeMeasured: number
  /** Amount of that income over the threshold. */
  incomeOverThreshold: number
  /** Social Security only: the wage-base cap the rate applies *below* (inverse of a threshold). */
  cap?: number
  /** The dollar base the rate is actually applied to (amount = taxedAmount * rate). */
  taxedAmount: number
  amount: number
  /** NIIT only: net investment income, the other candidate for the taxed base. */
  investmentIncome?: number
}

/** Per-source contribution and its own effective rate, for the overall breakdown. */
export interface SourceBreakdown {
  source: IncomeSource
  amount: number
  tax: number
  effectiveRate: number
}

/** One add-on to the base marginal rate: a surtax (NIIT/Medicare) or a cap-gains bump. */
export interface MarginalComponent {
  label: string
  rate: number
  tone: 'surtax' | 'bump'
}

/** The next-dollar marginal cost for one income type: base rate + add-on components. */
export interface MarginalScenario {
  key: 'wages' | 'ordinaryInvestment' | 'retirement' | 'preferential'
  baseRate: number
  surtaxes: MarginalComponent[]
  surRate: number
  totalRate: number
}

/**
 * Extra capital-gains tax that one more ordinary dollar triggers by lifting the gains
 * stack — the "capital-gains bump". Null when the next ordinary dollar displaces nothing.
 */
export interface GainsBump {
  rate: number // fromRate → toRate spread
  fromRate: number // band the displaced gain dollar leaves
  toRate: number // band it enters
}

/**
 * A source's taxable slice positioned in the stack, for the towers.
 * `base` is the cumulative taxable income at the bottom of this layer.
 */
export interface IncomeLayer {
  source: IncomeSource
  taxableAmount: number
  base: number
  tax: number // income tax on this slice (excludes surcharges)
}

/**
 * Everything one taxing jurisdiction (federal today; a state later) produces from the
 * shared classified income. `capitalGainsFills` is empty and the bump is null for a
 * jurisdiction with no preferential ladder.
 */
export interface JurisdictionResult {
  key: string
  deduction: number
  deductionOnOrdinary: number
  leftoverDeduction: number
  preferentialDeduction: number
  ordinaryTaxable: number
  preferentialTaxable: number
  taxableIncome: number
  ordinaryFills: BracketFill[]
  capitalGainsFills: BracketFill[]
  capitalGainsBaseline: number
  roomAt0: number
  roomAt15: number
  ordinaryTax: number
  capitalGainsTax: number
  /** This jurisdiction's total tax: income tax + its surcharges. */
  tax: number
  /**
   * The net capital loss applied this year (§1211(b), limited by taxable income) and the
   * remainder carried forward by character (§1212(b)). Both zero when there's no net loss.
   */
  capitalLoss: { deduction: number; carryover: { shortTerm: number; longTerm: number } }
  surcharges: SurchargeResult[]
  marginalOrdinaryRate: number
  marginalCapitalGainsRate: number
  marginalGainsBump: GainsBump | null
  layers: { ordinary: IncomeLayer[]; preferential: IncomeLayer[] }
}

export interface TaxResult {
  filingStatus: FilingStatus
  taxYear: number
  /** Whether the deduction was a user-supplied custom amount (vs. the standard deduction). */
  deductionIsCustom: boolean

  // Shared inputs across jurisdictions.
  totalIncome: number
  ordinaryIncome: number
  preferentialIncome: number

  /** Federal computation. A second jurisdiction (state) would sit alongside as `state`. */
  federal: JurisdictionResult

  /**
   * Capital-gains netting summary (IRC §1222/§1211/§1212): the net short-/long-term
   * figures the user entered, what became taxable after netting the two against each
   * other, and any net capital loss. `lossDeduction` is the amount actually deducted
   * from income this year — income-limited, so it can be less than the $3,000/$1,500-MFS
   * §1211(b) cap (down to $0 when taxable income is already $0) — and `carryover` is the
   * remainder taken to future years by character. `lossDeduction`/`carryover` are the
   * federal figures (from `federal.capitalLoss`); a future state jurisdiction would expose
   * its own.
   */
  capitalGains: {
    netShortTerm: number
    netLongTerm: number
    taxableShortTerm: number
    taxableLongTerm: number
    lossDeduction: number
    carryover: { shortTerm: number; longTerm: number }
  }

  /** Per-source amount + tax + effective rate, combined across jurisdictions (today: federal). */
  sourceBreakdown: SourceBreakdown[]
  /** Combined tax and weighted effective rate across jurisdictions (today: federal). */
  totalTax: number
  effectiveRate: number
}
