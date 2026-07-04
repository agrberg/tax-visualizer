import { marginalNextDollar } from '@/tax/calculate'
import type { MarginalScenario, TaxResult } from '@/tax/types'

const cents = (rate: number) => `${(rate * 100).toFixed(1)}¢`

const LABELS: Record<MarginalScenario['key'], { label: string; baseLabel: string }> = {
  wages: { label: 'Wages / earned income', baseLabel: 'income tax' },
  ordinaryInvestment: { label: 'Interest · non-qual. div. · ST gains', baseLabel: 'income tax' },
  preferential: { label: 'Qualified div. · LT gains', baseLabel: 'cap-gains tax' },
}

/** What the next $1 of each income type costs in tax, with surtaxes broken out. */
export function MarginalNextDollar({ result }: { result: TaxResult }) {
  const scenarios = marginalNextDollar(result)

  return (
    <div className="space-y-4">
      {scenarios.map((s) => {
        const meta = LABELS[s.key]
        const kept = Math.max(0, 1 - s.totalRate)
        return (
          <div key={s.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{meta.label}</span>
              <span className="text-xs text-muted-foreground">
                next $1 →{' '}
                <span className="font-semibold text-foreground">{cents(s.totalRate)} tax</span>
              </span>
            </div>
            <div className="flex h-6 w-full overflow-hidden rounded-md border text-[10px] font-medium text-white">
              <div
                className="flex items-center justify-center bg-slate-500"
                style={{ width: `${s.baseRate * 100}%` }}
              >
                {s.baseRate >= 0.08 ? cents(s.baseRate) : ''}
              </div>
              {s.surtaxes.map((su) => (
                <div
                  key={su.label}
                  className={`flex items-center justify-center ${su.tone === 'bump' ? 'bg-violet-500' : 'bg-amber-500'}`}
                  style={{ width: `${su.rate * 100}%` }}
                  title={`${cents(su.rate)} ${su.label}`}
                >
                  {su.rate >= 0.08 ? cents(su.rate) : ''}
                </div>
              ))}
              <div
                className="flex items-center justify-center bg-emerald-500"
                style={{ width: `${kept * 100}%` }}
              >
                {kept >= 0.1 ? `keep ${cents(kept)}` : ''}
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {cents(s.baseRate)} {meta.baseLabel}
              {s.surtaxes.map((su) => (
                <span key={su.label} className={su.tone === 'bump' ? 'text-violet-600' : undefined}>
                  {' + '}
                  {cents(su.rate)} {su.label}
                </span>
              ))}
              {' · keep '}
              {cents(kept)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
