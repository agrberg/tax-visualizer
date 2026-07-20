import { useState } from 'react';
import { blendBackground, compositionSegments, formatPercent } from '@/tax/format';
import type { TaxResult } from '@/tax/types';
import { CompositionTooltip, HoverTooltip } from './TowerParts';
import { useTooltip } from './use-tooltip';

interface Props {
  result: TaxResult;
}

/**
 * Marimekko.
 *
 * Each source's segment WIDTH is its share of income. Its colored fill rises to a
 * HEIGHT equal to its share of tax ÷ its share of income, against a dashed
 * "proportional" line at 1×. A source that fills ABOVE the line takes a bigger
 * bite of your tax than of your income (e.g. capital gains); below the line, the
 * reverse. The height axis is zoomed to a padded window around the sources' ratios
 * (not anchored at 0×), so small differences near 1× stay visible; a rare extreme
 * ratio clips at the top edge and shows its true value with an ↑.
 */
export function CompositionMarimekko({ result }: Props) {
  const tip = useTooltip();
  const [hovered, setHovered] = useState<string | null>(null);

  const totalIncome = result.totalIncome;
  const totalTax = result.totalTax;
  if (totalIncome <= 0 || totalTax <= 0) return null;

  const placed = compositionSegments(result).map((s) => {
    const incomeShare = s.amount / totalIncome;
    const taxShare = s.tax / totalTax;
    return { ...s, incomeShare, taxShare, ratio: incomeShare > 0 ? taxShare / incomeShare : 0 };
  });
  // Height axis = the tax-to-income ratio, zoomed to a padded window around the taxed
  // sources (snapped to STEP) so fluctuations near 1× are visible instead of anchored
  // at 0×. The 1× "proportional" line is always kept inside the window; the floor never
  // goes below 0; the top is capped so one extreme source clips (with ↑) rather than
  // stretching the axis flat. Dashed gridlines every STEP keep it readable.
  const STEP = 0.25;
  const SCALE_CAP = 2;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const taxedRatios = placed.filter((p) => p.tax > 0).map((p) => p.ratio);
  const dataMin = taxedRatios.length ? Math.min(...taxedRatios) : 1;
  const dataMax = Math.max(1, ...taxedRatios);
  let scaleMin = Math.min(Math.floor(dataMin / STEP) * STEP, 1 - STEP);
  scaleMin = Math.max(0, dataMin <= scaleMin ? scaleMin - STEP : scaleMin);
  const scaleMax = Math.max(1 + STEP, Math.min(SCALE_CAP, Math.ceil(dataMax / STEP) * STEP));
  const gridlines: number[] = [];
  for (let r = scaleMin + STEP; r < scaleMax - 1e-9; r += STEP) gridlines.push(round2(r));
  const active = placed.find((s) => s.key === hovered);

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
          tip.onLeave();
          setHovered(null);
        }}
      >
        {/* ratio gridlines; 1× is the "proportional" line (tax share == income share) */}
        {gridlines.map((r) => {
          const parity = r === 1;
          return (
            <div
              key={r}
              className={`pointer-events-none absolute inset-x-0 z-20 border-t border-dashed ${
                parity ? 'border-neutral-600/80' : 'border-neutral-400/40'
              }`}
              style={{ bottom: `${((r - scaleMin) / (scaleMax - scaleMin)) * 100}%` }}
            >
              <span className="absolute -top-2 right-0.5 rounded bg-white/80 px-1 text-[9px] font-medium text-neutral-600">
                {parity ? '1× · proportional' : `${r}×`}
              </span>
            </div>
          );
        })}

        {placed.map((s) => {
          const clipped = s.ratio > scaleMax;
          const fillPct = Math.max(0, Math.min(100, ((s.ratio - scaleMin) / (scaleMax - scaleMin)) * 100));
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
              {/* label: color identifies the source. Taxed sources show income → tax ·
                  ratio (↑ when clipped past the cap); untaxed sources show just their
                  income share, since their empty height already says "0% of tax". */}
              {s.incomeShare >= 0.12 && (
                <span className="pointer-events-none absolute inset-x-0 top-1 z-20 px-1 text-center text-[10px] font-medium leading-tight text-neutral-700">
                  {s.tax > 0 ? (
                    <>
                      {formatPercent(s.incomeShare, 0)} → {formatPercent(s.taxShare, 0)} · {s.ratio.toFixed(2)}×
                      {clipped ? '↑' : ''}
                    </>
                  ) : (
                    formatPercent(s.incomeShare, 0)
                  )}
                </span>
              )}
            </div>
          );
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
                {formatPercent(active.incomeShare, 1)} of income → {formatPercent(active.taxShare, 1)} of tax
              </>
            }
            amount={active.amount}
            tax={active.tax}
            effectiveRate={active.effectiveRate}
            ratio={active.ratio}
          />
        )}
      </HoverTooltip>
    </div>
  );
}
