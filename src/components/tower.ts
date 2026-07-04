import type { TaxResult } from '@/tax/types'
import { CAPITAL_GAINS_BREAKPOINTS } from '@/tax/brackets'

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
  const topOfGains = result.capitalGainsBaseline + result.preferentialTaxable
  let base = Math.max(topOfGains, result.ordinaryTaxable)
  if (result.preferentialIncome > 0) base = Math.max(base, rate0Max)
  base *= 1.08
  return Math.max(50000, Math.ceil(base / 10000) * 10000)
}
