import type { TaxYearTables } from '../types';

export const TAX_YEAR_2022: TaxYearTables = {
  year: 2022,
  source: 'IRS Rev. Proc. 2021-45',
  ordinaryBrackets: {
    single: [
      { rate: 0.1, min: 0, max: 10275 },
      { rate: 0.12, min: 10275, max: 41775 },
      { rate: 0.22, min: 41775, max: 89075 },
      { rate: 0.24, min: 89075, max: 170050 },
      { rate: 0.32, min: 170050, max: 215950 },
      { rate: 0.35, min: 215950, max: 539900 },
      { rate: 0.37, min: 539900, max: Infinity },
    ],
    mfj: [
      { rate: 0.1, min: 0, max: 20550 },
      { rate: 0.12, min: 20550, max: 83550 },
      { rate: 0.22, min: 83550, max: 178150 },
      { rate: 0.24, min: 178150, max: 340100 },
      { rate: 0.32, min: 340100, max: 431900 },
      { rate: 0.35, min: 431900, max: 647850 },
      { rate: 0.37, min: 647850, max: Infinity },
    ],
    hoh: [
      { rate: 0.1, min: 0, max: 14650 },
      { rate: 0.12, min: 14650, max: 55900 },
      { rate: 0.22, min: 55900, max: 89050 },
      { rate: 0.24, min: 89050, max: 170050 },
      { rate: 0.32, min: 170050, max: 215950 },
      { rate: 0.35, min: 215950, max: 539900 },
      { rate: 0.37, min: 539900, max: Infinity },
    ],
    mfs: [
      { rate: 0.1, min: 0, max: 10275 },
      { rate: 0.12, min: 10275, max: 41775 },
      { rate: 0.22, min: 41775, max: 89075 },
      { rate: 0.24, min: 89075, max: 170050 },
      { rate: 0.32, min: 170050, max: 215950 },
      { rate: 0.35, min: 215950, max: 323925 },
      { rate: 0.37, min: 323925, max: Infinity },
    ],
  },
  standardDeduction: {
    single: 12950,
    mfj: 25900,
    hoh: 19400,
    mfs: 12950,
  },
  capitalGains: {
    breakpoints: {
      single: { rate0Max: 41675, rate15Max: 459750 },
      mfj: { rate0Max: 83350, rate15Max: 517200 },
      hoh: { rate0Max: 55800, rate15Max: 488500 },
      mfs: { rate0Max: 41675, rate15Max: 258600 },
    },
    rates: { rate0: 0, rate15: 0.15, rate20: 0.2 },
  },
  niit: {
    rate: 0.038,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
  socialSecurity: { rate: 0.062, wageBase: 147000 },
  medicare: { rate: 0.0145 },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
};
