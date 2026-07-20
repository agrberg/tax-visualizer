import { useEffect, useRef, useState } from 'react';
import { blendBackground, compositionSegments, formatCurrency, formatPercent } from '@/tax/format';
import type { TaxResult } from '@/tax/types';
import { CompositionTooltip, HoverTooltip } from './TowerParts';
import { useTooltip } from './use-tooltip';

interface Props {
  result: TaxResult;
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
  const tip = useTooltip();
  const [hovered, setHovered] = useState<string | null>(null);

  // Bar width in px — needed to tell when a segment's centered % label would fall
  // under the "Income"/"Tax" axis label (which is pinned to the bar's left edge).
  const barRef = useRef<HTMLDivElement>(null);
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarWidth(el.offsetWidth));
    ro.observe(el);
    setBarWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const totalIncome = result.totalIncome;
  const totalTax = result.totalTax;
  if (totalIncome <= 0) return null;
  const hasTax = totalTax > 0;

  let inAcc = 0;
  let taxAcc = 0;
  const placed = compositionSegments(result).map((s) => {
    const incomeShare = s.amount / totalIncome;
    const taxShare = hasTax ? s.tax / totalTax : 0;
    const seg = { ...s, incomeShare, taxShare, inLeft: inAcc, taxLeft: taxAcc };
    inAcc += incomeShare;
    taxAcc += taxShare;
    return seg;
  });
  const active = placed.find((p) => p.key === hovered);

  // Region heights in px: a 28px income bar, a 40px ribbon, and a 28px tax bar. When
  // there is no tax we render only the income bar. Each source's fill is drawn as
  // three full-container layers clipped to these bands (see below), so H is the shared
  // coordinate space every clip-path is measured against.
  const INCOME_H = 28;
  const RIBBON_H = 40;
  const H = hasTax ? INCOME_H + RIBBON_H + INCOME_H : INCOME_H;
  // Band boundaries as a percentage of H. Without tax the only band is the income
  // bar, so both collapse to 100% — keeping every clip-path coordinate within 0–100.
  const y1 = hasTax ? (INCOME_H / H) * 100 : 100;
  const y2 = hasTax ? ((INCOME_H + RIBBON_H) / H) * 100 : 100;

  // The left px reserved by each axis label (left-2 inset + ~text width + gap), at
  // the fixed 11px semibold font. A segment hides its centered % when that label
  // would overlap the axis label; the exact share stays on hover and in the table.
  const INCOME_LABEL_PX = 60;
  const TAX_LABEL_PX = 36;
  const showPct = (leftFrac: number, share: number, labelPx: number) => {
    if (share < 0.1) return false;
    if (!barWidth) return true;
    const centerPx = (leftFrac + share / 2) * barWidth;
    return centerPx - 14 >= labelPx;
  };

  return (
    <div>
      <div
        ref={barRef}
        className="relative w-full overflow-hidden"
        style={{ height: `${H}px`, borderRadius: 6 }}
        onMouseMove={tip.onMove}
        onMouseLeave={() => {
          tip.onLeave();
          setHovered(null);
        }}
      >
        {/* Seamless striped fills. Each source's income rectangle, ribbon trapezoid,
            and tax rectangle are drawn as sibling layers that share the identical
            full-container box and the identical gradient, revealed by clip-path. Because
            every layer paints the same gradient over the same box, the diagonal stripes
            are pixel-continuous across all three regions — no per-element re-anchoring. */}
        <div aria-hidden>
          {placed.map((s) => {
            const inL = s.inLeft * 100;
            const inR = (s.inLeft + s.incomeShare) * 100;
            const taxL = s.taxLeft * 100;
            const taxR = (s.taxLeft + s.taxShare) * 100;
            const dim = hovered !== null && hovered !== s.key;
            const fill = blendBackground(s.colors);
            return (
              <div key={s.key} onMouseEnter={() => setHovered(s.key)}>
                <div
                  className="absolute inset-0 transition-opacity"
                  style={{
                    clipPath: `polygon(${inL}% 0, ${inR}% 0, ${inR}% ${y1}%, ${inL}% ${y1}%)`,
                    opacity: dim ? 0.4 : 0.95,
                    ...fill,
                  }}
                />
                {hasTax && (
                  <>
                    <div
                      className="absolute inset-0 transition-opacity"
                      style={{
                        clipPath: `polygon(${inL}% ${y1}%, ${inR}% ${y1}%, ${taxR}% ${y2}%, ${taxL}% ${y2}%)`,
                        opacity: dim ? 0.12 : 0.35,
                        ...fill,
                      }}
                    />
                    <div
                      className="absolute inset-0 transition-opacity"
                      style={{
                        clipPath: `polygon(${taxL}% ${y2}%, ${taxR}% ${y2}%, ${taxR}% 100%, ${taxL}% 100%)`,
                        opacity: dim ? 0.4 : 0.95,
                        ...fill,
                      }}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Labels overlaid on the fills; the fills below own hover hit-testing. */}
        <div className="pointer-events-none absolute inset-0 text-white">
          <span
            className="absolute left-2 -translate-y-1/2 text-[11px] font-semibold drop-shadow-sm"
            style={{ top: INCOME_H / 2 }}
          >
            Income
          </span>
          {placed.map(
            (s) =>
              showPct(s.inLeft, s.incomeShare, INCOME_LABEL_PX) && (
                <span
                  key={`in-lbl-${s.key}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-semibold"
                  style={{ left: `${(s.inLeft + s.incomeShare / 2) * 100}%`, top: INCOME_H / 2 }}
                >
                  {formatPercent(s.incomeShare, 0)}
                </span>
              ),
          )}
          {hasTax && (
            <>
              <span
                className="absolute left-2 -translate-y-1/2 text-[11px] font-semibold drop-shadow-sm"
                style={{ top: H - INCOME_H / 2 }}
              >
                Tax
              </span>
              {placed.map(
                (s) =>
                  showPct(s.taxLeft, s.taxShare, TAX_LABEL_PX) && (
                    <span
                      key={`tax-lbl-${s.key}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-semibold"
                      style={{
                        left: `${(s.taxLeft + s.taxShare / 2) * 100}%`,
                        top: H - INCOME_H / 2,
                      }}
                    >
                      {formatPercent(s.taxShare, 0)}
                    </span>
                  ),
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Income {formatCurrency(totalIncome)}</span>
        <span>{hasTax ? `Tax ${formatCurrency(totalTax)}` : 'No tax'}</span>
      </div>

      {hasTax && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          A ribbon that narrows from Income to Tax pays a below-average rate; one that widens pays above.
        </p>
      )}

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
  );
}
