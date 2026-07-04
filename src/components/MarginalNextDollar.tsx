import { marginalNextDollar } from '@/tax/calculate'
import type { MarginalScenario, TaxResult } from '@/tax/types'

const cents = (rate: number) => `${(rate * 100).toFixed(1)}¢`

const LABELS: Record<MarginalScenario['key'], { label: string; baseLabel: string; surLabel: string }> = {
  wages: { label: 'Wages / earned income', baseLabel: 'income tax', surLabel: "Add'l Medicare" },
  ordinaryInvestment: {
    label: 'Interest · non-qual. div. · ST gains',
    baseLabel: 'income tax',
    surLabel: 'NIIT',
  },
  preferential: { label: 'Qualified div. · LT gains', baseLabel: 'cap-gains tax', surLabel: 'NIIT' },
}

/** What the next $1 of each income type costs in tax, with surtaxes broken out. */
export function MarginalNextDollar({ result }: { result: TaxResult }) {
  const scenarios = marginalNextDollar(result)

  return (
    <div className="space-y-4">
      {scenarios.map((scenario) => {
        const s = { ...scenario, ...LABELS[scenario.key] }
        const total = s.totalRate
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
