import type { BracketFill, OrdinaryBracket } from './types';

/** A tax band over a taxable-income range [min, max) at a flat rate. */
export interface Band {
  rate: number;
  min: number;
  max: number;
}

/** Convert ordinary brackets to bands (same shape; a type bridge). */
export function bracketsToBands(brackets: OrdinaryBracket[]): Band[] {
  return brackets.map((b) => ({ rate: b.rate, min: b.min, max: b.max }));
}

/** Fill `amount` of income sitting on top of `base` into `bands`, returning per-band fills. */
export function fillBands(base: number, amount: number, bands: Band[]): BracketFill[] {
  const start = base;
  const end = base + amount;
  return bands.map((band) => {
    const lo = Math.max(band.min, start);
    const hi = Math.min(band.max, end);
    const amountInBracket = Math.max(0, hi - lo);
    return {
      rate: band.rate,
      min: band.min,
      max: band.max,
      amountInBracket,
      taxInBracket: amountInBracket * band.rate,
    };
  });
}

/** Total tax on the income range [start, start+amount) integrated over `bands`. */
export function taxOverRange(start: number, amount: number, bands: Band[]): number {
  return fillBands(start, amount, bands).reduce((acc, f) => acc + f.taxInBracket, 0);
}

/** Rate of the band containing `pos` (falls back to the top band). */
export function marginalRateAt(pos: number, bands: Band[]): number {
  const band = bands.find((b) => pos >= b.min && pos < b.max);
  return (band ?? bands[bands.length - 1]).rate;
}
