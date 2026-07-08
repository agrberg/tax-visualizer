import type { TaxYearTables } from '../types'

const INF = Number.POSITIVE_INFINITY

/**
 * 2025 federal tax tables.
 *
 * Sources (verified 2026-07):
 * - Ordinary brackets and LTCG breakpoints: IRS Rev. Proc. 2024-40 (2025 inflation
 *   adjustments), cross-checked against Tax Foundation.
 * - Standard deduction: raised for 2025 by the One Big Beautiful Bill Act (P.L. 119-21),
 *   which superseded the lower Rev. Proc. 2024-40 amounts ($15,000 / $30,000 / $22,500).
 * - NIIT (§1411) and Additional Medicare Tax (§3101(b)(2)) thresholds are statutory and
 *   unchanged.
 * - Social Security wage base ($176,100 for 2025) per the SSA; SS 6.2% and Medicare 1.45%
 *   rates are statutory.
 * - mfs ordinary brackets mirror single except the top bracket, which starts at half of
 *   the mfj threshold ($375,800). The cap-gains breakpoints are the IRS's published mfs
 *   figures — roughly, but not exactly, half of mfj (e.g. the 15% ceiling is $300,000,
 *   not mfj's $600,050 / 2).
 */
export const TAX_YEAR_2025: TaxYearTables = {
  year: 2025,
  source: 'IRS Rev. Proc. 2024-40; standard deduction per OBBBA (P.L. 119-21)',
  ordinaryBrackets: {
    single: [
      { rate: 0.1, min: 0, max: 11925 },
      { rate: 0.12, min: 11925, max: 48475 },
      { rate: 0.22, min: 48475, max: 103350 },
      { rate: 0.24, min: 103350, max: 197300 },
      { rate: 0.32, min: 197300, max: 250525 },
      { rate: 0.35, min: 250525, max: 626350 },
      { rate: 0.37, min: 626350, max: INF },
    ],
    mfj: [
      { rate: 0.1, min: 0, max: 23850 },
      { rate: 0.12, min: 23850, max: 96950 },
      { rate: 0.22, min: 96950, max: 206700 },
      { rate: 0.24, min: 206700, max: 394600 },
      { rate: 0.32, min: 394600, max: 501050 },
      { rate: 0.35, min: 501050, max: 751600 },
      { rate: 0.37, min: 751600, max: INF },
    ],
    hoh: [
      { rate: 0.1, min: 0, max: 17000 },
      { rate: 0.12, min: 17000, max: 64850 },
      { rate: 0.22, min: 64850, max: 103350 },
      { rate: 0.24, min: 103350, max: 197300 },
      { rate: 0.32, min: 197300, max: 250500 },
      { rate: 0.35, min: 250500, max: 626350 },
      { rate: 0.37, min: 626350, max: INF },
    ],
    mfs: [
      { rate: 0.1, min: 0, max: 11925 },
      { rate: 0.12, min: 11925, max: 48475 },
      { rate: 0.22, min: 48475, max: 103350 },
      { rate: 0.24, min: 103350, max: 197300 },
      { rate: 0.32, min: 197300, max: 250525 },
      { rate: 0.35, min: 250525, max: 375800 },
      { rate: 0.37, min: 375800, max: INF },
    ],
  },
  standardDeduction: {
    single: 15750,
    mfj: 31500,
    hoh: 23625,
    mfs: 15750,
  },
  capitalGains: {
    breakpoints: {
      single: { rate0Max: 48350, rate15Max: 533400 },
      mfj: { rate0Max: 96700, rate15Max: 600050 },
      hoh: { rate0Max: 64750, rate15Max: 566700 },
      mfs: { rate0Max: 48350, rate15Max: 300000 },
    },
    rates: { rate0: 0, rate15: 0.15, rate20: 0.2 },
  },
  niit: {
    rate: 0.038,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
  socialSecurity: { rate: 0.062, wageBase: 176100 },
  medicare: { rate: 0.0145 },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
}
