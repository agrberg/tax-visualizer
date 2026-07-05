import { useState } from 'react'
import { ORDINARY_BRACKETS } from '@/tax/brackets'
import { SOURCE_META, formatCurrency, formatPercent, wagesBracketFill } from '@/tax/format'
import { ORDINARY_SOURCES, type IncomeSource, type TaxResult } from '@/tax/types'
import { TOWER_HEIGHT, ordinaryAxisMaxFor, pct } from './tower'
import { BracketBreakdown, HoverTooltip, HoveredSlice } from './TowerParts'
import { useTooltip } from './use-tooltip'

interface Props {
  result: TaxResult
}

/** A colored slice of the gross-income column. */
function Slice({
  from,
  to,
  axisMax,
  className,
  dim,
  onEnter,
}: {
  from: number
  to: number
  axisMax: number
  className: string
  dim: boolean
  onEnter: () => void
}) {
  return (
    <div
      className={`absolute inset-x-0 ${className} ${dim ? 'opacity-40' : 'opacity-95'} transition-opacity`}
      style={{ bottom: `${pct(from, axisMax)}%`, height: `${pct(to - from, axisMax)}%` }}
      onMouseEnter={onEnter}
    />
  )
}

export function OrdinaryTower({ result }: Props) {
  const fed = result.federal
  const brackets = ORDINARY_BRACKETS[result.filingStatus]
  const deduction = fed.standardDeduction
  const axisMax = ordinaryAxisMaxFor(result)
  const tip = useTooltip()
  const [hovered, setHovered] = useState<IncomeSource | null>(null)

  // Gross ordinary income, stacked by source (wages first). The deduction shields the bottom.
  let base = 0
  const grossLayers = ORDINARY_SOURCES.map((source) => {
    const amount = result.sourceBreakdown.find((b) => b.source === source)?.amount ?? 0
    const layer = { source, amount, base }
    base += amount
    return layer
  }).filter((l) => l.amount > 0)
  const grossOrdinary = base

  const hoveredLayer = grossLayers.find((l) => l.source === hovered)
  const hoveredTax = result.sourceBreakdown.find((b) => b.source === hovered)?.tax ?? 0

  // Split the standard deduction: used on ordinary income, spilled onto gains, truly unused.
  const usedOnOrdinary = Math.min(deduction, grossOrdinary)
  const spilledToGains = fed.preferentialDeduction
  const unusedDeduction = Math.max(0, deduction - usedOnOrdinary - spilledToGains)
  // Only label a band in-bar when it's tall enough; otherwise the legend carries it.
  const tall = (amount: number) => pct(amount, axisMax) >= 7

  return (
    <div className="flex w-full max-w-xs flex-col items-center sm:max-w-none sm:flex-1">
      <div className="mb-5 text-center">
        <div className="text-sm font-semibold">Ordinary income</div>
        <div className="text-xs text-muted-foreground">
          Marginal rate {formatPercent(fed.marginalOrdinaryRate, 0)} · tax{' '}
          {formatCurrency(fed.ordinaryTax)}
        </div>
      </div>

      <div
        className="relative w-full max-w-xs rounded-md border bg-muted/40 sm:max-w-[280px]"
        style={{ height: TOWER_HEIGHT }}
        onMouseMove={tip.onMove}
        onMouseLeave={() => {
          tip.onLeave()
          setHovered(null)
        }}
      >
        {/* source slices, stacked bottom → top (gross). Wages is split by bracket into greens. */}
        {grossLayers.map((layer) => {
          const dim = hovered !== null && hovered !== layer.source
          const top = layer.base + layer.amount
          if (layer.source === 'wages') {
            const slices: { from: number; to: number; color: string }[] = []
            const shieldTo = Math.min(top, deduction)
            if (shieldTo > layer.base) slices.push({ from: layer.base, to: shieldTo, color: 'bg-green-200' })
            for (const b of brackets) {
              const lo = Math.max(deduction + b.min, layer.base, deduction)
              const hi = Math.min(deduction + b.max, top)
              if (hi > lo) slices.push({ from: lo, to: hi, color: wagesBracketFill(b.rate) })
            }
            return slices.map((s) => (
              <Slice
                key={`wages-${s.from}`}
                from={s.from}
                to={s.to}
                axisMax={axisMax}
                className={s.color}
                dim={dim}
                onEnter={() => setHovered('wages')}
              />
            ))
          }
          return (
            <Slice
              key={layer.source}
              from={layer.base}
              to={top}
              axisMax={axisMax}
              className={SOURCE_META[layer.source].fill}
              dim={dim}
              onEnter={() => setHovered(layer.source)}
            />
          )
        })}

        {/* standard-deduction zone: the part shielding ordinary income, the part that
            spilled onto gains, and any truly unused remainder — so nothing reads as
            "leftover" when it has actually been applied to the capital-gains side. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-center border-t border-dashed border-neutral-500/60 pb-1"
          style={{
            height: `${pct(Math.min(usedOnOrdinary, axisMax), axisMax)}%`,
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(82,82,91,0.22) 5px, rgba(82,82,91,0.22) 10px)',
          }}
        >
          {tall(usedOnOrdinary) && (
            <span className="rounded bg-white/85 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-neutral-700 shadow-sm">
              Std. deduction · 0%
              <br />
              {formatCurrency(usedOnOrdinary)}
            </span>
          )}
        </div>
        {spilledToGains > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 flex items-center justify-center border-t border-dashed border-violet-500/50"
            style={{
              bottom: `${pct(usedOnOrdinary, axisMax)}%`,
              height: `${pct(spilledToGains, axisMax)}%`,
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(139,92,246,0.20) 5px, rgba(139,92,246,0.20) 10px)',
            }}
          >
            {tall(spilledToGains) && (
              <span className="rounded bg-white/85 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-violet-700 shadow-sm">
                → shields gains
                <br />
                {formatCurrency(spilledToGains)}
              </span>
            )}
          </div>
        )}
        {unusedDeduction > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 flex items-center justify-center"
            style={{
              bottom: `${pct(usedOnOrdinary + spilledToGains, axisMax)}%`,
              height: `${pct(unusedDeduction, axisMax)}%`,
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(82,82,91,0.10) 5px, rgba(82,82,91,0.10) 10px)',
            }}
          >
            {tall(unusedDeduction) && (
              <span className="rounded bg-white/70 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-neutral-500 shadow-sm">
                deduction unused
                <br />
                {formatCurrency(unusedDeduction)}
              </span>
            )}
          </div>
        )}

        {/* bracket boundary lines on top: positioned at gross height (deduction +
            threshold), but labeled with the taxable threshold so the left axis reads
            as the IRS bracket ladder ($0, then each threshold above it). */}
        {brackets.map((b) => {
          const value = deduction + b.min
          if (value <= 0 || value > axisMax) return null
          return (
            <div
              key={b.rate}
              className="pointer-events-none absolute inset-x-0 z-20 border-t border-dashed border-white/70"
              style={{ bottom: `${pct(value, axisMax)}%` }}
            >
              {b.min > 0 && (
                <span className="absolute -top-2.5 left-1 rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5">
                  {formatCurrency(b.min)}
                </span>
              )}
              <span className="absolute -top-2.5 right-1 rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5">
                {formatPercent(b.rate, 0)}
              </span>
            </div>
          )
        })}

        {/* inline per-source labels, centered in each slice that is tall enough;
            thin slices (interest, non-qual div) stay collapsed and show on hover. */}
        {grossLayers.map((layer) => {
          if (!tall(layer.amount)) return null
          const mid = layer.base + layer.amount / 2
          return (
            <span
              key={`label-${layer.source}`}
              className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 justify-center"
              style={{ top: `${100 - pct(mid, axisMax)}%` }}
            >
              <span className="rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 shadow-sm">
                {SOURCE_META[layer.source].short} · {formatCurrency(layer.amount)}
              </span>
            </span>
          )
        })}

        {/* taxable ordinary income at the top of the stack — labeled in taxable
            terms (deduction removed) to match the taxable axis, and equal to the
            capital-gains baseline. */}
        {fed.ordinaryTaxable > 0 && grossOrdinary <= axisMax && (
          <span
            className="pointer-events-none absolute left-1 z-30 -translate-y-1/2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-800 shadow-sm ring-1 ring-black/5"
            style={{ top: `${100 - pct(grossOrdinary, axisMax)}%` }}
          >
            {formatCurrency(fed.ordinaryTaxable)}
          </span>
        )}

        {grossOrdinary === 0 && (
          <div className="absolute inset-x-0 top-2 p-2 text-center text-[11px] text-muted-foreground">
            No ordinary income
          </div>
        )}
      </div>

      {/* legend */}
      <div className="mt-3 w-full max-w-[280px] space-y-1 text-[11px] sm:text-xs">
        <div className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm border border-dashed border-neutral-400 bg-neutral-200"
            aria-hidden
          />
          <span>Std. deduction</span>
          <span className="ml-auto text-muted-foreground">{formatCurrency(deduction)}</span>
        </div>
        {spilledToGains > 0 && (
          <div className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm border border-dashed border-violet-500/60 bg-violet-200"
              aria-hidden
            />
            <span>→ shields gains</span>
            <span className="ml-auto text-muted-foreground">{formatCurrency(spilledToGains)}</span>
          </div>
        )}
        {unusedDeduction > 0 && (
          <div className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm border border-dashed border-neutral-300 bg-neutral-100"
              aria-hidden
            />
            <span>Deduction unused</span>
            <span className="ml-auto text-muted-foreground">{formatCurrency(unusedDeduction)}</span>
          </div>
        )}
        {grossLayers.map((layer) => {
          const meta = SOURCE_META[layer.source]
          return (
            <div key={layer.source} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-full ${meta.swatch}`} aria-hidden />
              <span>{meta.short}</span>
              <span className="ml-auto text-muted-foreground">{formatCurrency(layer.amount)}</span>
            </div>
          )
        })}
      </div>

      <HoverTooltip visible={tip.visible} pos={tip.pos}>
        {hoveredLayer && (
          <HoveredSlice
            label={SOURCE_META[hoveredLayer.source].label}
            swatch={SOURCE_META[hoveredLayer.source].swatch}
            taxable={
              fed.layers.ordinary.find((l) => l.source === hoveredLayer.source)?.taxableAmount ?? 0
            }
            tax={hoveredTax}
          />
        )}
        <BracketBreakdown title="Tax by bracket" fills={fed.ordinaryFills} total={fed.ordinaryTax} />
      </HoverTooltip>
    </div>
  )
}
