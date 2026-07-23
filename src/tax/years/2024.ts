import type { TaxYearTables } from '../types';

export const TAX_YEAR_2024: TaxYearTables = {
  year: 2024,
  source: 'IRS Rev. Proc. 2023-34',
  ordinaryBrackets: {
    single: [
      { rate: 0.1, min: 0, max: 11600 },
      { rate: 0.12, min: 11600, max: 47150 },
      { rate: 0.22, min: 47150, max: 100525 },
      { rate: 0.24, min: 100525, max: 191950 },
      { rate: 0.32, min: 191950, max: 243725 },
      { rate: 0.35, min: 243725, max: 609350 },
      { rate: 0.37, min: 609350, max: Infinity },
    ],
    mfj: [
      { rate: 0.1, min: 0, max: 23200 },
      { rate: 0.12, min: 23200, max: 94300 },
      { rate: 0.22, min: 94300, max: 201050 },
      { rate: 0.24, min: 201050, max: 383900 },
      { rate: 0.32, min: 383900, max: 487450 },
      { rate: 0.35, min: 487450, max: 731200 },
      { rate: 0.37, min: 731200, max: Infinity },
    ],
    hoh: [
      { rate: 0.1, min: 0, max: 16550 },
      { rate: 0.12, min: 16550, max: 63100 },
      { rate: 0.22, min: 63100, max: 100500 },
      { rate: 0.24, min: 100500, max: 191950 },
      { rate: 0.32, min: 191950, max: 243700 },
      { rate: 0.35, min: 243700, max: 609350 },
      { rate: 0.37, min: 609350, max: Infinity },
    ],
    mfs: [
      { rate: 0.1, min: 0, max: 11600 },
      { rate: 0.12, min: 11600, max: 47150 },
      { rate: 0.22, min: 47150, max: 100525 },
      { rate: 0.24, min: 100525, max: 191950 },
      { rate: 0.32, min: 191950, max: 243725 },
      { rate: 0.35, min: 243725, max: 365600 },
      { rate: 0.37, min: 365600, max: Infinity },
    ],
  },
  standardDeduction: {
    single: 14600,
    mfj: 29200,
    hoh: 21900,
    mfs: 14600,
  },
  capitalGains: {
    breakpoints: {
      single: { rate0Max: 47025, rate15Max: 518900 },
      mfj: { rate0Max: 94050, rate15Max: 583750 },
      hoh: { rate0Max: 63000, rate15Max: 551350 },
      mfs: { rate0Max: 47025, rate15Max: 291850 },
    },
    rates: { rate0: 0, rate15: 0.15, rate20: 0.2 },
  },
  niit: {
    rate: 0.038,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
  socialSecurity: { rate: 0.062, wageBase: 168600 },
  medicare: { rate: 0.0145 },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
};
