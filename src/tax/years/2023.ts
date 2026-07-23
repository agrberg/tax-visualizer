import type { TaxYearTables } from '../types';

export const TAX_YEAR_2023: TaxYearTables = {
  year: 2023,
  source: 'IRS Rev. Proc. 2022-38',
  ordinaryBrackets: {
    single: [
      { rate: 0.1, min: 0, max: 11000 },
      { rate: 0.12, min: 11000, max: 44725 },
      { rate: 0.22, min: 44725, max: 95375 },
      { rate: 0.24, min: 95375, max: 182100 },
      { rate: 0.32, min: 182100, max: 231250 },
      { rate: 0.35, min: 231250, max: 578125 },
      { rate: 0.37, min: 578125, max: Infinity },
    ],
    mfj: [
      { rate: 0.1, min: 0, max: 22000 },
      { rate: 0.12, min: 22000, max: 89450 },
      { rate: 0.22, min: 89450, max: 190750 },
      { rate: 0.24, min: 190750, max: 364200 },
      { rate: 0.32, min: 364200, max: 462500 },
      { rate: 0.35, min: 462500, max: 693750 },
      { rate: 0.37, min: 693750, max: Infinity },
    ],
    hoh: [
      { rate: 0.1, min: 0, max: 15700 },
      { rate: 0.12, min: 15700, max: 59850 },
      { rate: 0.22, min: 59850, max: 95350 },
      { rate: 0.24, min: 95350, max: 182100 },
      { rate: 0.32, min: 182100, max: 231250 },
      { rate: 0.35, min: 231250, max: 578100 },
      { rate: 0.37, min: 578100, max: Infinity },
    ],
    mfs: [
      { rate: 0.1, min: 0, max: 11000 },
      { rate: 0.12, min: 11000, max: 44725 },
      { rate: 0.22, min: 44725, max: 95375 },
      { rate: 0.24, min: 95375, max: 182100 },
      { rate: 0.32, min: 182100, max: 231250 },
      { rate: 0.35, min: 231250, max: 346875 },
      { rate: 0.37, min: 346875, max: Infinity },
    ],
  },
  standardDeduction: {
    single: 13850,
    mfj: 27700,
    hoh: 20800,
    mfs: 13850,
  },
  capitalGains: {
    breakpoints: {
      single: { rate0Max: 44625, rate15Max: 492300 },
      mfj: { rate0Max: 89250, rate15Max: 553850 },
      hoh: { rate0Max: 59750, rate15Max: 523050 },
      mfs: { rate0Max: 44625, rate15Max: 276900 },
    },
    rates: { rate0: 0, rate15: 0.15, rate20: 0.2 },
  },
  niit: {
    rate: 0.038,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
  socialSecurity: { rate: 0.062, wageBase: 160200 },
  medicare: { rate: 0.0145 },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
};
