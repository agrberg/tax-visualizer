import { useState } from 'react'
import { ORDINARY_BRACKETS } from '@/tax/brackets'
import { SOURCE_META, formatCurrency, formatPercent } from '@/tax/format'
import type { IncomeSource, TaxResult } from '@/tax/types'
import { TOWER_HEIGHT, pct } from './tower'
import { BracketBreakdown, HoverTooltip, HoveredSlice } from './TowerParts'
import { useTooltip } from './use-tooltip'

interface Props {
  result: TaxResult
  axisMax: number
}

export function OrdinaryTower({ result, axisMax }: Props) {
  const layers = result.ordinaryLayers.filter((l) => l.taxableAmount > 0)
  const brackets = ORDINARY_BRACKETS[result.filingStatus]
  const tip = useTooltip()
  const [hovered, setHovered] = useState<IncomeSource | null>(null)
  const hoveredLayer = layers.find((l) => l.source === hovered)

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 text-center">
        <div className="text-sm font-semibold">Ordinary income</div>
        <div className="text-xs text-muted-foreground">
          Marginal rate {formatPercent(result.marginalOrdinaryRate, 0)} · tax{' '}
          {formatCurrency(result.ordinaryTax)}
        </div>
      </div>

      <div
        className="relative w-28 rounded-md border bg-muted/40"
        style={{ height: TOWER_HEIGHT }}
        onMouseMove={tip.onMove}
        onMouseLeave={() => {
          tip.onLeave()
          setHovered(null)
        }}
      >
        {/* source-colored slices, stacked bottom → top */}
        {layers.map((layer) => {
          const meta = SOURCE_META[layer.source]
          return (
            <div
              key={layer.source}
              className={`absolute inset-x-0 ${meta.fill} ${
                hovered && hovered !== layer.source ? 'opacity-40' : 'opacity-95'
              } transition-opacity`}
              style={{
                bottom: `${pct(layer.base, axisMax)}%`,
                height: `${pct(layer.taxableAmount, axisMax)}%`,
              }}
              onMouseEnter={() => setHovered(layer.source)}
            />
          )
        })}

        {/* bracket boundary lines, drawn ON TOP so they read through the fills */}
        {brackets.map((b) =>
          b.min > 0 && b.min <= axisMax ? (
            <div
              key={b.rate}
              className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-white/80 mix-blend-plus-lighter"
              style={{ bottom: `${pct(b.min, axisMax)}%` }}
            >
              <span className="absolute -top-2.5 right-1 rounded bg-background/85 px-1 text-[10px] font-medium text-foreground">
                {formatPercent(b.rate, 0)}
              </span>
            </div>
          ) : null,
        )}

        {result.ordinaryTaxable === 0 && (
          <div className="absolute inset-x-0 bottom-0 p-2 text-center text-[11px] text-muted-foreground">
            No ordinary taxable income
          </div>
        )}
      </div>

      {/* legend */}
      <div className="mt-3 space-y-1">
        {layers.map((layer) => {
          const meta = SOURCE_META[layer.source]
          return (
            <div key={layer.source} className="flex items-center gap-1.5 text-xs">
              <span className={`size-2.5 rounded-full ${meta.swatch}`} aria-hidden />
              <span>{meta.short}</span>
              <span className="text-muted-foreground">{formatCurrency(layer.taxableAmount)}</span>
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
        <BracketBreakdown title="Tax by bracket" fills={result.ordinaryFills} total={result.ordinaryTax} />
      </HoverTooltip>
    </div>
  )
}
