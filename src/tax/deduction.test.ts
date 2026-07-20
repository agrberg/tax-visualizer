import { describe, it, expect } from 'vitest';
import { applyDeduction } from './deduction';

describe('applyDeduction', () => {
  it('applies to ordinary income first when ordinary exceeds the deduction', () => {
    const d = applyDeduction(15000, 100000, 20000);
    expect(d.deductionOnOrdinary).toBe(15000);
    expect(d.leftoverDeduction).toBe(0);
    expect(d.ordinaryTaxable).toBe(85000);
    expect(d.preferentialTaxable).toBe(20000);
    expect(d.preferentialDeduction).toBe(0);
  });

  it('spills the remainder onto preferential income when ordinary is below the deduction', () => {
    const d = applyDeduction(32200, 31200, 100000); // 1000 spills
    expect(d.ordinaryTaxable).toBe(0);
    expect(d.leftoverDeduction).toBe(1000);
    expect(d.preferentialDeduction).toBe(1000);
    expect(d.preferentialTaxable).toBe(99000);
  });

  it('never shields more preferential income than exists', () => {
    const d = applyDeduction(32200, 5000, 10000); // 27200 leftover, only 10000 preferential
    expect(d.preferentialDeduction).toBe(10000);
    expect(d.preferentialTaxable).toBe(0);
  });

  it('handles zero preferential income', () => {
    const d = applyDeduction(16100, 8000, 0);
    expect(d.preferentialDeduction).toBe(0);
    expect(d.preferentialTaxable).toBe(0);
  });
});
