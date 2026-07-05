import type { TaxResult } from '@/tax/types'
import { CAPITAL_GAINS_BREAKPOINTS, ORDINARY_BRACKETS } from '@/tax/brackets'

/** Fixed pixel height of a tower column; segment heights are a fraction of this. */
export const TOWER_HEIGHT = 440

/** Percentage (0–100) of the axis a dollar amount occupies. */
export function pct(amount: number, axisMax: number): number {
  if (axisMax <= 0) return 0
  return (amount / axisMax) * 100
}

/**
 * Shared vertical dollar axis for both towers so they line up. Covers the data,
 * and — when there is preferential income — the 0% cap-gains ceiling so the
 * "room remaining" is visible. Rounded up to a tidy ceiling.
 */
export function axisMaxFor(result: TaxResult): number {
  const { rate0Max } = CAPITAL_GAINS_BREAKPOINTS[result.filingStatus]
  const fed = result.federal
  const topOfGains = fed.capitalGainsBaseline + fed.preferentialTaxable
  let base = Math.max(topOfGains, fed.ordinaryTaxable)
  if (result.preferentialIncome > 0) base = Math.max(base, rate0Max)
  // The shielded-deduction band sits below everything, so include it in the axis.
  base = (base + fed.preferentialDeduction) * 1.08
  return Math.max(50000, Math.ceil(base / 10000) * 10000)
}

/**
 * Axis for the ordinary tower, which shows GROSS ordinary income: the standard
 * deduction (0% zone) plus taxable income in the brackets. Extends far enough to
 * show at least the first bracket above the deduction for context.
 */
export function ordinaryAxisMaxFor(result: TaxResult): number {
  const brackets = ORDINARY_BRACKETS[result.filingStatus]
  const deduction = result.federal.standardDeduction
  // Normally reserve headroom to show the first bracket above the deduction for
  // ladder context. But when income is fully shielded (no taxable ordinary income),
  // that bracket is never reached — reserving for it just leaves a large empty void,
  // so stop just above the deduction/income instead.
  const context =
    result.federal.ordinaryTaxable > 0
      ? deduction + brackets[1].min
      : Math.max(result.ordinaryIncome, deduction)
  const base = Math.max(result.ordinaryIncome, context)
  return Math.max(50000, Math.ceil((base * 1.08) / 5000) * 5000)
}
