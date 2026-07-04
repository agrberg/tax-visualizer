import type { TaxResult } from '@/tax/types'

const cents = (rate: number) => `${(rate * 100).toFixed(1)}¢`

interface Scenario {
  key: string
  label: string
  baseRate: number
  baseLabel: string
  surRate: number
  surLabel: string
}

/** What the next $1 of each income type costs in tax, with surtaxes broken out. */
export function MarginalNextDollar({ result }: { result: TaxResult }) {
  // Surtaxes on the next dollar apply once the relevant income is over its threshold.
  const niitMarginal = result.niit.incomeOverThreshold > 0 ? result.niit.rate : 0
  const medicareMarginal =
    result.additionalMedicare.incomeOverThreshold > 0 ? result.additionalMedicare.rate : 0

  const scenarios: Scenario[] = [
    {
      key: 'wages',
      label: 'Wages / earned income',
      baseRate: result.marginalOrdinaryRate,
      baseLabel: 'income tax',
      surRate: medicareMarginal,
      surLabel: "Add'l Medicare",
    },
    {
      key: 'ordinaryInvestment',
      label: 'Interest · non-qual. div. · ST gains',
      baseRate: result.marginalOrdinaryRate,
      baseLabel: 'income tax',
      surRate: niitMarginal,
      surLabel: 'NIIT',
    },
    {
      key: 'preferential',
      label: 'Qualified div. · LT gains',
      baseRate: result.marginalCapitalGainsRate,
      baseLabel: 'cap-gains tax',
      surRate: niitMarginal,
      surLabel: 'NIIT',
    },
  ]

  return (
    <div className="space-y-4">
      {scenarios.map((s) => {
        const total = s.baseRate + s.surRate
        const kept = Math.max(0, 1 - total)
        return (
          <div key={s.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{s.label}</span>
              <span className="text-xs text-muted-foreground">
                next $1 → <span className="font-semibold text-foreground">{cents(total)} tax</span>
              </span>
            </div>
            <div className="flex h-6 w-full overflow-hidden rounded-md border text-[10px] font-medium text-white">
              <div
                className="flex items-center justify-center bg-slate-500"
                style={{ width: `${s.baseRate * 100}%` }}
              >
                {s.baseRate >= 0.08 ? cents(s.baseRate) : ''}
              </div>
              {s.surRate > 0 && (
                <div
                  className="flex items-center justify-center bg-amber-500"
                  style={{ width: `${s.surRate * 100}%` }}
                  title={`${cents(s.surRate)} ${s.surLabel}`}
                />
              )}
              <div
                className="flex items-center justify-center bg-emerald-500"
                style={{ width: `${kept * 100}%` }}
              >
                {kept >= 0.1 ? `keep ${cents(kept)}` : ''}
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {cents(s.baseRate)} {s.baseLabel}
              {s.surRate > 0 && (
                <>
                  {' + '}
                  {cents(s.surRate)} {s.surLabel}
                </>
              )}
              {' · keep '}
              {cents(kept)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
