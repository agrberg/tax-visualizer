import { useState } from 'react'
import { CAPITAL_GAINS_BREAKPOINTS } from '@/tax/brackets'
import { SOURCE_META, formatCurrency } from '@/tax/format'
import type { IncomeSource, TaxResult } from '@/tax/types'
import { TOWER_HEIGHT, pct } from './tower'
import { BracketBreakdown, HoverTooltip, HoveredSlice } from './TowerParts'
import { useTooltip } from './use-tooltip'

interface Props {
  result: TaxResult
  axisMax: number
}

export function CapitalGainsTower({ result, axisMax }: Props) {
  const fed = result.federal
  const { rate0Max, rate15Max } = CAPITAL_GAINS_BREAKPOINTS[result.filingStatus]
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

  // Rate zones with their real dollar ranges (taxable income).
  const bands = [
    { rate: 0, label: '0%', tint: 'bg-green-500/15', from: 0, to: rate0Max },
    { rate: 0.15, label: '15%', tint: 'bg-amber-500/15', from: rate0Max, to: rate15Max },
    { rate: 0.2, label: '20%', tint: 'bg-red-500/15', from: rate15Max, to: Infinity },
  ]
  // Each dollar boundary carries the rate that *starts* above it, on the right —
  // matching the ordinary tower's convention.
  const dividers = [
    { value: rate0Max, rateAbove: '15%' },
    { value: rate15Max, rateAbove: '20%' },
  ]
  const fifteenOffAxis = offset + rate15Max > axisMax
  // Center of the 0% band, which has no lower divider line to sit on.
  const zeroBandCenter = pct(offset + rate0Max / 2, axisMax)
  // Only label a band in-bar when it's tall enough; otherwise the legend carries it.
  const tall = (amount: number) => pct(amount, axisMax) >= 7

  return (
    <div className="flex w-full max-w-xs flex-col items-center sm:max-w-none sm:flex-1">
      <div className="mb-5 text-center">
        <div className="text-sm font-semibold">Capital gains &amp; qualified dividends</div>
        <div className="text-xs text-muted-foreground">
          Stacked on ordinary income · tax {formatCurrency(fed.capitalGainsTax)}
        </div>
      </div>

      <div
        className="relative w-full max-w-xs rounded-md border sm:max-w-[280px]"
        style={{ height: TOWER_HEIGHT }}
        onMouseMove={tip.onMove}
        onMouseLeave={() => {
          tip.onLeave()
          setHovered(null)
        }}
      >
        {/* rate-zone backgrounds (show through as "room" above the gains) */}
        {bands.map((band) => {
          const vFrom = offset + band.from
          const vTo = Math.min(offset + band.to, axisMax)
          if (vTo <= vFrom) return null
          return (
            <div
              key={band.label}
              className={`absolute inset-x-0 ${band.tint}`}
              style={{ bottom: `${pct(vFrom, axisMax)}%`, height: `${pct(vTo - vFrom, axisMax)}%` }}
            />
          )
        })}

        {/* standard-deduction spill: shields the bottom of preferential income at 0% */}
        {offset > 0 && (
          <div
            className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-1"
            style={{
              height: `${pct(Math.min(offset, axisMax), axisMax)}%`,
              backgroundColor: '#e5e5e5',
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(113,113,122,0.30) 5px, rgba(113,113,122,0.30) 10px)',
            }}
          >
            {tall(offset) && (
              <span className="z-20 rounded bg-white/85 px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-neutral-700 shadow-sm">
                Deduction spillover · 0%
                <br />
                {formatCurrency(offset)}
              </span>
            )}
          </div>
        )}

        {/* ordinary income occupancy (only when it has taxable income; then offset is 0).
            The baseline marker line labels the exact dollar value, so this zone is
            left unlabeled. */}
        {baseline > 0 && (
          <div
            className="absolute inset-x-0"
            style={{
              bottom: `${posPct(0)}%`,
              height: `${pct(Math.min(baseline, axisMax), axisMax)}%`,
              backgroundColor: '#e5e5e5',
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(113,113,122,0.30) 5px, rgba(113,113,122,0.30) 10px)',
            }}
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
          const meta = SOURCE_META[layer.source]
          return (
            <div
              key={layer.source}
              className={`absolute inset-x-0 ${meta.fill} ${
                hovered && hovered !== layer.source ? 'opacity-40' : 'opacity-95'
              } transition-opacity`}
              style={{
                bottom: `${posPct(layer.base)}%`,
                height: `${pct(layer.taxableAmount, axisMax)}%`,
              }}
              onMouseEnter={() => setHovered(layer.source)}
            />
          )
        })}

        {/* aggregate total at the top of the stacked gains */}
        {fed.preferentialTaxable > 0 && offset + topOfGains <= axisMax && (
          <span
            className="pointer-events-none absolute left-1 z-20 -translate-y-1/2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-800 shadow-sm ring-1 ring-black/5"
            style={{ top: `${100 - posPct(topOfGains)}%` }}
          >
            {formatCurrency(topOfGains)}
          </span>
        )}

        {/* inline per-source labels, centered in each gains layer that is tall enough */}
        {layers.map((layer) => {
          if (!tall(layer.taxableAmount)) return null
          const mid = layer.base + layer.taxableAmount / 2
          return (
            <span
              key={`label-${layer.source}`}
              className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 justify-center"
              style={{ top: `${100 - posPct(mid)}%` }}
            >
              <span className="rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 shadow-sm">
                {SOURCE_META[layer.source].short} · {formatCurrency(layer.taxableAmount)}
              </span>
            </span>
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
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-foreground/50"
            style={{ bottom: `${posPct(baseline)}%` }}
          >
            <span className="absolute -top-2.5 left-1 rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5">
              {formatCurrency(baseline)}
            </span>
          </div>
        )}

        {/* dollar boundaries between zones, drawn on top: threshold left, next rate right */}
        {dividers.map(({ value, rateAbove }) =>
          value > 0 && offset + value <= axisMax ? (
            <div
              key={value}
              className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-foreground/50"
              style={{ bottom: `${posPct(value)}%` }}
            >
              <span className="absolute -top-2.5 left-1 rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5">
                {formatCurrency(value)}
              </span>
              <span className="absolute -top-2.5 right-1 rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5">
                {rateAbove}
              </span>
            </div>
          ) : null,
        )}

        {/* 15% → 20% boundary. When it sits above the visible axis, pin it to the top
            edge but keep the standard marker layout: threshold on the left, the rate
            that starts there (20%) on the right. */}
        {fifteenOffAxis && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
            <span className="absolute -top-2.5 left-1 rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5">
              {formatCurrency(rate15Max)}
            </span>
            <span className="absolute -top-2.5 right-1 rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5">
              20%
            </span>
          </div>
        )}
      </div>

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
            <div key={layer.source} className="flex items-center gap-1.5 pt-1">
              <span className={`size-2.5 rounded-full ${meta.swatch}`} aria-hidden />
              <span>{meta.short}</span>
              <span className="ml-auto text-muted-foreground">
                {formatCurrency(layer.taxableAmount)}
              </span>
            </div>
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
