import { useState } from 'react'
import { SOURCE_META, formatCurrency, formatPercent } from '@/tax/format'
import type { TaxResult } from '@/tax/types'
import { HoverTooltip } from './TowerParts'
import { useTooltip } from './use-tooltip'

interface Props {
  result: TaxResult
}

export function OverallBreakdown({ result }: Props) {
  const sources = result.sourceBreakdown.filter((s) => s.amount > 0)
  const total = result.totalIncome

  return (
    <div className="space-y-4">
      {/* headline stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Total income" value={formatCurrency(total)} />
        <Stat label="Total tax" value={formatCurrency(result.totalTax)} />
        <Stat
          label="Weighted effective rate"
          value={formatPercent(result.effectiveRate, 1)}
          emphasis
        />
      </div>

      {/* composition bars */}
      {total > 0 && (
        <div className="space-y-5">
          <CompositionBar
            title="Income composition"
            shareNoun="income"
            total={total}
            items={sources.map((s) => ({
              key: s.source,
              label: SOURCE_META[s.source].label,
              swatch: SOURCE_META[s.source].swatch,
              fill: SOURCE_META[s.source].fill,
              value: s.amount,
              amount: s.amount,
              tax: s.tax,
              effectiveRate: s.effectiveRate,
            }))}
          />
          <CompositionBar
            title="Tax composition"
            shareNoun="tax"
            total={result.totalTax}
            items={result.sourceBreakdown
              .filter((s) => s.tax > 0)
              .map((s) => ({
                key: s.source,
                label: SOURCE_META[s.source].label,
                swatch: SOURCE_META[s.source].swatch,
                fill: SOURCE_META[s.source].fill,
                value: s.tax,
                amount: s.amount,
                tax: s.tax,
                effectiveRate: s.effectiveRate,
              }))}
          />
        </div>
      )}

      {/* per-source table */}
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-1 font-medium">Source</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Amount</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Tax</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Eff. rate</th>
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
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(s.amount)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(s.tax)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatPercent(s.effectiveRate, 1)}
              </td>
            </tr>
          ))}
        </tbody>
        {sources.length > 0 && (
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
                {formatPercent(result.effectiveRate, 1)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

interface BarItem {
  key: string
  label: string
  swatch: string
  fill: string
  /** Metric that drives this segment's width (income amount or tax). */
  value: number
  amount: number
  tax: number
  effectiveRate: number
}

/**
 * A stacked bar of colored segments. Each segment shows its share inside when
 * there is room; hovering (or tapping) a segment dims the rest and opens the same
 * rich floating box the income towers use — with the source's amount, tax, and
 * effective rate.
 */
function CompositionBar({
  title,
  shareNoun,
  items,
  total,
}: {
  title: string
  shareNoun: string
  items: BarItem[]
  total: number
}) {
  const tip = useTooltip()
  const [hovered, setHovered] = useState<string | null>(null)
  if (total <= 0) return null

  const placed = items.map((i) => ({ ...i, share: i.value / total }))
  const active = placed.find((p) => p.key === hovered)

  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{title}</div>
      <div
        className="flex h-8 w-full overflow-hidden rounded-md border text-white"
        onMouseMove={tip.onMove}
        onMouseLeave={() => {
          tip.onLeave()
          setHovered(null)
        }}
      >
        {placed.map((s) => (
          <div
            key={s.key}
            className={`flex items-center justify-center ${s.fill} ${
              hovered && hovered !== s.key ? 'opacity-40' : 'opacity-95'
            } transition-opacity`}
            style={{ width: `${s.share * 100}%` }}
            onMouseEnter={() => setHovered(s.key)}
          >
            {s.share >= 0.08 && (
              <span className="text-[10px] font-semibold">{formatPercent(s.share, 0)}</span>
            )}
          </div>
        ))}
      </div>

      <HoverTooltip visible={tip.visible} pos={tip.pos}>
        {active && (
          <div>
            <div className="mb-2 border-b pb-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <span className={`size-2.5 rounded-full ${active.swatch}`} aria-hidden />
                {active.label}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {formatPercent(active.share, 1)} of {shareNoun}
              </div>
            </div>
            <table className="w-full text-xs">
              <tbody>
                <tr>
                  <td className="py-0.5 text-muted-foreground">Amount</td>
                  <td className="py-0.5 text-right tabular-nums">{formatCurrency(active.amount)}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-muted-foreground">Tax</td>
                  <td className="py-0.5 text-right tabular-nums">{formatCurrency(active.tax)}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-muted-foreground">Effective rate</td>
                  <td className="py-0.5 text-right tabular-nums">
                    {formatPercent(active.effectiveRate, 1)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </HoverTooltip>
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
