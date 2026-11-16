import { calculateTax } from './calculate';
import { federalSurchargeRules } from './surcharges';
import { taxTablesFor } from './years';
import type { IncomeSource, MarginalComponent, MarginalScenario, SurchargeResult, TaxResult } from './types';

const PROBE_FIELD: Record<MarginalScenario['key'], IncomeSource> = {
  wages: 'wages',
  ordinaryInvestment: 'interest',
  retirement: 'retirementIncome',
  preferential: 'qualifiedDividends',
  shortTermGain: 'shortTermGains',
  longTermGain: 'longTermGains',
};
// Cards whose extra gains tax is a bump on top of the ordinary rate; the gain cards fold it into base tax.
const BUMP_ELIGIBLE_KEYS: ReadonlySet<MarginalScenario['key']> = new Set(['wages', 'ordinaryInvestment', 'retirement']);
const RATE_EPSILON = 1e-9;
const roundRate = (rate: number): number => Math.round(rate * 1e6) / 1e6;

/**
 * Marginal cost of the next $1 by income type, measured by recalculating the return with one more
 * dollar of that type, so netting and loss absorption are honored. The two gain cards appear only
 * when a capital loss makes them differ from the interest and qualified-dividend cards.
 */
export function marginalNextDollar(result: TaxResult): MarginalScenario[] {
  const fed = result.federal;
  const rules = federalSurchargeRules(result.input.filingStatus, taxTablesFor(result.input.taxYear));
  const assessed: Record<string, SurchargeResult> = Object.fromEntries(fed.surcharges.map((s) => [s.key, s]));
  const bump = fed.marginalGainsBump;
  const pct = (r: number) => `${Math.round(r * 100)}%`;

  const nextDollar = (key: MarginalScenario['key']): MarginalScenario => {
    const field = PROBE_FIELD[key];
    const plus = calculateTax({ ...result.input, [field]: result.input[field] + 1 }).federal;
    const plusAssessed: Record<string, SurchargeResult> = Object.fromEntries(plus.surcharges.map((s) => [s.key, s]));
    const ordinaryDelta = roundRate(plus.ordinaryTax - fed.ordinaryTax);
    const gainsDelta = roundRate(plus.capitalGainsTax - fed.capitalGainsTax);
    // A short-term dollar can shrink a loss and so change what a long-term dollar owes; that is base tax, not a bump.
    const gainsAreBaseTax = !BUMP_ELIGIBLE_KEYS.has(key);
    const baseRate = gainsAreBaseTax ? roundRate(ordinaryDelta + gainsDelta) : ordinaryDelta;

    const surtaxes: MarginalComponent[] = [];
    rules.forEach((rule) => {
      const rate = roundRate(plusAssessed[rule.key].amount - assessed[rule.key].amount);
      if (rate > 0) surtaxes.push({ label: rule.shortLabel, rate, tone: 'surtax' });
    });
    // An ordinary dollar can lift the gains stack into a higher preferential bracket.
    if (!gainsAreBaseTax && gainsDelta > 0) {
      const label = bump ? `pushes a gain ${pct(bump.fromRate)}→${pct(bump.toRate)}` : 'raises capital-gains tax';
      surtaxes.push({ label, rate: gainsDelta, tone: 'bump' });
    }
    const surRate = roundRate(surtaxes.reduce((sum, s) => sum + s.rate, 0));
    return { key, baseRate, surtaxes, surRate, totalRate: roundRate(baseRate + surRate) };
  };

  const base = (['wages', 'ordinaryInvestment', 'retirement', 'preferential'] as const).map(nextDollar);
  const [, ordinaryInvestment, , preferential] = base;
  const shortTermGain = nextDollar('shortTermGain');
  const longTermGain = nextDollar('longTermGain');
  return [
    ...base,
    ...(Math.abs(shortTermGain.totalRate - ordinaryInvestment.totalRate) > RATE_EPSILON ? [shortTermGain] : []),
    ...(Math.abs(longTermGain.totalRate - preferential.totalRate) > RATE_EPSILON ? [longTermGain] : []),
  ];
}
