import type { OrdinaryBracket, TaxResult } from '@/tax/types'
import { ORDINARY_BRACKETS } from '@/tax/brackets'

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
 * Extra vertical headroom above the filled income. Both towers apply the SAME
 * factor to their own fill, so each is scaled proportionally to itself yet the
 * two fills land at the same height — reading as level with each other — while
 * the next bracket/rate boundary is pinned to the top edge just above.
 */
export const AXIS_HEADROOM = 1.05

/**
 * Axis for the capital-gains tower. Scaled to the top of the visible stack
 * (shielded-deduction spill + ordinary baseline + gains) plus a small headroom,
 * so the gains fill the tower. The next rate boundary above the gains is pinned
 * to the top edge by the tower — not drawn to scale — so a distant boundary
 * never creates a large proportional void.
 */
export function axisMaxFor(result: TaxResult): number {
  const fed = result.federal
  const fillTop = fed.preferentialDeduction + fed.capitalGainsBaseline + fed.preferentialTaxable
  return fillTop * AXIS_HEADROOM
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
 * deduction (0% zone) plus taxable income in the brackets. Scaled to the top of
 * the fill plus the shared headroom so it lines up with the capital-gains tower.
 * The next bracket boundary (if any) is pinned to the top edge — not drawn to
 * scale — so a distant next bracket never creates a huge proportional void.
 */
export function ordinaryAxisMaxFor(result: TaxResult): number {
  const deduction = result.federal.standardDeduction
  // When income is fully shielded, keep the deduction visible; otherwise track income.
  const fillTop = Math.max(result.ordinaryIncome, deduction)
  return fillTop * AXIS_HEADROOM
}
