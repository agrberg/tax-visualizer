import type { OrdinaryBracket, TaxResult } from '@/tax/types'
import { CAPITAL_GAINS_BREAKPOINTS, ORDINARY_BRACKETS } from '@/tax/brackets'

/** Fixed pixel height of a tower column; segment heights are a fraction of this. */
export const TOWER_HEIGHT = 440

/** Percentage (0–100) of the axis a dollar amount occupies. */
export function pct(amount: number, axisMax: number): number {
  if (axisMax <= 0) return 0
  return (amount / axisMax) * 100
}

/** Whether a band is tall enough to carry its own in-bar label (else the legend does). */
export function tall(amount: number, axisMax: number): boolean {
  return pct(amount, axisMax) >= 7
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

/** Index of the ordinary bracket holding the marginal (last taxable) dollar. */
export function marginalOrdinaryIdx(result: TaxResult): number {
  const brackets = ORDINARY_BRACKETS[result.filingStatus]
  return brackets.findIndex((b) => result.federal.ordinaryTaxable < b.max)
}

/**
 * The bracket immediately above the one the income's marginal dollar lands in —
 * i.e. the "next" rate the taxpayer would hit. Returns null when the income is
 * already in the top bracket. When income is fully shielded (no taxable ordinary
 * income) the marginal bracket is the lowest (10%), so this returns the 12% bracket.
 */
export function nextOrdinaryBracket(result: TaxResult): OrdinaryBracket | null {
  const brackets = ORDINARY_BRACKETS[result.filingStatus]
  return brackets[marginalOrdinaryIdx(result) + 1] ?? null
}

/**
 * Axis for the ordinary tower, which shows GROSS ordinary income: the standard
 * deduction (0% zone) plus taxable income in the brackets. Keeps the axis close to
 * the income with a small fixed gap above it. The next bracket boundary (if any) is
 * pinned to the top edge by the tower — not drawn to scale — so a distant next
 * bracket never creates a huge proportional void.
 */
export function ordinaryAxisMaxFor(result: TaxResult): number {
  const deduction = result.federal.standardDeduction
  // When income is fully shielded, keep the deduction visible; otherwise track income.
  const fillTop = Math.max(result.ordinaryIncome, deduction)
  return Math.max(50000, Math.ceil((fillTop * 1.15) / 5000) * 5000)
}
