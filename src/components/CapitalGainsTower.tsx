import { useState } from 'react'
import { taxTablesFor } from '@/tax/years'
import { SOURCE_META, formatCurrency } from '@/tax/format'
import type { IncomeSource, TaxResult } from '@/tax/types'
import { pct, tall } from './tower'
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
  axisMax: number
}

export function CapitalGainsTower({ result, axisMax }: Props) {
  const fed = result.federal
  const { rate0Max, rate15Max } = taxTablesFor(result.taxYear).capitalGains.breakpoints[result.filingStatus]
  const baseline = fed.capitalGainsBaseline
  const topOfGains = baseline + fed.preferentialTaxable
  const layers = fed.layers.preferential.filter((l) => l.taxableAmount > 0)
  const tip = useTooltip()
  const [hovered, setHovered] = useState<IncomeSource | null>(null)
  const hoveredLayer = layers.find((l) => l.source === hovered)

  // Standard deduction that spilled onto preferential income sits below the brackets (0%).
  const offset = fed.preferentialDeduction
  // Position (%) of a taxable-income value, shifted up by the shielded deduction.
  const posPct = (taxableValue: number) => pct(offset + taxableValue, axisMax)

  // Each dollar boundary carries the rate that *starts* above it, on the right —
  // matching the ordinary tower's convention.
  const dividers = [
    { value: rate0Max, rateAbove: '15%' },
    { value: rate15Max, rateAbove: '20%' },
  ]
  // The rate boundary just above the gains is pinned off-axis to the top edge
  // (mirrors the ordinary tower's next-bracket pin); boundaries the gains have
  // already crossed are drawn to scale below.
  const nextBoundary = dividers.find((d) => d.value > topOfGains) ?? null
  // Center of the visible 0% band, which has no lower divider line to sit on.
  const zeroZoneTop = Math.min(offset + rate0Max, axisMax)
  const zeroBandCenter = pct((offset + zeroZoneTop) / 2, axisMax)

  return (
    <div className="flex w-full max-w-xs flex-col items-center sm:max-w-none sm:flex-1">
      <TowerColumn
        title="Capital gains & qualified dividends"
        subtitle={<>Stacked on ordinary income · tax {formatCurrency(fed.capitalGainsTax)}</>}
        onMouseMove={tip.onMove}
        onMouseLeave={() => {
          tip.onLeave()
          setHovered(null)
        }}
      >
        {/* standard-deduction spill: shields the bottom of preferential income at 0% */}
        {offset > 0 && (
          <HatchBand
            className="bottom-0 flex items-end justify-center pb-1"
            bottom="0"
            height={pct(Math.min(offset, axisMax), axisMax)}
            stripe="rgba(113,113,122,0.30)"
            backgroundColor="#e5e5e5"
          >
            {tall(offset, axisMax) && (
              <span className="z-20 rounded bg-white/85 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-neutral-700 shadow-sm">
                Deduction spillover · 0%
                <br />
                {formatCurrency(offset)}
              </span>
            )}
          </HatchBand>
        )}

        {/* ordinary income occupancy (only when it has taxable income; then offset is 0).
            The baseline marker line labels the exact dollar value, so this zone is
            left unlabeled. */}
        {baseline > 0 && (
          <HatchBand
            className=""
            bottom={`${posPct(0)}%`}
            height={pct(Math.min(baseline, axisMax), axisMax)}
            stripe="rgba(113,113,122,0.30)"
            backgroundColor="#e5e5e5"
          />
        )}

        {/* room remaining at 0% (between the gains top and the 0% ceiling) */}
        {topOfGains < rate0Max && offset + rate0Max <= axisMax && (
          <div
            className="absolute inset-x-0 border border-dashed border-green-600/50 bg-green-500/10"
            style={{
              bottom: `${posPct(topOfGains)}%`,
              height: `${pct(rate0Max - topOfGains, axisMax)}%`,
            }}
          />
        )}

        {/* preferential gains, stacked on the baseline, colored by source */}
        {layers.map((layer) => {
          const dim = hovered !== null && hovered !== layer.source
          return (
            <Slice
              key={layer.source}
              from={offset + layer.base}
              to={offset + layer.base + layer.taxableAmount}
              axisMax={axisMax}
              className={SOURCE_META[layer.source].fill}
              dim={dim}
              onEnter={() => setHovered(layer.source)}
            />
          )
        })}

        {/* aggregate total at the top of the stacked gains */}
        {fed.preferentialTaxable > 0 && offset + topOfGains <= axisMax && (
          <ColumnTotal topPct={100 - posPct(topOfGains)}>{formatCurrency(topOfGains)}</ColumnTotal>
        )}

        {/* inline per-source labels, centered in each gains layer that is tall enough */}
        {layers.map((layer) => {
          if (!tall(layer.taxableAmount, axisMax)) return null
          const mid = layer.base + layer.taxableAmount / 2
          return (
            <LayerLabel key={`label-${layer.source}`} topPct={100 - posPct(mid)}>
              {SOURCE_META[layer.source].short} · {formatCurrency(layer.taxableAmount)}
            </LayerLabel>
          )
        })}

        {/* 0% rate label — its band has no lower divider line, so center it in-zone.
            The 15% and 20% rates ride on their divider lines (right side) instead. */}
        {rate0Max > 0 && (
          <span
            className="pointer-events-none absolute right-1 z-20 -translate-y-1/2 rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5"
            style={{ top: `${100 - zeroBandCenter}%` }}
          >
            0%
          </span>
        )}

        {/* baseline marker: top of ordinary income / where gains start */}
        {baseline > 0 && offset + baseline <= axisMax && (
          <Marker
            border="border-t-2 border-foreground/50"
            bottom={posPct(baseline)}
            left={formatCurrency(baseline)}
          />
        )}

        {/* dollar boundaries the gains have crossed, drawn to scale: threshold left, next rate right */}
        {dividers.map(({ value, rateAbove }) =>
          value > 0 && value <= topOfGains ? (
            <Marker
              key={value}
              border="border-t border-dashed border-foreground/50"
              bottom={posPct(value)}
              left={formatCurrency(value)}
              right={rateAbove}
            />
          ) : null,
        )}

        {/* the next rate boundary above the gains, pinned to the top edge (off-axis) —
            threshold on the left, the rate that starts there on the right. */}
        {nextBoundary && (
          <Marker
            topPinned
            zClassName="z-20"
            left={formatCurrency(nextBoundary.value)}
            right={nextBoundary.rateAbove}
          />
        )}
      </TowerColumn>

      {/* room stats */}
      <div className="mt-3 w-full max-w-[280px] space-y-1 text-[11px] sm:text-xs">
        {offset > 0 && (
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm border border-dashed border-neutral-400 bg-neutral-200"
                aria-hidden
              />{' '}
              Deduction spillover
            </span>
            <span className="font-medium">{formatCurrency(offset)}</span>
          </div>
        )}
        {baseline > 0 && (
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm border border-dashed border-neutral-400 bg-neutral-200"
                aria-hidden
              />{' '}
              Ordinary income
            </span>
            <span className="font-medium">{formatCurrency(baseline)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-green-500" aria-hidden /> Room at 0%
          </span>
          <span className="font-medium">{formatCurrency(fed.roomAt0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-500" aria-hidden /> Room to 15% top
          </span>
          <span className="font-medium">{formatCurrency(fed.roomAt15)}</span>
        </div>
        {layers.map((layer) => {
          const meta = SOURCE_META[layer.source]
          return (
            <SourceLegendRow
              key={layer.source}
              className="pt-1"
              swatch={meta.swatch}
              label={meta.short}
              amount={layer.taxableAmount}
            />
          )
        })}
      </div>

      <HoverTooltip visible={tip.visible} pos={tip.pos}>
        {hoveredLayer && (
          <HoveredSlice
            label={SOURCE_META[hoveredLayer.source].label}
            swatch={SOURCE_META[hoveredLayer.source].swatch}
            taxable={hoveredLayer.taxableAmount}
            tax={hoveredLayer.tax}
          />
        )}
        <BracketBreakdown title="Tax by rate" fills={fed.capitalGainsFills} total={fed.capitalGainsTax} />
      </HoverTooltip>
    </div>
  )
}
