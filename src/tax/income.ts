import { INVESTMENT_SOURCES, ORDINARY_SOURCES, PREFERENTIAL_SOURCES, type IncomeSource, type TaxInput } from './types';

/** Income clamped to ≥0 and split into the ordinary and preferential pools. */
export interface ClassifiedIncome {
  amounts: Record<IncomeSource, number>;
  ordinaryIncome: number;
  preferentialIncome: number;
  totalIncome: number;
  /** Everything except wages — the base NIIT is measured against. */
  netInvestmentIncome: number;
  /**
   * The residual net capital loss after ST/LT netting, split by holding-period character
   * (both ≥0). The jurisdiction turns this into the §1211(b) deduction (capped at the
   * filing-status limit, then limited by taxable income) and the §1212(b) carryover — all
   * of which it can only size once the cap and taxable income are known.
   */
  capitalNetLoss: { shortTerm: number; longTerm: number };
}

/** The taxable capital-gains pools plus the net-loss figures after ST/LT netting. */
export interface CapitalGainOutcome {
  /** Net short-term gain that remains taxable (ordinary rates); ≥0. */
  shortTermGains: number;
  /** Net long-term gain that remains taxable (preferential ladder); ≥0. */
  longTermGains: number;
  /** Residual net short-term capital loss (≥0) after netting against long-term. */
  shortTermLoss: number;
  /** Residual net long-term capital loss (≥0) after netting against short-term. */
  longTermLoss: number;
}

/**
 * Net short-term and long-term capital results against each other. `shortTerm` / `longTerm`
 * are already the *net* figures for each holding period (Schedule D nets within a period
 * first, in Parts I and II); this models the second stage — netting the two periods against
 * one another (IRC §1222(11): "net capital gain" = net long-term gain − net short-term loss):
 *
 *   • A net ST loss absorbs into a net LT gain (and vice-versa) *before* anything reaches
 *     ordinary income. A surviving gain keeps the character of the *gain* leg:
 *       – net STCL vs net LTCG → residual is long-term (e.g. −100 ST + 1000 LT = 900 LT).
 *       – net LTCL vs net STCG → residual is short-term (e.g. 1000 ST − 100 LT = 900 ST).
 *     Two gains never interact; each is taxed in its own pool.
 *   • A residual *net* loss is returned by character. This function is pure §1222 netting;
 *     the §1211(b) annual cap, the taxable-income limit, and the §1212(b) carryover are all
 *     applied by the jurisdiction, which alone knows the filing-status cap and taxable income.
 *
 * Qualified dividends are taxed at long-term rates but are *not* capital gains, so they
 * are intentionally not an input here and can never be offset by a capital loss.
 *
 * Refs: https://www.law.cornell.edu/uscode/text/26/1222 ·
 * https://www.law.cornell.edu/uscode/text/26/1211 · https://www.irs.gov/taxtopics/tc409 ·
 * 2025 Instructions for Schedule D (Form 1040), https://www.irs.gov/instructions/i1040sd
 */
export function nettedCapitalGains(shortTerm: number, longTerm: number): CapitalGainOutcome {
  const st = Number.isFinite(shortTerm) ? shortTerm : 0;
  const lt = Number.isFinite(longTerm) ? longTerm : 0;

  // Taxable gain per pool, and any residual loss split by holding-period character.
  let taxableShortTerm = 0;
  let taxableLongTerm = 0;
  let shortTermLoss = 0;
  let longTermLoss = 0;

  if (st >= 0 && lt >= 0) {
    // Two gains (or zeros): no interaction.
    taxableShortTerm = st;
    taxableLongTerm = lt;
  } else if (st < 0 && lt < 0) {
    // Two losses: nothing taxable; each carries out on its own character.
    shortTermLoss = -st;
    longTermLoss = -lt;
  } else {
    // Opposite signs: the loss offsets the gain. The combined figure keeps the sign —
    // and thus the character — of whichever leg was the gain.
    const combined = st + lt;
    if (combined > 0) {
      if (lt > 0) taxableLongTerm = combined;
      else taxableShortTerm = combined;
    } else if (combined < 0) {
      // Net loss on the loss leg's character (the larger-magnitude leg).
      if (lt < 0) longTermLoss = -combined;
      else shortTermLoss = -combined;
    }
    // combined === 0 is a wash: nothing taxable, no loss.
  }

  return {
    shortTermGains: taxableShortTerm,
    longTermGains: taxableLongTerm,
    shortTermLoss,
    longTermLoss,
  };
}

/** Normalize a raw input (net capital gains, clamp negatives) and classify it by tax treatment. */
export function classifyIncome(input: TaxInput): ClassifiedIncome {
  // Coerce non-finite (e.g. a field absent from older saved input) to 0, then clamp.
  const amt = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
  // Net short- vs long-term capital results before pooling. `shortTerm`/`longTerm` may
  // be negative (a capital loss); the outcome's taxable pools are already ≥0.
  const capital = nettedCapitalGains(input.shortTermGains, input.longTermGains);
  const amounts: Record<IncomeSource, number> = {
    wages: amt(input.wages),
    retirementIncome: amt(input.retirementIncome),
    interest: amt(input.interest),
    nonQualifiedDividends: amt(input.nonQualifiedDividends),
    shortTermGains: capital.shortTermGains,
    qualifiedDividends: amt(input.qualifiedDividends),
    longTermGains: capital.longTermGains,
  };
  const ordinaryIncome = ORDINARY_SOURCES.reduce((s, k) => s + amounts[k], 0);
  const preferentialIncome = PREFERENTIAL_SOURCES.reduce((s, k) => s + amounts[k], 0);
  return {
    amounts,
    ordinaryIncome,
    preferentialIncome,
    totalIncome: ordinaryIncome + preferentialIncome,
    netInvestmentIncome: INVESTMENT_SOURCES.reduce((s, k) => s + amounts[k], 0),
    capitalNetLoss: { shortTerm: capital.shortTermLoss, longTerm: capital.longTermLoss },
  };
}
