import { useId } from 'react';
import { cn } from '@/lib/utils';
import { MoneyInput } from '@/components/MoneyInput';
import { taxTablesFor } from '@/tax/years';
import { formatCurrency } from '@/tax/format';
import type { FilingStatus } from '@/tax/types';

interface DeductionControlProps {
  value: number | null;
  onChange: (v: number | null) => void;
  filingStatus: FilingStatus;
  taxYear: number;
}

/**
 * Choose between the standard deduction (default) and an itemized amount. A two-segment radio
 * group ("Standard" / "Itemized") backed by native radios for single-select semantics and
 * arrow-key navigation. Standard shows the amount as help text; Itemized swaps in a MoneyInput
 * pre-seeded with the standard amount. The text and input share a height (min-h-9, matching
 * the input) so toggling between them doesn't shift the layout.
 *
 * Domain note: the standard deduction is a floor every filer can take, so itemizing only helps
 * when the total exceeds it — a rational filer's deduction is always >= standard. We seed the
 * itemized field from the standard and still allow any value >= 0 without warning; entering
 * less than the standard is the user's call.
 *
 * `useId` names the radio group per instance so two controls on the page — the income form and
 * the import review modal — don't merge into one native radio group.
 */
export function DeductionControl({ value, onChange, filingStatus, taxYear }: DeductionControlProps) {
  const groupName = useId();
  const inputId = useId();
  const standardAmount = taxTablesFor(taxYear).standardDeduction[filingStatus];
  const isItemized = value !== null;

  const segment = (label: string, active: boolean, onSelect: () => void) => (
    <label className="flex-1">
      <input type="radio" name={groupName} className="peer sr-only" checked={active} onChange={onSelect} />
      <span
        className={cn(
          'block cursor-pointer px-3 py-1.5 text-center text-sm transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-inset',
          active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
        )}
      >
        {label}
      </span>
    </label>
  );

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Deduction type"
        className="flex overflow-hidden rounded-md border border-input"
      >
        {segment('Standard', !isItemized, () => onChange(null))}
        {segment('Itemized', isItemized, () => onChange(standardAmount))}
      </div>
      {isItemized ? (
        <MoneyInput
          id={inputId}
          value={value}
          allowNegative={false}
          ariaLabel="Itemized deduction amount"
          onChange={onChange}
        />
      ) : (
        <p className="flex min-h-9 items-center text-xs text-muted-foreground">
          Standard deduction: {formatCurrency(standardAmount)}
        </p>
      )}
    </div>
  );
}
