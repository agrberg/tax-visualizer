import { useState } from 'react'
import { blendBackground, compositionSegments, formatCurrency, formatPercent } from '@/tax/format'
import type { TaxResult } from '@/tax/types'
import { HoverTooltip, Swatch } from './TowerParts'
import { useTooltip } from './use-tooltip'

interface Props {
  result: TaxResult
}

/**
 * Paired bars + ribbons.
 *
 * Income composition (top) and tax composition (bottom) as two aligned bars,
 * with a trapezoid ribbon connecting each source between them. The ribbon's
 * slope shows a source punching above or below its weight: wages narrow from
 * income → tax, capital gains widen. When there is no tax, only the income
 * bar is shown — a tax composition (and its ribbon) would be meaningless.
 */
export function CompositionRibbon({ result }: Props) {
  const tip = useTooltip()
  const [hovered, setHovered] = useState<string | null>(null)

  const totalIncome = result.totalIncome
  const totalTax = result.totalTax
  if (totalIncome <= 0) return null
  const hasTax = totalTax > 0

  let inAcc = 0
  let taxAcc = 0
  const placed = compositionSegments(result).map((s) => {
    const incomeShare = s.amount / totalIncome
    const taxShare = hasTax ? s.tax / totalTax : 0
    const seg = { ...s, incomeShare, taxShare, inLeft: inAcc, taxLeft: taxAcc }
    inAcc += incomeShare
    taxAcc += taxShare
    return seg
  })
  const active = placed.find((p) => p.key === hovered)

  return (
    <div>
      <div
        className="relative"
        onMouseMove={tip.onMove}
        onMouseLeave={() => {
          tip.onLeave()
          setHovered(null)
        }}
      >
        {/* income bar */}
        <div
          className={`relative flex h-7 w-full overflow-hidden text-white ${
            hasTax ? 'rounded-t-md' : 'rounded-md'
          }`}
        >
          <span className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 text-[11px] font-semibold text-white drop-shadow-sm">
            Income
          </span>
          {placed.map((s) => (
            <div
              key={`in-${s.key}`}
              className={`flex items-center justify-center ${
                hovered && hovered !== s.key ? 'opacity-40' : 'opacity-95'
              } transition-opacity`}
              style={{ width: `${s.incomeShare * 100}%`, ...blendBackground(s.colors) }}
              onMouseEnter={() => setHovered(s.key)}
            >
              {s.incomeShare >= 0.1 && (
                <span className="text-[10px] font-semibold">{formatPercent(s.incomeShare, 0)}</span>
              )}
            </div>
          ))}
        </div>

        {hasTax && (
          <>
            {/* ribbons connecting each source's income share to its tax share */}
            <svg
              className="block h-10 w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              {placed.map((s) => {
                const inL = s.inLeft * 100
                const inR = (s.inLeft + s.incomeShare) * 100
                const taxL = s.taxLeft * 100
                const taxR = (s.taxLeft + s.taxShare) * 100
                return (
                  <path
                    key={`ribbon-${s.key}`}
                    fill={s.colors[0]}
                    fillOpacity={hovered && hovered !== s.key ? 0.12 : 0.35}
                    d={`M ${inL},0 L ${inR},0 L ${taxR},100 L ${taxL},100 Z`}
                    onMouseEnter={() => setHovered(s.key)}
                  />
                )
              })}
            </svg>

            {/* tax bar */}
            <div className="relative flex h-7 w-full overflow-hidden rounded-b-md text-white">
              <span className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 text-[11px] font-semibold text-white drop-shadow-sm">
                Tax
              </span>
              {placed.map((s) => (
                <div
                  key={`tax-${s.key}`}
                  className={`flex items-center justify-center ${
                    hovered && hovered !== s.key ? 'opacity-40' : 'opacity-95'
                  } transition-opacity`}
                  style={{ width: `${s.taxShare * 100}%`, ...blendBackground(s.colors) }}
                  onMouseEnter={() => setHovered(s.key)}
                >
                  {s.taxShare >= 0.1 && (
                    <span className="text-[10px] font-semibold">{formatPercent(s.taxShare, 0)}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Income {formatCurrency(totalIncome)}</span>
          <span>{hasTax ? `Tax ${formatCurrency(totalTax)}` : 'No tax'}</span>
        </div>
      </div>

      <HoverTooltip visible={tip.visible} pos={tip.pos}>
        {active && (
          <div>
            <div className="mb-2 border-b pb-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Swatch colors={active.colors} />
                {active.label}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {hasTax
                  ? `${formatPercent(active.incomeShare, 1)} of income → ${formatPercent(active.taxShare, 1)} of tax`
                  : `${formatPercent(active.incomeShare, 1)} of income`}
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
                  <td className="py-0.5 text-muted-foreground">Take-home</td>
                  <td className="py-0.5 text-right tabular-nums">
                    {formatCurrency(active.amount - active.tax)}
                  </td>
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
