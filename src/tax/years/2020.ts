import type { TaxYearTables } from '../types';

export const TAX_YEAR_2020: TaxYearTables = {
  year: 2020,
  source: 'IRS Rev. Proc. 2019-44',
  ordinaryBrackets: {
    single: [
      { rate: 0.1, min: 0, max: 9875 },
      { rate: 0.12, min: 9875, max: 40125 },
      { rate: 0.22, min: 40125, max: 85525 },
      { rate: 0.24, min: 85525, max: 163300 },
      { rate: 0.32, min: 163300, max: 207350 },
      { rate: 0.35, min: 207350, max: 518400 },
      { rate: 0.37, min: 518400, max: Infinity },
    ],
    mfj: [
      { rate: 0.1, min: 0, max: 19750 },
      { rate: 0.12, min: 19750, max: 80250 },
      { rate: 0.22, min: 80250, max: 171050 },
      { rate: 0.24, min: 171050, max: 326600 },
      { rate: 0.32, min: 326600, max: 414700 },
      { rate: 0.35, min: 414700, max: 622050 },
      { rate: 0.37, min: 622050, max: Infinity },
    ],
    hoh: [
      { rate: 0.1, min: 0, max: 14100 },
      { rate: 0.12, min: 14100, max: 53700 },
      { rate: 0.22, min: 53700, max: 85500 },
      { rate: 0.24, min: 85500, max: 163300 },
      { rate: 0.32, min: 163300, max: 207350 },
      { rate: 0.35, min: 207350, max: 518400 },
      { rate: 0.37, min: 518400, max: Infinity },
    ],
    mfs: [
      { rate: 0.1, min: 0, max: 9875 },
      { rate: 0.12, min: 9875, max: 40125 },
      { rate: 0.22, min: 40125, max: 85525 },
      { rate: 0.24, min: 85525, max: 163300 },
      { rate: 0.32, min: 163300, max: 207350 },
      { rate: 0.35, min: 207350, max: 311025 },
      { rate: 0.37, min: 311025, max: Infinity },
    ],
  },
  standardDeduction: {
    single: 12400,
    mfj: 24800,
    hoh: 18650,
    mfs: 12400,
  },
  capitalGains: {
    breakpoints: {
      single: { rate0Max: 40000, rate15Max: 441450 },
      mfj: { rate0Max: 80000, rate15Max: 496600 },
      hoh: { rate0Max: 53600, rate15Max: 469050 },
      mfs: { rate0Max: 40000, rate15Max: 248300 },
    },
    rates: { rate0: 0, rate15: 0.15, rate20: 0.2 },
  },
  niit: {
    rate: 0.038,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
  socialSecurity: { rate: 0.062, wageBase: 137700 },
  medicare: { rate: 0.0145 },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
};
