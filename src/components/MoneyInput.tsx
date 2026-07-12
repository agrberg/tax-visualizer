import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Parse the field's text buffer to a number; '', a lone '-', and any non-finite value mean 0. */
function parseAmountText(text: string): number {
  if (text === '' || text === '-') return 0
  const n = Number(text)
  // A very long pasted digit string overflows to Infinity; the rest of the app treats
  // non-finite as invalid (storage/share-link normalize it to 0), so match that here.
  return Number.isFinite(n) ? n : 0
}

/**
 * A `$`-prefixed whole-dollar input shared by the income form and the import review.
 *
 * It keeps its own text buffer rather than deriving the displayed string from the numeric
 * `value` on every render. That matters for capital-loss entry: a lone leading "-" parses
 * to 0, and a value-derived controlled input would immediately snap the field back to ""
 * and eat the minus, so a loss typed left-to-right ("-", "5", "0", "0") could never be
 * entered. The buffer lets "-" persist until digits arrive. `allowNegative` gates the sign;
 * other fields strip it. External `value` changes (import apply, reset, share link) still
 * flow in, without clobbering an in-progress edit.
 */
export function MoneyInput({
  id,
  value,
  allowNegative,
  onChange,
  className,
}: {
  id: string
  value: number
  allowNegative: boolean
  onChange: (n: number) => void
  className?: string
}) {
  const [text, setText] = useState(() => (value === 0 ? '' : String(value)))

  useEffect(() => {
    // Resync only when the external value diverges from what's typed, so a transient
    // "-" (which parses to 0) isn't wiped while the value legitimately stays 0.
    if (parseAmountText(text) !== value) setText(value === 0 ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync on external value only
  }, [value])

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        id={id}
        type="text"
        // Signed fields use the full-text keyboard so mobile shows a minus key; positive-only
        // fields keep the numeric pad. `type="text"` already; we sanitize input ourselves below.
        inputMode={allowNegative ? 'text' : 'numeric'}
        className={cn('pl-6', className)}
        value={text}
        placeholder="0"
        onChange={(e) => {
          let cleaned = e.target.value.replace(/[^0-9-]/g, '')
          // Keep at most one leading minus (only when the field allows it), then digits.
          const negative = allowNegative && cleaned.startsWith('-')
          cleaned = (negative ? '-' : '') + cleaned.replace(/-/g, '')
          setText(cleaned)
          onChange(parseAmountText(cleaned))
        }}
      />
    </div>
  )
}
