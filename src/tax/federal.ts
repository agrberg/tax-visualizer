import { bracketsToBands, type Band } from './engine'
import { federalSurchargeRules } from './surcharges'
import type { FilingStatus, TaxYearTables } from './types'
import type { Jurisdiction } from './jurisdiction'

/** The federal 0% / 15% / 20% capital-gains ladder for a filing status. */
function preferentialLadder(filingStatus: FilingStatus, tables: TaxYearTables): Band[] {
  const { rate0Max, rate15Max } = tables.capitalGains.breakpoints[filingStatus]
  const { rate0, rate15, rate20 } = tables.capitalGains.rates
  return [
    { rate: rate0, min: 0, max: rate0Max },
    { rate: rate15, min: rate0Max, max: rate15Max },
    { rate: rate20, min: rate15Max, max: Number.POSITIVE_INFINITY },
  ]
}

/** Assemble the federal jurisdiction (data) from the given tax year's tables. */
export function federalJurisdiction(filingStatus: FilingStatus, tables: TaxYearTables): Jurisdiction {
  return {
    key: 'federal',
    ordinaryBands: bracketsToBands(tables.ordinaryBrackets[filingStatus]),
    standardDeduction: tables.standardDeduction[filingStatus],
    preferentialLadder: preferentialLadder(filingStatus, tables),
    surcharges: federalSurchargeRules(filingStatus, tables),
  }
}
