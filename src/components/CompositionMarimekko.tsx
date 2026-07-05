import { useState } from 'react'
import { blendBackground, compositionSegments, formatPercent } from '@/tax/format'
import type { TaxResult } from '@/tax/types'
import { CompositionTooltip, HoverTooltip } from './TowerParts'
import { useTooltip } from './use-tooltip'

interface Props {
  result: TaxResult
}

/**
 * Marimekko.
 *
 * Each source's segment WIDTH is its share of income. Its colored fill rises to a
 * HEIGHT equal to its share of tax ÷ its share of income, against a dashed
 * "proportional" line at 1×. A source that fills ABOVE the line takes a bigger
 * bite of your tax than of your income (e.g. capital gains); below the line, the
 * reverse. The filled area is proportional to the source's share of total tax.
 */
export function CompositionMarimekko({ result }: Props) {
  const tip = useTooltip()
  const [hovered, setHovered] = useState<string | null>(null)

  const totalIncome = result.totalIncome
  const totalTax = result.totalTax
  if (totalIncome <= 0 || totalTax <= 0) return null

  const placed = compositionSegments(result).map((s) => {
    const incomeShare = s.amount / totalIncome
    const taxShare = s.tax / totalTax
    return { ...s, incomeShare, taxShare, ratio: incomeShare > 0 ? taxShare / incomeShare : 0 }
  })
  // Height axis is the tax-to-income ratio on a linear 0→scaleMax scale, normalized
  // to the largest ratio so the tallest source fills the bar and the (usually small)
  // differences spread across the full height. 1× is the "proportional" line: tax
  // share == income share. Dashed gridlines at each 0.5× keep the scale readable.
  const maxRatio = Math.max(1, ...placed.map((p) => p.ratio))
  const scaleMax = maxRatio
  const gridSteps = Math.max(0, Math.ceil(scaleMax / 0.5) - 1)
  const gridlines = Array.from({ length: gridSteps }, (_, i) => (i + 1) * 0.5)
  const active = placed.find((s) => s.key === hovered)

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <div className="text-xs text-muted-foreground">Share of income vs. share of tax</div>
        <div className="text-[10px] text-muted-foreground">width = income · height = tax ÷ income</div>
      </div>

      <div
        className="relative flex h-28 w-full overflow-hidden rounded-md border bg-muted/30"
        onMouseMove={tip.onMove}
        onMouseLeave={() => {
          tip.onLeave()
          setHovered(null)
        }}
      >
        {/* ratio gridlines; 1× is the "proportional" line (tax share == income share) */}
        {gridlines.map((r) => {
          const parity = r === 1
          return (
            <div
              key={r}
              className={`pointer-events-none absolute inset-x-0 z-20 border-t border-dashed ${
                parity ? 'border-neutral-600/80' : 'border-neutral-400/40'
              }`}
              style={{ bottom: `${(r / scaleMax) * 100}%` }}
            >
              <span className="absolute -top-2 right-0.5 rounded bg-white/80 px-1 text-[9px] font-medium text-neutral-600">
                {parity ? '1× · proportional' : `${r}×`}
              </span>
            </div>
          )
        })}

        {placed.map((s) => {
          const fillPct = (s.ratio / scaleMax) * 100
          return (
            <div
              key={s.key}
              className={`relative h-full ${
                hovered && hovered !== s.key ? 'opacity-40' : 'opacity-100'
              } border-r border-white/60 transition-opacity last:border-r-0`}
              style={{
                width: `${s.incomeShare * 100}%`,
                ...blendBackground(s.colors, { alpha: 15, stripe: 6 }),
              }}
              onMouseEnter={() => setHovered(s.key)}
            >
              {/* fill height = tax share ÷ income share (× the proportional line) */}
              <div
                className="absolute inset-x-0 bottom-0 z-10"
                style={{
                  height: `${fillPct}%`,
                  ...blendBackground(s.colors, { stripe: 6 }),
                }}
              />
              {/* label: source and its share of income (the width) */}
              {s.incomeShare >= 0.12 && (
                <span className="pointer-events-none absolute inset-x-0 top-1 z-20 px-1 text-center text-[10px] font-medium leading-tight text-neutral-700">
                  {s.short}
                  <br />
                  {formatPercent(s.incomeShare, 0)} of income
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Above the line = a bigger share of your tax than of your income.
      </div>

      <HoverTooltip visible={tip.visible} pos={tip.pos}>
        {active && (
          <CompositionTooltip
            colors={active.colors}
            label={active.label}
            subtitle={
              <>
                {formatPercent(active.incomeShare, 1)} of income →{' '}
                {formatPercent(active.taxShare, 1)} of tax
              </>
            }
            amount={active.amount}
            tax={active.tax}
            effectiveRate={active.effectiveRate}
          />
        )}
      </HoverTooltip>
    </div>
  )
}
