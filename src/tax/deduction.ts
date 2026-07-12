/** How a single deduction splits across the ordinary and preferential pools. */
export interface DeductionResult {
  deductionOnOrdinary: number
  leftoverDeduction: number
  ordinaryTaxable: number
  preferentialTaxable: number
  /** Leftover deduction that actually lands on preferential income. */
  preferentialDeduction: number
}

/**
 * Apply a deduction to ordinary income first; any remainder shields preferential
 * income. Qualified dividends and LTCG are one pool taxed identically, so the
 * remainder shields them proportionally rather than in an arbitrary order.
 */
export function applyDeduction(
  deduction: number,
  ordinaryIncome: number,
  preferentialIncome: number,
): DeductionResult {
  const deductionOnOrdinary = Math.min(deduction, ordinaryIncome)
  const leftoverDeduction = deduction - deductionOnOrdinary
  const ordinaryTaxable = ordinaryIncome - deductionOnOrdinary
  const preferentialTaxable = Math.max(0, preferentialIncome - leftoverDeduction)
  const preferentialDeduction = Math.min(leftoverDeduction, preferentialIncome)
  return {
    deductionOnOrdinary,
    leftoverDeduction,
    ordinaryTaxable,
    preferentialTaxable,
    preferentialDeduction,
  }
}
