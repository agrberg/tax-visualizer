import { describe, it, expect } from 'vitest';
import { medicareBaseRule, medicareRule, niitRule, socialSecurityRule } from './surcharges';
import { taxTablesFor } from './years';

const t = taxTablesFor(2026);

describe('niitRule', () => {
  const rule = niitRule('mfj', t.niit); // threshold 250000

  it('taxes the lesser of NII and MAGI over the threshold', () => {
    const a = rule.assess({ wages: 200000, netInvestmentIncome: 100000, magi: 300000 });
    expect(a.incomeOverThreshold).toBe(50000); // MAGI over is the lesser
    expect(a.taxedAmount).toBe(50000);
    expect(a.amount).toBeCloseTo(1900, 5);
    expect(a.applies).toBe(true);
  });

  it('does not apply below the threshold', () => {
    const a = rule.assess({ wages: 100000, netInvestmentIncome: 50000, magi: 150000 });
    expect(a.applies).toBe(false);
    expect(a.amount).toBe(0);
  });
});

describe('medicareRule', () => {
  const rule = medicareRule('single', t.additionalMedicare); // threshold 200000

  it('taxes wages over the threshold', () => {
    const a = rule.assess({ wages: 250000, netInvestmentIncome: 0, magi: 250000 });
    expect(a.incomeOverThreshold).toBe(50000);
    expect(a.amount).toBeCloseTo(450, 5);
  });
});

describe('socialSecurityRule (capped, the inverse of a threshold)', () => {
  const rule = socialSecurityRule(t.socialSecurity);
  const ctx = (wages: number) => ({ wages, netInvestmentIncome: 0, magi: wages });

  it('taxes 6.2% of wages below the wage-base cap', () => {
    const a = rule.assess(ctx(100000));
    expect(a.cap).toBe(184500);
    expect(a.taxedAmount).toBe(100000);
    expect(a.amount).toBeCloseTo(6200, 5);
    expect(a.applies).toBe(true);
  });

  it('caps the taxed base at the wage base', () => {
    const atCap = rule.assess(ctx(184500));
    expect(atCap.taxedAmount).toBe(184500);
    expect(atCap.amount).toBeCloseTo(184500 * 0.062, 5);

    const overCap = rule.assess(ctx(250000));
    expect(overCap.taxedAmount).toBe(184500); // wages above the cap escape SS
    expect(overCap.incomeOverThreshold).toBe(65500); // the untaxed remainder, for display
    expect(overCap.amount).toBeCloseTo(184500 * 0.062, 5);
  });

  it('does not apply with zero wages', () => {
    expect(rule.assess(ctx(0)).applies).toBe(false);
  });
});

describe('medicareBaseRule (flat, uncapped)', () => {
  const rule = medicareBaseRule(t.medicare);
  const ctx = (wages: number) => ({ wages, netInvestmentIncome: 0, magi: wages });

  it('taxes 1.45% of all wages with no cap or threshold', () => {
    const a = rule.assess(ctx(500000));
    expect(a.taxedAmount).toBe(500000);
    expect(a.amount).toBeCloseTo(7250, 5);
  });
});
