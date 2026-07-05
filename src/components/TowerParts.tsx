import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { blendBackground, formatCurrency, formatPercent } from '@/tax/format'
import type { BracketFill } from '@/tax/types'

/** A small color dot: solid for one color, diagonal stripes when a bucket blends two. */
export function Swatch({ hexes, className }: { hexes: string[]; className?: string }) {
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${className ?? ''}`}
      style={blendBackground(hexes, { stripe: 3 })}
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
