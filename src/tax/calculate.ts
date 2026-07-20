import type { TaxInput, TaxResult } from './types';
import { classifyIncome } from './income';
import { federalJurisdiction } from './federal';
import { computeJurisdiction } from './jurisdiction';
import { buildBreakdown } from './attribution';
import { taxTablesFor } from './years';

export function calculateTax(inputRaw: TaxInput): TaxResult {
  const income = classifyIncome(inputRaw);
  const tables = taxTablesFor(inputRaw.taxYear);
  // Pass the deduction straight through (null = standard); federalJurisdiction's `?? ` resolves
  // the effective amount against the tables, so the fallback lives in one place.
  const jurisdiction = federalJurisdiction(inputRaw.filingStatus, tables, inputRaw.deduction);
  const fed = computeJurisdiction(jurisdiction, income);

  const surcharges = jurisdiction.surcharges.map((rule, i) => ({ rule, result: fed.surcharges[i] }));

  const sourceBreakdown = buildBreakdown({
    amounts: income.amounts,
    ordinaryLayers: fed.layers.ordinary,
    preferentialLayers: fed.layers.preferential,
    surcharges,
    netInvestmentIncome: income.netInvestmentIncome,
  });

  // The net short-/long-term figures as entered (finite-coerced), for the netting summary.
  const netShortTerm = Number.isFinite(inputRaw.shortTermGains) ? inputRaw.shortTermGains : 0;
  const netLongTerm = Number.isFinite(inputRaw.longTermGains) ? inputRaw.longTermGains : 0;

  return {
    filingStatus: inputRaw.filingStatus,
    taxYear: tables.year,
    deductionIsCustom: inputRaw.deduction !== null,
    totalIncome: income.totalIncome,
    ordinaryIncome: income.ordinaryIncome,
    preferentialIncome: income.preferentialIncome,
    capitalGains: {
      netShortTerm,
      netLongTerm,
      taxableShortTerm: income.amounts.shortTermGains,
      taxableLongTerm: income.amounts.longTermGains,
      lossDeduction: fed.capitalLoss.deduction,
      carryover: fed.capitalLoss.carryover,
    },
    federal: fed,
    sourceBreakdown,
    totalTax: fed.tax,
    effectiveRate: income.totalIncome > 0 ? fed.tax / income.totalIncome : 0,
  };
}

export { marginalNextDollar } from './marginal';
