import {
  ALL_SOURCES,
  INVESTMENT_SOURCES,
  ORDINARY_SOURCES,
  PREFERENTIAL_SOURCES,
  type IncomeLayer,
  type IncomeSource,
  type SourceBreakdown,
  type SurchargeResult,
} from './types';
import type { SurchargeRule } from './surcharges';
import { taxOverRange, type Band } from './engine';

/** Ordinary sources as taxable slices (deduction eats from the bottom, wages first). */
export function ordinaryLayers(
  amounts: Record<IncomeSource, number>,
  deductionOnOrdinary: number,
  bands: Band[],
): IncomeLayer[] {
  const layers: IncomeLayer[] = [];
  let deductionLeft = deductionOnOrdinary;
  let base = 0;
  for (const source of ORDINARY_SOURCES) {
    const amount = amounts[source];
    const absorbed = Math.min(deductionLeft, amount);
    deductionLeft -= absorbed;
    const taxableAmount = amount - absorbed;
    layers.push({ source, taxableAmount, base, tax: taxOverRange(base, taxableAmount, bands) });
    base += taxableAmount;
  }
  return layers;
}

/** Preferential sources stacked on the ordinary baseline, shielded proportionally. */
export function preferentialLayers(
  amounts: Record<IncomeSource, number>,
  shieldFraction: number,
  baseline: number,
  bands: Band[],
): IncomeLayer[] {
  const layers: IncomeLayer[] = [];
  let base = baseline;
  for (const source of PREFERENTIAL_SOURCES) {
    const amount = amounts[source];
    const taxableAmount = amount * (1 - shieldFraction);
    layers.push({ source, taxableAmount, base, tax: taxOverRange(base, taxableAmount, bands) });
    base += taxableAmount;
  }
  return layers;
}

interface BreakdownArgs {
  amounts: Record<IncomeSource, number>;
  ordinaryLayers: IncomeLayer[];
  preferentialLayers: IncomeLayer[];
  surcharges: { rule: SurchargeRule; result: SurchargeResult }[];
  netInvestmentIncome: number;
}

/** Combine per-layer income tax with the surcharges to get per-source totals. */
export function buildBreakdown(args: BreakdownArgs): SourceBreakdown[] {
  const breakdown: SourceBreakdown[] = [];
  const tax: Partial<Record<IncomeSource, number>> = {};

  for (const layer of [...args.ordinaryLayers, ...args.preferentialLayers]) {
    tax[layer.source] = layer.tax;
  }

  // Attach each surcharge's dollars to sources per its declared attribution.
  for (const { rule, result } of args.surcharges) {
    if (result.amount <= 0) continue;
    if (rule.attribution.kind === 'wages') {
      tax.wages = (tax.wages ?? 0) + result.amount;
    } else if (args.netInvestmentIncome > 0) {
      for (const source of INVESTMENT_SOURCES) {
        const share = args.amounts[source] / args.netInvestmentIncome;
        tax[source] = (tax[source] ?? 0) + result.amount * share;
      }
    }
  }

  for (const source of ALL_SOURCES) {
    const amount = args.amounts[source];
    const t = tax[source] ?? 0;
    breakdown.push({ source, amount, tax: t, effectiveRate: amount > 0 ? t / amount : 0 });
  }
  return breakdown;
}
