import type { TaxYearTables } from '../types';

const INF = Number.POSITIVE_INFINITY;

/**
 * 2026 federal tax tables.
 *
 * Sources (verified 2026-07):
 * - Ordinary brackets, standard deduction, LTCG breakpoints: IRS Rev. Proc. 2025-32
 *   (2026 inflation adjustments, incl. OBBBA), cross-checked against Tax Foundation.
 * - NIIT (§1411) and Additional Medicare Tax (§3101(b)(2)) thresholds are set by statute
 *   and are NOT inflation-adjusted.
 * - Social Security wage base ($184,500 for 2026) is inflation-indexed and set annually
 *   by the SSA (Contribution and Benefit Base); SS 6.2% and Medicare 1.45% rates are statutory.
 */
export const TAX_YEAR_2026: TaxYearTables = {
  year: 2026,
  source: 'IRS Rev. Proc. 2025-32',
  ordinaryBrackets: {
    single: [
      { rate: 0.1, min: 0, max: 12400 },
      { rate: 0.12, min: 12400, max: 50400 },
      { rate: 0.22, min: 50400, max: 105700 },
      { rate: 0.24, min: 105700, max: 201775 },
      { rate: 0.32, min: 201775, max: 256225 },
      { rate: 0.35, min: 256225, max: 640600 },
      { rate: 0.37, min: 640600, max: INF },
    ],
    mfj: [
      { rate: 0.1, min: 0, max: 24800 },
      { rate: 0.12, min: 24800, max: 100800 },
      { rate: 0.22, min: 100800, max: 211400 },
      { rate: 0.24, min: 211400, max: 403550 },
      { rate: 0.32, min: 403550, max: 512450 },
      { rate: 0.35, min: 512450, max: 768700 },
      { rate: 0.37, min: 768700, max: INF },
    ],
    hoh: [
      { rate: 0.1, min: 0, max: 17700 },
      { rate: 0.12, min: 17700, max: 67450 },
      { rate: 0.22, min: 67450, max: 105700 },
      { rate: 0.24, min: 105700, max: 201775 },
      { rate: 0.32, min: 201775, max: 256200 },
      { rate: 0.35, min: 256200, max: 640600 },
      { rate: 0.37, min: 640600, max: INF },
    ],
    mfs: [
      { rate: 0.1, min: 0, max: 12400 },
      { rate: 0.12, min: 12400, max: 50400 },
      { rate: 0.22, min: 50400, max: 105700 },
      { rate: 0.24, min: 105700, max: 201775 },
      { rate: 0.32, min: 201775, max: 256225 },
      { rate: 0.35, min: 256225, max: 384350 },
      { rate: 0.37, min: 384350, max: INF },
    ],
  },
  standardDeduction: {
    single: 16100,
    mfj: 32200,
    hoh: 24150,
    mfs: 16100,
  },
  capitalGains: {
    breakpoints: {
      single: { rate0Max: 49450, rate15Max: 545500 },
      mfj: { rate0Max: 98900, rate15Max: 613700 },
      hoh: { rate0Max: 66200, rate15Max: 579600 },
      mfs: { rate0Max: 49450, rate15Max: 306850 },
    },
    rates: { rate0: 0, rate15: 0.15, rate20: 0.2 },
  },
  niit: {
    rate: 0.038,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
  socialSecurity: { rate: 0.062, wageBase: 184500 },
  medicare: { rate: 0.0145 },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
};
