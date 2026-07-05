import { useState } from 'react'
import { compositionSegments, formatCurrency, formatPercent } from '@/tax/format'
import type { TaxResult } from '@/tax/types'
import { CompositionRibbon } from './CompositionRibbon'
import { CompositionMarimekko } from './CompositionMarimekko'
import { Swatch } from './TowerParts'

interface Props {
  result: TaxResult
}

type CompositionView = 'bars' | 'marimekko' | 'both'

const COMPOSITION_VIEWS: { value: CompositionView; label: string }[] = [
  { value: 'bars', label: 'Paired bars' },
  { value: 'marimekko', label: 'Marimekko' },
  { value: 'both', label: 'Both' },
]

export function OverallBreakdown({ result }: Props) {
  const segments = compositionSegments(result)
  const total = result.totalIncome
  const takeHome = total - result.totalTax
  const hasTax = result.totalTax > 0
  const [view, setView] = useState<CompositionView>('bars')

  return (
    <div className="space-y-4">
      {/* headline stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat label="Total income" value={formatCurrency(total)} />
        <Stat label="Total tax" value={formatCurrency(result.totalTax)} />
        <Stat label="Take-home" value={formatCurrency(takeHome)} />
        <Stat
          label="Weighted effective rate"
          value={formatPercent(result.effectiveRate, 1)}
          emphasis
        />
      </div>

      {/* income & tax composition — switch between the two views */}
      {total > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {hasTax ? 'Income & tax composition' : 'Income composition'}
            </div>
            {hasTax && (
              <div className="inline-flex rounded-md border p-0.5 text-xs">
                {COMPOSITION_VIEWS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setView(o.value)}
                    className={`rounded px-2 py-1 transition-colors ${
                      view === o.value
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-5">
            {(!hasTax || view === 'bars' || view === 'both') && <CompositionRibbon result={result} />}
            {hasTax && (view === 'marimekko' || view === 'both') && (
              <CompositionMarimekko result={result} />
            )}
          </div>
        </div>
      )}

      {/* per-source table */}
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-1 font-medium">Source</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Amount</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Tax</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Take-home</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Eff. rate</th>
          </tr>
        </thead>
        <tbody>
          {segments.length === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-center text-muted-foreground">
                Enter income to see the breakdown.
              </td>
            </tr>
          )}
          {segments.map((s) => (
            <tr key={s.key} className="border-t">
              <td className="py-1.5">
                <span className="flex items-center gap-1.5">
                  <Swatch colors={s.colors} />
                  {s.short}
                </span>
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(s.amount)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(s.tax)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(s.amount - s.tax)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatPercent(s.effectiveRate, 1)}
              </td>
            </tr>
          ))}
        </tbody>
        {segments.length > 0 && (
          <tfoot>
            <tr className="border-t-2 font-medium">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(total)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(result.totalTax)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(takeHome)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatPercent(result.effectiveRate, 1)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="flex h-full flex-col rounded-lg border p-2 sm:p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-auto pt-1 ${
          emphasis ? 'text-lg font-bold sm:text-xl' : 'text-base font-semibold sm:text-lg'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
