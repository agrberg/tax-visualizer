import { CAPITAL_GAINS_BREAKPOINTS, ORDINARY_BRACKETS, STANDARD_DEDUCTION } from './brackets'
import { bracketsToBands, type Band } from './engine'
import { federalSurchargeRules } from './surcharges'
import type { FilingStatus } from './types'
import type { Jurisdiction } from './jurisdiction'

/** The federal 0% / 15% / 20% capital-gains ladder for a filing status. */
function preferentialLadder(filingStatus: FilingStatus): Band[] {
  const { rate0Max, rate15Max } = CAPITAL_GAINS_BREAKPOINTS[filingStatus]
  return [
    { rate: 0, min: 0, max: rate0Max },
    { rate: 0.15, min: rate0Max, max: rate15Max },
    { rate: 0.2, min: rate15Max, max: Number.POSITIVE_INFINITY },
  ]
}

/** Assemble the federal jurisdiction (data) from the 2026 tables in brackets.ts. */
export function federalJurisdiction(filingStatus: FilingStatus): Jurisdiction {
  return {
    key: 'federal',
    ordinaryBands: bracketsToBands(ORDINARY_BRACKETS[filingStatus]),
    standardDeduction: STANDARD_DEDUCTION[filingStatus],
    preferentialLadder: preferentialLadder(filingStatus),
    surcharges: federalSurchargeRules(filingStatus),
  }
}
