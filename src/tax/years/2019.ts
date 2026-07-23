import type { TaxYearTables } from '../types';

export const TAX_YEAR_2019: TaxYearTables = {
  year: 2019,
  source: 'IRS Rev. Proc. 2018-57',
  ordinaryBrackets: {
    single: [
      { rate: 0.1, min: 0, max: 9700 },
      { rate: 0.12, min: 9700, max: 39475 },
      { rate: 0.22, min: 39475, max: 84200 },
      { rate: 0.24, min: 84200, max: 160725 },
      { rate: 0.32, min: 160725, max: 204100 },
      { rate: 0.35, min: 204100, max: 510300 },
      { rate: 0.37, min: 510300, max: Infinity },
    ],
    mfj: [
      { rate: 0.1, min: 0, max: 19400 },
      { rate: 0.12, min: 19400, max: 78950 },
      { rate: 0.22, min: 78950, max: 168400 },
      { rate: 0.24, min: 168400, max: 321450 },
      { rate: 0.32, min: 321450, max: 408200 },
      { rate: 0.35, min: 408200, max: 612350 },
      { rate: 0.37, min: 612350, max: Infinity },
    ],
    hoh: [
      { rate: 0.1, min: 0, max: 13850 },
      { rate: 0.12, min: 13850, max: 52850 },
      { rate: 0.22, min: 52850, max: 84200 },
      { rate: 0.24, min: 84200, max: 160700 },
      { rate: 0.32, min: 160700, max: 204100 },
      { rate: 0.35, min: 204100, max: 510300 },
      { rate: 0.37, min: 510300, max: Infinity },
    ],
    mfs: [
      { rate: 0.1, min: 0, max: 9700 },
      { rate: 0.12, min: 9700, max: 39475 },
      { rate: 0.22, min: 39475, max: 84200 },
      { rate: 0.24, min: 84200, max: 160725 },
      { rate: 0.32, min: 160725, max: 204100 },
      { rate: 0.35, min: 204100, max: 306175 },
      { rate: 0.37, min: 306175, max: Infinity },
    ],
  },
  standardDeduction: {
    single: 12200,
    mfj: 24400,
    hoh: 18350,
    mfs: 12200,
  },
  capitalGains: {
    breakpoints: {
      single: { rate0Max: 39375, rate15Max: 434550 },
      mfj: { rate0Max: 78750, rate15Max: 488850 },
      hoh: { rate0Max: 52750, rate15Max: 461700 },
      mfs: { rate0Max: 39375, rate15Max: 244425 },
    },
    rates: { rate0: 0, rate15: 0.15, rate20: 0.2 },
  },
  niit: {
    rate: 0.038,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
  socialSecurity: { rate: 0.062, wageBase: 132900 },
  medicare: { rate: 0.0145 },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
};
