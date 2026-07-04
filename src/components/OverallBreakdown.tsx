import { SOURCE_META, formatCurrency, formatPercent } from '@/tax/format'
import type { TaxResult } from '@/tax/types'

interface Props {
  result: TaxResult
}

export function OverallBreakdown({ result }: Props) {
  const sources = result.sourceBreakdown.filter((s) => s.amount > 0)
  const total = result.totalIncome

  return (
    <div className="space-y-4">
      {/* headline stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total income" value={formatCurrency(total)} />
        <Stat label="Total tax" value={formatCurrency(result.totalTax)} />
        <Stat
          label="Weighted effective rate"
          value={formatPercent(result.effectiveRate, 1)}
          emphasis
        />
      </div>

      {/* composition bar */}
      {total > 0 && (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Income composition</div>
          <div className="flex h-5 w-full overflow-hidden rounded-full border">
            {sources.map((s) => (
              <div
                key={s.source}
                className={SOURCE_META[s.source].fill}
                style={{ width: `${(s.amount / total) * 100}%` }}
                title={`${SOURCE_META[s.source].label}: ${formatCurrency(s.amount)}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* per-source table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-1 font-medium">Source</th>
            <th className="pb-1 text-right font-medium">Amount</th>
            <th className="pb-1 text-right font-medium">Tax</th>
            <th className="pb-1 text-right font-medium">Eff. rate</th>
          </tr>
        </thead>
        <tbody>
          {sources.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-center text-muted-foreground">
                Enter income to see the breakdown.
              </td>
            </tr>
          )}
          {sources.map((s) => (
            <tr key={s.source} className="border-t">
              <td className="py-1.5">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`size-2.5 rounded-full ${SOURCE_META[s.source].swatch}`}
                    aria-hidden
                  />
                  {SOURCE_META[s.source].short}
                </span>
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(s.amount)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(s.tax)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatPercent(s.effectiveRate, 1)}</td>
            </tr>
          ))}
        </tbody>
        {sources.length > 0 && (
          <tfoot>
            <tr className="border-t-2 font-medium">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(total)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(result.totalTax)}</td>
              <td className="py-1.5 text-right tabular-nums">
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
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={emphasis ? 'text-xl font-bold' : 'text-lg font-semibold'}>{value}</div>
    </div>
  )
}
