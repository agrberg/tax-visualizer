import { ORDINARY_BRACKETS } from '@/tax/brackets'
import { SOURCE_META, formatCurrency, formatPercent } from '@/tax/format'
import type { TaxResult } from '@/tax/types'
import { TOWER_HEIGHT, pct } from './tower'

interface Props {
  result: TaxResult
  axisMax: number
}

export function OrdinaryTower({ result, axisMax }: Props) {
  const layers = result.ordinaryLayers.filter((l) => l.taxableAmount > 0)
  const brackets = ORDINARY_BRACKETS[result.filingStatus]

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 text-center">
        <div className="text-sm font-semibold">Ordinary income</div>
        <div className="text-xs text-muted-foreground">
          Marginal rate {formatPercent(result.marginalOrdinaryRate, 0)} · tax{' '}
          {formatCurrency(result.ordinaryTax)}
        </div>
      </div>

      <div className="flex items-end gap-2">
        {/* the column */}
        <div
          className="relative w-28 rounded-md border bg-muted/40"
          style={{ height: TOWER_HEIGHT }}
        >
          {/* bracket boundary lines */}
          {brackets.map((b) =>
            b.min > 0 && b.min <= axisMax ? (
              <div
                key={b.rate}
                className="absolute inset-x-0 border-t border-dashed border-foreground/25"
                style={{ bottom: `${pct(b.min, axisMax)}%` }}
              >
                <span className="absolute -top-2 right-1 bg-background/80 px-1 text-[10px] text-muted-foreground">
                  {formatPercent(b.rate, 0)}
                </span>
              </div>
            ) : null,
          )}

          {/* source-colored slices, stacked bottom → top */}
          {layers.map((layer) => {
            const meta = SOURCE_META[layer.source]
            return (
              <div
                key={layer.source}
                className={`absolute inset-x-0 ${meta.fill} opacity-90`}
                style={{
                  bottom: `${pct(layer.base, axisMax)}%`,
                  height: `${pct(layer.taxableAmount, axisMax)}%`,
                }}
                title={`${meta.label}: ${formatCurrency(layer.taxableAmount)} taxable`}
              />
            )
          })}

          {result.ordinaryTaxable === 0 && (
            <div className="absolute inset-x-0 bottom-0 p-2 text-center text-[11px] text-muted-foreground">
              No ordinary taxable income
            </div>
          )}
        </div>
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
    </div>
  )
}
