import { useEffect, useRef, useState } from 'react'
import { blendBackground, compositionSegments, formatCurrency, formatPercent } from '@/tax/format'
import type { TaxResult } from '@/tax/types'
import { CompositionTooltip, HoverTooltip } from './TowerParts'
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

  // Bar width in px — needed to tell when a segment's centered % label would fall
  // under the "Income"/"Tax" axis label (which is pinned to the bar's left edge).
  const barRef = useRef<HTMLDivElement>(null)
  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBarWidth(el.offsetWidth))
    ro.observe(el)
    setBarWidth(el.offsetWidth)
    return () => ro.disconnect()
  }, [])

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

  // The left px reserved by each axis label (left-2 inset + ~text width + gap), at
  // the fixed 11px semibold font. A segment hides its centered % when that label
  // would overlap the axis label; the exact share stays on hover and in the table.
  const INCOME_LABEL_PX = 60
  const TAX_LABEL_PX = 36
  const showPct = (leftFrac: number, share: number, labelPx: number) => {
    if (share < 0.1) return false
    if (!barWidth) return true
    const centerPx = (leftFrac + share / 2) * barWidth
    return centerPx - 14 >= labelPx
  }

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
          ref={barRef}
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
              {showPct(s.inLeft, s.incomeShare, INCOME_LABEL_PX) && (
                <span className="text-[10px] font-semibold">{formatPercent(s.incomeShare, 0)}</span>
              )}
            </div>
          ))}
        </div>

        {hasTax && (
          <>
            {/* ribbons connecting each source's income share to its tax share.
                Rendered as clip-path trapezoids so the fill matches the bars — solid
                for a single-color source, striped for a merged two-color bucket. */}
            <div className="relative block h-10 w-full" aria-hidden>
              {placed.map((s) => {
                const inL = s.inLeft * 100
                const inR = (s.inLeft + s.incomeShare) * 100
                const taxL = s.taxLeft * 100
                const taxR = (s.taxLeft + s.taxShare) * 100
                return (
                  <div
                    key={`ribbon-${s.key}`}
                    className="absolute inset-0"
                    style={{
                      clipPath: `polygon(${inL}% 0, ${inR}% 0, ${taxR}% 100%, ${taxL}% 100%)`,
                      opacity: hovered && hovered !== s.key ? 0.12 : 0.35,
                      ...blendBackground(s.colors),
                    }}
                    onMouseEnter={() => setHovered(s.key)}
                  />
                )
              })}
            </div>

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
                  {showPct(s.taxLeft, s.taxShare, TAX_LABEL_PX) && (
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
          <CompositionTooltip
            colors={active.colors}
            label={active.label}
            subtitle={
              hasTax
                ? `${formatPercent(active.incomeShare, 1)} of income → ${formatPercent(active.taxShare, 1)} of tax`
                : `${formatPercent(active.incomeShare, 1)} of income`
            }
            amount={active.amount}
            tax={active.tax}
            effectiveRate={active.effectiveRate}
            ratio={hasTax && active.incomeShare > 0 ? active.taxShare / active.incomeShare : undefined}
          />
        )}
      </HoverTooltip>
    </div>
  )
}
