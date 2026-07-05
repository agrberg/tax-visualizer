import { type CSSProperties, type MouseEventHandler, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { blendBackground, formatCurrency, formatPercent } from '@/tax/format'
import type { BracketFill } from '@/tax/types'
import { TOWER_HEIGHT, pct } from './tower'

/** A small color dot: solid for one color, diagonal stripes when a bucket blends two. */
export function Swatch({ colors, className }: { colors: string[]; className?: string }) {
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${className ?? ''}`}
      style={blendBackground(colors, { stripe: 3 })}
      aria-hidden
    />
  )
}

/** A floating tooltip portaled to <body> so it never clips inside a card. */
export function HoverTooltip({
  visible,
  pos,
  children,
}: {
  visible: boolean
  pos: { x: number; y: number }
  children: ReactNode
}) {
  if (!visible) return null
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 w-60 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
      style={{ left: Math.min(pos.x + 16, window.innerWidth - 260), top: pos.y + 16 }}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Header line describing the hovered source slice. */
export function HoveredSlice({
  label,
  swatch,
  taxable,
  tax,
}: {
  label: string
  swatch: string
  taxable: number
  tax: number
}) {
  return (
    <div className="mb-2 border-b pb-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <span className={`size-2.5 rounded-full ${swatch}`} aria-hidden />
        {label}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {formatCurrency(taxable)} taxable · {formatCurrency(tax)} tax
      </div>
    </div>
  )
}

/** Per-bracket "how much at each rate" table plus the tower total. */
export function BracketBreakdown({
  title,
  fills,
  total,
}: {
  title: string
  fills: BracketFill[]
  total: number
}) {
  const rows = fills.filter((f) => f.amountInBracket > 0)
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((f) => (
            <tr key={f.rate}>
              <td className="py-0.5 pr-2 tabular-nums text-muted-foreground">
                {formatPercent(f.rate, 0)}
              </td>
              <td className="py-0.5 pr-2 text-right tabular-nums">
                {formatCurrency(f.amountInBracket)}
              </td>
              <td className="py-0.5 text-right tabular-nums">{formatCurrency(f.taxInBracket)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-medium">
            <td className="py-0.5 pr-2">Total</td>
            <td className="py-0.5" />
            <td className="py-0.5 text-right tabular-nums">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** Composition-view tooltip body: header (swatch + label + subtitle) and an
    amount / tax / take-home / effective-rate table. */
export function CompositionTooltip({
  colors,
  label,
  subtitle,
  amount,
  tax,
  effectiveRate,
}: {
  colors: string[]
  label: string
  subtitle: ReactNode
  amount: number
  tax: number
  effectiveRate: number
}) {
  return (
    <div>
      <div className="mb-2 border-b pb-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Swatch colors={colors} />
          {label}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <table className="w-full text-xs">
        <tbody>
          <tr>
            <td className="py-0.5 text-muted-foreground">Amount</td>
            <td className="py-0.5 text-right tabular-nums">{formatCurrency(amount)}</td>
          </tr>
          <tr>
            <td className="py-0.5 text-muted-foreground">Tax</td>
            <td className="py-0.5 text-right tabular-nums">{formatCurrency(tax)}</td>
          </tr>
          <tr>
            <td className="py-0.5 text-muted-foreground">Take-home</td>
            <td className="py-0.5 text-right tabular-nums">{formatCurrency(amount - tax)}</td>
          </tr>
          <tr>
            <td className="py-0.5 text-muted-foreground">Effective rate</td>
            <td className="py-0.5 text-right tabular-nums">{formatPercent(effectiveRate, 1)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** The small white label chip used on boundary markers. */
export function MarkerChip({ side, children }: { side: 'left' | 'right'; children: ReactNode }) {
  return (
    <span
      className={`absolute -top-2.5 ${side === 'left' ? 'left-1' : 'right-1'} rounded bg-white px-1 text-[10px] font-medium text-black shadow-sm ring-1 ring-black/5`}
    >
      {children}
    </span>
  )
}

/** A positioned horizontal boundary line carrying optional left/right label chips.
    When `topPinned`, it rides the top edge with no border line. */
export function Marker({
  bottom,
  topPinned,
  border,
  zClassName = 'z-10',
  left,
  right,
}: {
  bottom?: number
  topPinned?: boolean
  border?: string
  zClassName?: string
  left?: ReactNode
  right?: ReactNode
}) {
  const positionClass = topPinned ? 'top-0' : ''
  const style: CSSProperties = topPinned ? {} : { bottom: `${bottom ?? 0}%` }
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 ${zClassName} ${positionClass} ${border ?? ''}`}
      style={style}
    >
      {left != null && <MarkerChip side="left">{left}</MarkerChip>}
      {right != null && <MarkerChip side="right">{right}</MarkerChip>}
    </div>
  )
}

/** A diagonal-hatch band positioned by vertical range, with an optional solid
    backgroundColor, top border, and centered children. `className` carries the
    band-specific layout (z-index, flex alignment, pointer-events). */
export function HatchBand({
  className,
  bottom,
  height,
  stripe,
  backgroundColor,
  children,
}: {
  className: string
  bottom: string
  height: number
  stripe: string
  backgroundColor?: string
  children?: ReactNode
}) {
  return (
    <div
      className={`absolute inset-x-0 ${className}`}
      style={{
        bottom,
        height: `${height}%`,
        ...(backgroundColor ? { backgroundColor } : {}),
        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 5px, ${stripe} 5px, ${stripe} 10px)`,
      }}
    >
      {children}
    </div>
  )
}

/** A centered pill label vertically positioned at `topPct` (% from top). */
export function LayerLabel({ topPct, children }: { topPct: number; children: ReactNode }) {
  return (
    <span
      className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 justify-center"
      style={{ top: `${topPct}%` }}
    >
      <span className="rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 shadow-sm">
        {children}
      </span>
    </span>
  )
}

/** The shared tower shell: a title/subtitle header above a fixed-height bordered
    column. Children are the absolutely-positioned bands, slices, and markers. */
export function TowerColumn({
  title,
  subtitle,
  onMouseMove,
  onMouseLeave,
  children,
}: {
  title: string
  subtitle: ReactNode
  onMouseMove: MouseEventHandler<HTMLDivElement>
  onMouseLeave: () => void
  children: ReactNode
}) {
  return (
    <>
      <div className="mb-5 text-center">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div
        className="relative w-full max-w-xs rounded-md border bg-muted/40 sm:max-w-[280px]"
        style={{ height: TOWER_HEIGHT }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    </>
  )
}

/** A colored slice of a tower column, positioned by the dollar range [from, to]. */
export function Slice({
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

/** The left-side value pill marking the top of a stacked column. */
export function ColumnTotal({
  topPct,
  zClassName = 'z-20',
  children,
}: {
  topPct: number
  zClassName?: string
  children: ReactNode
}) {
  return (
    <span
      className={`pointer-events-none absolute left-1 ${zClassName} -translate-y-1/2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-800 shadow-sm ring-1 ring-black/5`}
      style={{ top: `${topPct}%` }}
    >
      {children}
    </span>
  )
}

/** A legend row: a colored source swatch, its short name, and a right-aligned amount. */
export function SourceLegendRow({
  swatch,
  label,
  amount,
  className,
}: {
  swatch: string
  label: string
  amount: number
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <span className={`size-2.5 rounded-full ${swatch}`} aria-hidden />
      <span>{label}</span>
      <span className="ml-auto text-muted-foreground">{formatCurrency(amount)}</span>
    </div>
  )
}
