import type { TaxYearTables } from '../types';

export const TAX_YEAR_2021: TaxYearTables = {
  year: 2021,
  source: 'IRS Rev. Proc. 2020-45',
  ordinaryBrackets: {
    single: [
      { rate: 0.1, min: 0, max: 9950 },
      { rate: 0.12, min: 9950, max: 40525 },
      { rate: 0.22, min: 40525, max: 86375 },
      { rate: 0.24, min: 86375, max: 164925 },
      { rate: 0.32, min: 164925, max: 209425 },
      { rate: 0.35, min: 209425, max: 523600 },
      { rate: 0.37, min: 523600, max: Infinity },
    ],
    mfj: [
      { rate: 0.1, min: 0, max: 19900 },
      { rate: 0.12, min: 19900, max: 81050 },
      { rate: 0.22, min: 81050, max: 172750 },
      { rate: 0.24, min: 172750, max: 329850 },
      { rate: 0.32, min: 329850, max: 418850 },
      { rate: 0.35, min: 418850, max: 628300 },
      { rate: 0.37, min: 628300, max: Infinity },
    ],
    hoh: [
      { rate: 0.1, min: 0, max: 14200 },
      { rate: 0.12, min: 14200, max: 54200 },
      { rate: 0.22, min: 54200, max: 86350 },
      { rate: 0.24, min: 86350, max: 164900 },
      { rate: 0.32, min: 164900, max: 209400 },
      { rate: 0.35, min: 209400, max: 523600 },
      { rate: 0.37, min: 523600, max: Infinity },
    ],
    mfs: [
      { rate: 0.1, min: 0, max: 9950 },
      { rate: 0.12, min: 9950, max: 40525 },
      { rate: 0.22, min: 40525, max: 86375 },
      { rate: 0.24, min: 86375, max: 164925 },
      { rate: 0.32, min: 164925, max: 209425 },
      { rate: 0.35, min: 209425, max: 314150 },
      { rate: 0.37, min: 314150, max: Infinity },
    ],
  },
  standardDeduction: {
    single: 12550,
    mfj: 25100,
    hoh: 18800,
    mfs: 12550,
  },
  capitalGains: {
    breakpoints: {
      single: { rate0Max: 40400, rate15Max: 445850 },
      mfj: { rate0Max: 80800, rate15Max: 501600 },
      hoh: { rate0Max: 54100, rate15Max: 473750 },
      mfs: { rate0Max: 40400, rate15Max: 250800 },
    },
    rates: { rate0: 0, rate15: 0.15, rate20: 0.2 },
  },
  niit: {
    rate: 0.038,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
  socialSecurity: { rate: 0.062, wageBase: 142800 },
  medicare: { rate: 0.0145 },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
};
