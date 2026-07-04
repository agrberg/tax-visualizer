import { federalSurchargeRules } from './surcharges'
import type { MarginalComponent, MarginalScenario, SurchargeResult, TaxResult } from './types'

/**
 * Marginal cost of the next $1 by income type. The surtax portion is derived from
 * the same surcharge rules that assessed the tax, so their next-dollar behavior
 * (e.g. NIIT's MAGI-cap nuance) can't drift from their assessment.
 */
export function marginalNextDollar(result: TaxResult): MarginalScenario[] {
  const fed = result.federal
  const rules = federalSurchargeRules(result.filingStatus)
  const assessed: Record<string, SurchargeResult> = Object.fromEntries(
    fed.surcharges.map((s) => [s.key, s]),
  )

  // The capital-gains bump rides on ordinary dollars only (it lifts the gains stack).
  const bump = fed.marginalGainsBump
  const pct = (r: number) => `${Math.round(r * 100)}%`
  const bumpComponent: MarginalComponent | null = bump
    ? { label: `pushes a gain ${pct(bump.fromRate)}→${pct(bump.toRate)}`, rate: bump.rate, tone: 'bump' }
    : null

  const build = (
    key: MarginalScenario['key'],
    baseRate: number,
    extra: (MarginalComponent | null)[] = [],
  ): MarginalScenario => {
    const fromRules = rules.map<MarginalComponent>((r) => ({
      label: r.shortLabel,
      rate: r.marginalRate(key, assessed[r.key]),
      tone: 'surtax',
    }))
    const surtaxes = [...fromRules, ...extra].filter(
      (s): s is MarginalComponent => s !== null && s.rate > 0,
    )
    const surRate = surtaxes.reduce((sum, s) => sum + s.rate, 0)
    return { key, baseRate, surtaxes, surRate, totalRate: baseRate + surRate }
  }

  return [
    build('wages', fed.marginalOrdinaryRate, [bumpComponent]),
    build('ordinaryInvestment', fed.marginalOrdinaryRate, [bumpComponent]),
    build('preferential', fed.marginalCapitalGainsRate),
  ]
}
