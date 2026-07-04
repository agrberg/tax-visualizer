import { CAPITAL_GAINS_BREAKPOINTS } from '@/tax/brackets'
import { SOURCE_META, formatCurrency } from '@/tax/format'
import type { TaxResult } from '@/tax/types'
import { TOWER_HEIGHT, pct } from './tower'

interface Props {
  result: TaxResult
  axisMax: number
}

export function CapitalGainsTower({ result, axisMax }: Props) {
  const { rate0Max, rate15Max } = CAPITAL_GAINS_BREAKPOINTS[result.filingStatus]
  const baseline = result.capitalGainsBaseline
  const topOfGains = baseline + result.preferentialTaxable
  const layers = result.preferentialLayers.filter((l) => l.taxableAmount > 0)

  const bands = [
    { label: '0%', color: 'bg-green-500/12', from: 0, to: rate0Max },
    { label: '15%', color: 'bg-amber-500/12', from: rate0Max, to: rate15Max },
    { label: '20%', color: 'bg-red-500/12', from: rate15Max, to: axisMax },
  ]

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 text-center">
        <div className="text-sm font-semibold">Capital gains &amp; qualified dividends</div>
        <div className="text-xs text-muted-foreground">
          Stacked on ordinary income · tax {formatCurrency(result.capitalGainsTax)}
        </div>
      </div>

      <div className="relative w-28 rounded-md border" style={{ height: TOWER_HEIGHT }}>
        {/* rate-band backgrounds */}
        {bands.map((band) => {
          const bottom = pct(band.from, axisMax)
          const height = pct(Math.min(band.to, axisMax) - band.from, axisMax)
          if (height <= 0) return null
          return (
            <div
              key={band.label}
              className={`absolute inset-x-0 ${band.color}`}
              style={{ bottom: `${bottom}%`, height: `${height}%` }}
            >
              <span className="absolute right-1 top-1 text-[10px] font-medium text-muted-foreground">
                {band.label}
              </span>
            </div>
          )
        })}

        {/* space occupied by ordinary income (why gains stack where they do) */}
        {baseline > 0 && (
          <div
            className="absolute inset-x-0 bottom-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(120,120,120,0.18)_4px,rgba(120,120,120,0.18)_8px)]"
            style={{ height: `${pct(Math.min(baseline, axisMax), axisMax)}%` }}
            title={`Ordinary taxable income: ${formatCurrency(baseline)}`}
          />
        )}

        {/* room remaining at 0% (between the gains top and the 0% ceiling) */}
        {topOfGains < rate0Max && rate0Max <= axisMax && (
          <div
            className="absolute inset-x-0 border border-dashed border-green-600/50 bg-green-500/10"
            style={{
              bottom: `${pct(topOfGains, axisMax)}%`,
              height: `${pct(rate0Max - topOfGains, axisMax)}%`,
            }}
            title={`Room at 0%: ${formatCurrency(result.roomAt0)}`}
          />
        )}

        {/* preferential gains, stacked on the baseline, colored by source */}
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

        {/* baseline marker */}
        {baseline > 0 && baseline <= axisMax && (
          <div
            className="absolute inset-x-0 border-t-2 border-foreground/40"
            style={{ bottom: `${pct(baseline, axisMax)}%` }}
          />
        )}
      </div>

      {/* room stats */}
      <div className="mt-3 w-40 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-green-500" aria-hidden /> Room at 0%
          </span>
          <span className="font-medium">{formatCurrency(result.roomAt0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-500" aria-hidden /> Room to 15% top
          </span>
          <span className="font-medium">{formatCurrency(result.roomAt15)}</span>
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
    </div>
  )
}
