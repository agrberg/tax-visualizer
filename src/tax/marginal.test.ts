import { describe, it, expect } from 'vitest';
import { calculateTax } from './calculate';
import { marginalNextDollar } from './marginal';
import { FILING_STATUSES } from './filingStatus';
import { AVAILABLE_YEARS, taxTablesFor } from './years';
import { makeInput } from './testUtils';
import type { IncomeSource, MarginalScenario, TaxInput } from './types';

const rates = (input: TaxInput) =>
  Object.fromEntries(marginalNextDollar(calculateTax(input)).map((s) => [s.key, s])) as Record<
    MarginalScenario['key'],
    MarginalScenario
  >;

const LOSS_CARRYOVER = makeInput({
  filingStatus: 'mfs',
  taxYear: 2022,
  wages: 309092,
  retirementIncome: 1792,
  interest: 11315,
  nonQualifiedDividends: 2042,
  longTermGains: -323530,
});

describe('marginalNextDollar', () => {
  it('reports 0 for the next gain dollar when an unused capital loss absorbs it', () => {
    const m = rates(LOSS_CARRYOVER);
    expect(m.longTermGain.totalRate).toBe(0);
    expect(m.shortTermGain.totalRate).toBe(0);
    expect(m.preferential.totalRate).toBeCloseTo(0.238, 6); // a qualified dividend is not nettable
    expect(m.ordinaryInvestment.totalRate).toBeCloseTo(0.388, 6);
    expect(m.wages.totalRate).toBeCloseTo(0.3735, 6);
  });

  it('taxes the next long-term dollar at the ordinary rate when it shrinks a fully used loss', () => {
    const m = rates(makeInput({ wages: 100000, longTermGains: -2000 }));
    expect(m.longTermGain.totalRate).toBeCloseTo(0.22, 6);
    expect(m.preferential.totalRate).toBeCloseTo(0.15, 6);
    expect(m.shortTermGain).toBeUndefined(); // same as interest, so not shown
  });

  it('taxes the next long-term dollar as short-term when it offsets a long-term loss against a short-term gain', () => {
    const m = rates(makeInput({ wages: 100000, shortTermGains: 1000, longTermGains: -100 }));
    expect(m.longTermGain.totalRate).toBeCloseTo(0.22, 6);
  });

  it('reports 0 income tax on the next ordinary dollar when the loss deduction sits on preferential income', () => {
    const m = rates(
      makeInput({
        filingStatus: 'mfj',
        taxYear: 2020,
        shortTermGains: 4088,
        qualifiedDividends: 26699,
        longTermGains: -17603,
        deduction: 0,
      }),
    );
    expect(m.ordinaryInvestment.totalRate).toBe(0);
    expect(m.wages.totalRate).toBeCloseTo(0.0765, 6);
  });

  it('does not label the short-term card a bump when a long-term gain is taxed instead of ordinary income', () => {
    const m = rates(makeInput({ taxYear: 2025, wages: 40000, shortTermGains: -1000, longTermGains: 30000 }));
    expect(m.shortTermGain.totalRate).toBeCloseTo(0.15, 6);
    expect(m.shortTermGain.surtaxes.filter((s) => s.tone === 'bump')).toEqual([]);
  });

  it('splits a retirement dollar that lifts the gains stack into base tax plus a bump', () => {
    const m = rates(makeInput({ taxYear: 2025, retirementIncome: 62000, longTermGains: 10000 }));
    expect(m.retirement.baseRate).toBeCloseTo(0.12, 6);
    expect(m.retirement.surtaxes).toEqual([{ label: 'pushes a gain 0%→15%', rate: 0.15, tone: 'bump' }]);
  });

  it('returns exactly the four base cards when no capital loss is present', () => {
    const keys = marginalNextDollar(calculateTax(makeInput({ wages: 100000, longTermGains: 5000 }))).map((s) => s.key);
    expect(keys).toEqual(['wages', 'ordinaryInvestment', 'retirement', 'preferential']);
  });

  it('reports the next bracket rate when income sits exactly on a bracket boundary', () => {
    const tables = taxTablesFor(2026);
    const topOfSecondBracket = tables.ordinaryBrackets.single[1].max + tables.standardDeduction.single;
    const m = rates(makeInput({ retirementIncome: topOfSecondBracket }));
    expect(m.retirement.baseRate).toBeCloseTo(tables.ordinaryBrackets.single[2].rate, 6);
  });

  it('matches a real one-dollar recalculation for every card, on seeded random inputs', () => {
    const PROBE_FIELD: Record<MarginalScenario['key'], IncomeSource> = {
      wages: 'wages',
      ordinaryInvestment: 'interest',
      retirement: 'retirementIncome',
      preferential: 'qualifiedDividends',
      shortTermGain: 'shortTermGains',
      longTermGain: 'longTermGains',
    };
    const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
    // mulberry32: a small seeded PRNG so a failing input reproduces
    let state = 12345;
    const random = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const amount = (max: number): number => (random() < 0.3 ? 0 : Math.round(random() ** 2 * max));
    const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];

    for (let n = 0; n < 2000; n++) {
      let shortTermGains = amount(80000);
      let longTermGains = amount(700000);
      if (random() < 0.3) {
        const negate = pick(['short', 'long', 'both']);
        if (negate !== 'long') shortTermGains = -shortTermGains;
        if (negate !== 'short') longTermGains = -longTermGains;
      }
      const input = makeInput({
        filingStatus: pick(FILING_STATUSES),
        taxYear: pick(AVAILABLE_YEARS),
        wages: amount(400000),
        retirementIncome: amount(150000),
        interest: amount(60000),
        nonQualifiedDividends: amount(30000),
        shortTermGains,
        qualifiedDividends: amount(60000),
        longTermGains,
        deduction: random() < 0.2 ? amount(80000) : null,
      });
      const base = calculateTax(input);
      for (const scenario of marginalNextDollar(base)) {
        const field = PROBE_FIELD[scenario.key];
        const plusOne = calculateTax({ ...input, [field]: input[field] + 1 });
        const context = JSON.stringify({ input, key: scenario.key });
        expect(scenario.baseRate, context).toBeGreaterThanOrEqual(0);
        for (const surtax of scenario.surtaxes) expect(surtax.rate, context).toBeGreaterThan(0);
        expect(scenario.totalRate, context).toBe(round6(scenario.baseRate + scenario.surRate));
        expect(Math.abs(plusOne.totalTax - base.totalTax - scenario.totalRate), context).toBeLessThan(2e-6);
      }
    }
  });
});
