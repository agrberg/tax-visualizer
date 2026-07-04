export type FilingStatus = 'single' | 'mfj' | 'hoh' | 'mfs'

/** Individual income sources the user enters. */
export type IncomeSource =
  | 'wages'
  | 'interest'
  | 'nonQualifiedDividends'
  | 'shortTermGains'
  | 'qualifiedDividends'
  | 'longTermGains'

/** Sources taxed at ordinary marginal rates. Order = layering order in the tower (bottom → top). */
export const ORDINARY_SOURCES: IncomeSource[] = [
  'wages',
  'interest',
  'nonQualifiedDividends',
  'shortTermGains',
]

/** Sources taxed on the preferential 0/15/20% capital-gains ladder. */
export const PREFERENTIAL_SOURCES: IncomeSource[] = [
  'qualifiedDividends',
  'longTermGains',
]

export interface TaxInput {
  filingStatus: FilingStatus
  wages: number
  interest: number
  nonQualifiedDividends: number
  shortTermGains: number
  qualifiedDividends: number
  longTermGains: number
}

/** A single ordinary-income bracket: [min, max) of taxable income at `rate`. */
export interface OrdinaryBracket {
  rate: number
  min: number
  max: number // Infinity for the top bracket
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
  /** The income measured against the threshold (MAGI for NIIT, wages for Medicare). */
  incomeMeasured: number
  /** Amount of that income over the threshold. */
  incomeOverThreshold: number
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
  key: 'wages' | 'ordinaryInvestment' | 'preferential'
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
  standardDeduction: number
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
  surcharges: SurchargeResult[]
  marginalOrdinaryRate: number
  marginalCapitalGainsRate: number
  marginalGainsBump: GainsBump | null
  layers: { ordinary: IncomeLayer[]; preferential: IncomeLayer[] }
}

export interface TaxResult {
  filingStatus: FilingStatus
  taxYear: number

  totalIncome: number
  ordinaryIncome: number
  preferentialIncome: number
  standardDeduction: number
  /** Portion of the standard deduction that spilled onto preferential income (shielded at 0%). */
  preferentialDeduction: number
  ordinaryTaxable: number
  preferentialTaxable: number
  taxableIncome: number

  /** Ordinary brackets filled by ordinary taxable income (bottom → top). */
  ordinaryFills: BracketFill[]
  /** Capital-gains brackets (0/15/20%) filled by preferential income, stacked on ordinary. */
  capitalGainsFills: BracketFill[]

  /** Room remaining before the next cap-gains rate kicks in. */
  roomAt0: number
  roomAt15: number
  /** Where ordinary taxable income lands on the cap-gains ladder (baseline for stacking). */
  capitalGainsBaseline: number

  ordinaryTax: number
  capitalGainsTax: number
  niit: SurchargeResult
  additionalMedicare: SurchargeResult
  totalTax: number

  effectiveRate: number // total tax / total income
  marginalOrdinaryRate: number // ordinary income-tax rate on the next ordinary dollar
  marginalCapitalGainsRate: number // band the next preferential dollar lands in
  marginalGainsBump: GainsBump | null // cap-gains tax an ordinary dollar triggers by lifting the stack

  sourceBreakdown: SourceBreakdown[]
  /** Ordinary sources as taxable slices, bottom → top (for the ordinary tower). */
  ordinaryLayers: IncomeLayer[]
  /** Preferential sources as taxable slices, stacked on the ordinary baseline. */
  preferentialLayers: IncomeLayer[]
}
