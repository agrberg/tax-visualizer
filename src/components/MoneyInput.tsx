import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { parseAmountText, sanitizeAmountText } from './amountText';

/**
 * A `$`-prefixed whole-dollar input shared by the income form and the import review.
 *
 * It keeps its own text buffer rather than deriving the displayed string from the numeric
 * `value` on every render. That matters for capital-loss entry: a lone leading "-" parses
 * to 0, and a value-derived controlled input would immediately snap the field back to ""
 * and eat the minus, so a loss typed left-to-right ("-", "5", "0", "0") could never be
 * entered. The buffer lets "-" persist until digits arrive. `allowNegative` gates the sign;
 * other fields strip it. External `value` changes (import apply, reset, share link) are
 * folded into the buffer during render, without clobbering an in-progress edit.
 */
export function MoneyInput({
  id,
  value,
  allowNegative,
  onChange,
  className,
  describedBy,
  ariaLabel,
}: {
  id: string;
  value: number;
  allowNegative: boolean;
  onChange: (n: number) => void;
  className?: string;
  describedBy?: string;
  /** Accessible name for callers without a visible <label htmlFor> (e.g. the deduction inputs). */
  ariaLabel?: string;
}) {
  const [text, setText] = useState(() => (value === 0 ? '' : String(value)));
  const [lastValue, setLastValue] = useState(value);

  // Fold an external `value` change into the buffer during render rather than in an Effect —
  // an Effect would commit one stale frame with the old text first. Resync only when the
  // external value diverges from what's typed, so a transient "-" (which parses to 0) isn't
  // wiped while the value legitimately stays 0.
  if (value !== lastValue) {
    setLastValue(value);
    if (parseAmountText(text) !== value) setText(value === 0 ? '' : String(value));
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        id={id}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        type="text"
        // Signed fields use the full-text keyboard so mobile shows a minus key; positive-only
        // fields keep the numeric pad. `type="text"` already; we sanitize input ourselves below.
        inputMode={allowNegative ? 'text' : 'numeric'}
        className={cn('pl-6', className)}
        value={text}
        placeholder="0"
        onChange={(e) => {
          const cleaned = sanitizeAmountText(e.target.value, allowNegative);
          setText(cleaned);
          onChange(parseAmountText(cleaned));
        }}
        onBlur={() => {
          // A lone "-" parses to 0; clear it on blur so the field doesn't display a minus
          // that the stored value (and share links) don't reflect.
          if (text === '-') setText('');
        }}
      />
    </div>
  );
}
