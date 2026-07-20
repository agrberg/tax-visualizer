import { describe, it, expect } from 'vitest';
import { bracketsToBands, fillBands, marginalRateAt, taxOverRange, type Band } from './engine';

const bands: Band[] = [
  { rate: 0.1, min: 0, max: 100 },
  { rate: 0.2, min: 100, max: 300 },
  { rate: 0.3, min: 300, max: Number.POSITIVE_INFINITY },
];

describe('engine bracket primitive', () => {
  it('fills income sitting on a base across the bands it spans', () => {
    const fills = fillBands(50, 300, bands); // occupies [50, 350)
    expect(fills.map((f) => f.amountInBracket)).toEqual([50, 200, 50]);
    expect(fills.map((f) => f.taxInBracket)).toEqual([5, 40, 15]);
  });

  it('returns zero-amount fills for untouched bands', () => {
    const fills = fillBands(0, 40, bands);
    expect(fills.map((f) => f.amountInBracket)).toEqual([40, 0, 0]);
  });

  it('integrates tax over a range', () => {
    expect(taxOverRange(50, 300, bands)).toBe(60); // 5 + 40 + 15
    expect(taxOverRange(0, 0, bands)).toBe(0);
  });

  it('finds the marginal rate at a position and clamps to the top band', () => {
    expect(marginalRateAt(0, bands)).toBe(0.1);
    expect(marginalRateAt(100, bands)).toBe(0.2); // boundary belongs to the upper band
    expect(marginalRateAt(1_000_000, bands)).toBe(0.3);
  });

  it('bridges ordinary brackets to bands unchanged', () => {
    expect(bracketsToBands([{ rate: 0.12, min: 0, max: 50 }])).toEqual([{ rate: 0.12, min: 0, max: 50 }]);
  });
});
