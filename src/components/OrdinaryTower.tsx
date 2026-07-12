import { useState } from 'react'
import { taxTablesFor } from '@/tax/years'
import { SOURCE_META, formatCurrency, formatPercent, wagesBracketFill } from '@/tax/format'
import { ORDINARY_SOURCES, type IncomeSource, type TaxResult } from '@/tax/types'
import { marginalOrdinaryIdx, nextOrdinaryBracket, ordinaryAxisMaxFor, pct, tall } from './tower'
import {
  BracketBreakdown,
  ColumnTotal,
  HatchBand,
  HoverTooltip,
  HoveredSlice,
  LayerLabel,
  Marker,
  Slice,
  SourceLegendRow,
  TowerColumn,
} from './TowerParts'
import { useTooltip } from './use-tooltip'

interface Props {
  result: TaxResult
}

export function OrdinaryTower({ result }: Props) {
  const fed = result.federal
  const brackets = taxTablesFor(result.taxYear).ordinaryBrackets[result.filingStatus]
  const deduction = fed.standardDeduction
  const axisMax = ordinaryAxisMaxFor(result)
  // The marginal bracket holds the last taxable dollar; the one above it is pinned
  // to the top edge as the "next rate" (rather than drawn to scale far above).
  const marginalIdx = marginalOrdinaryIdx(result)
  const nextBracket = nextOrdinaryBracket(result)
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
  const usedOnOrdinary = fed.deductionOnOrdinary
  const spilledToGains = fed.preferentialDeduction
  const unusedDeduction = fed.leftoverDeduction - fed.preferentialDeduction

  return (
    <div className="flex w-full max-w-xs flex-col items-center sm:max-w-none sm:flex-1">
      <TowerColumn
        title="Ordinary income"
        subtitle={
          <>
            Marginal rate {formatPercent(fed.marginalOrdinaryRate, 0)} · tax{' '}
            {formatCurrency(fed.ordinaryTax)}
          </>
        }
        ariaLabel={`Ordinary income tower: ${formatCurrency(fed.ordinaryTaxable)} taxable ordinary income, ${formatCurrency(fed.ordinaryTax)} income tax, marginal rate ${formatPercent(fed.marginalOrdinaryRate, 0)}. Per-source figures are in the overall breakdown table below.`}
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
        <HatchBand
          className="pointer-events-none bottom-0 z-10 flex items-end justify-center border-t border-dashed border-neutral-500/60 pb-1"
          bottom="0"
          height={pct(Math.min(usedOnOrdinary, axisMax), axisMax)}
          stripe="rgba(82,82,91,0.22)"
        >
          {tall(usedOnOrdinary, axisMax) && (
            <span className="rounded bg-white/85 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-neutral-700 shadow-sm">
              Std. deduction · 0%
              <br />
              {formatCurrency(usedOnOrdinary)}
            </span>
          )}
        </HatchBand>
        {spilledToGains > 0 && (
          <HatchBand
            className="pointer-events-none z-10 flex items-center justify-center border-t border-dashed border-violet-500/50"
            bottom={`${pct(usedOnOrdinary, axisMax)}%`}
            height={pct(spilledToGains, axisMax)}
            stripe="rgba(139,92,246,0.20)"
          >
            {tall(spilledToGains, axisMax) && (
              <span className="rounded bg-white/85 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-violet-700 shadow-sm">
                → shields gains
                <br />
                {formatCurrency(spilledToGains)}
              </span>
            )}
          </HatchBand>
        )}
        {unusedDeduction > 0 && (
          <HatchBand
            className="pointer-events-none z-10 flex items-center justify-center"
            bottom={`${pct(usedOnOrdinary + spilledToGains, axisMax)}%`}
            height={pct(unusedDeduction, axisMax)}
            stripe="rgba(82,82,91,0.10)"
          >
            {tall(unusedDeduction, axisMax) && (
              <span className="rounded bg-white/70 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-neutral-500 shadow-sm">
                deduction unused
                <br />
                {formatCurrency(unusedDeduction)}
              </span>
            )}
          </HatchBand>
        )}

        {/* bracket boundary lines on top: positioned at gross height (deduction +
            threshold), but labeled with the taxable threshold so the left axis reads
            as the IRS bracket ladder ($0, then each threshold above it). */}
        {brackets.map((b, i) => {
          // The next bracket (and anything above) is pinned to the top edge below,
          // not drawn to scale — only render crossed/marginal boundaries here.
          if (i > marginalIdx) return null
          const value = deduction + b.min
          if (value <= 0 || value > axisMax) return null
          return (
            <Marker
              key={b.rate}
              zClassName="z-20"
              border="border-t border-dashed border-white/70"
              bottom={pct(value, axisMax)}
              left={b.min > 0 ? formatCurrency(b.min) : undefined}
              right={formatPercent(b.rate, 0)}
            />
          )
        })}

        {/* the next bracket up, pinned to the top edge (threshold left, rate right) —
            mirrors the capital-gains tower's off-axis boundary. The empty gap below it
            signals "your top dollars are still in the current rate; this is next". */}
        {nextBracket && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
            <span className="absolute -top-2.5 left-1 rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5">
              {formatCurrency(nextBracket.min)}
            </span>
            <span className="absolute -top-2.5 right-1 rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5">
              {formatPercent(nextBracket.rate, 0)}
            </span>
          </div>
        )}

        {/* inline per-source labels, centered in each slice that is tall enough;
            thin slices (interest, non-qual div) stay collapsed and show on hover. */}
        {grossLayers.map((layer) => {
          if (!tall(layer.amount, axisMax)) return null
          const mid = layer.base + layer.amount / 2
          return (
            <LayerLabel key={`label-${layer.source}`} topPct={100 - pct(mid, axisMax)}>
              {SOURCE_META[layer.source].short} · {formatCurrency(layer.amount)}
            </LayerLabel>
          )
        })}

        {/* taxable ordinary income at the top of the stack — labeled in taxable
            terms (deduction removed) to match the taxable axis, and equal to the
            capital-gains baseline. */}
        {fed.ordinaryTaxable > 0 && grossOrdinary <= axisMax && (
          <ColumnTotal topPct={100 - pct(grossOrdinary, axisMax)} zClassName="z-30">
            {formatCurrency(fed.ordinaryTaxable)}
          </ColumnTotal>
        )}

        {grossOrdinary === 0 && (
          <div className="absolute inset-x-0 top-2 p-2 text-center text-[11px] text-muted-foreground">
            No ordinary income
          </div>
        )}
      </TowerColumn>

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
            <SourceLegendRow
              key={layer.source}
              swatch={meta.swatch}
              label={meta.short}
              amount={layer.amount}
            />
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
