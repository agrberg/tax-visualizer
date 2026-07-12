import { type ReactNode } from 'react'
import { Info } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/MoneyInput'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { FILING_STATUS_LABELS, FILING_STATUSES } from '@/tax/filingStatus'
import { AVAILABLE_YEARS } from '@/tax/years'
import { SOURCE_META, formatCurrency } from '@/tax/format'
import {
  allowsNegativeAmount,
  type FilingStatus,
  type IncomeSource,
  type TaxInput,
  type TaxResult,
} from '@/tax/types'

const ORDINARY_FIELDS: IncomeSource[] = [
  'wages',
  'retirementIncome',
  'interest',
  'nonQualifiedDividends',
  'shortTermGains',
]
const PREFERENTIAL_FIELDS: IncomeSource[] = ['qualifiedDividends', 'longTermGains']

interface IncomeFormProps {
  value: TaxInput
  onChange: (next: TaxInput) => void
  /** The engine's capital-gains netting summary for the current input, for the netting note. */
  capitalGains: TaxResult['capitalGains']
}

function MoneyField({
  source,
  value,
  onChange,
}: {
  source: IncomeSource
  value: number
  onChange: (n: number) => void
}) {
  const meta = SOURCE_META[source]
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`size-2.5 rounded-full ${meta.swatch}`} aria-hidden />
        <Label htmlFor={source} className="text-sm">
          {meta.label}
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="text-muted-foreground" aria-label={`About ${meta.label}`}>
              <Info className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="max-w-60 text-xs">{meta.hint}</PopoverContent>
        </Popover>
      </div>
      <MoneyInput
        id={source}
        value={value}
        allowNegative={allowsNegativeAmount(source)}
        onChange={onChange}
        describedBy={`${source}-hint`}
      />
      {/* Same copy as the ⓘ popover, exposed to assistive tech on focus (the popover
          content isn't in the DOM until opened). */}
      <span id={`${source}-hint`} className="sr-only">
        {meta.hint}
      </span>
    </div>
  )
}

/**
 * Explains what the engine did with a capital *loss*: short- and long-term results net
 * against each other first (IRS Schedule D), and a residual net loss offsets income up to
 * $3,000 / $1,500 MFS (IRC §1211(b)) — limited by taxable income — with the rest carried
 * forward (IRC §1212(b)), which this single-year tool reports but doesn't yet apply. Shown
 * only when netting changed a taxable amount — i.e. a loss was present on at least one leg,
 * whether it merely offset a gain or produced a net loss. Reads the engine's already-computed
 * summary rather than recomputing, so form and results never disagree.
 */
function CapitalNettingNote({ capitalGains }: { capitalGains: TaxResult['capitalGains'] }) {
  const { netShortTerm, netLongTerm, taxableShortTerm, taxableLongTerm, lossDeduction, carryover } =
    capitalGains
  const changed = netShortTerm !== taxableShortTerm || netLongTerm !== taxableLongTerm
  if (!changed) return null

  const carryoverTotal = carryover.shortTerm + carryover.longTerm

  let body: ReactNode
  if (lossDeduction <= 0 && carryoverTotal <= 0) {
    // A loss was present on a leg but only offset a gain — nothing left to deduct or carry.
    body = (
      <p>
        A capital loss offset part of your gains. Taxed after netting:{' '}
        {formatCurrency(taxableShortTerm)} short-term, {formatCurrency(taxableLongTerm)} long-term.
      </p>
    )
  } else if (lossDeduction > 0) {
    body = (
      <p>
        Your capital results net to a loss. {formatCurrency(lossDeduction)} offsets ordinary income
        this year (max $3,000; $1,500 if filing separately)
        {carryoverTotal > 0 && <> and {formatCurrency(carryoverTotal)} would carry to future years</>}.{' '}
        Loss carryovers aren&apos;t applied yet, so any carryover is informational.
      </p>
    )
  } else {
    body = (
      <p>
        Your capital results net to a loss. None offsets income this year (taxable income is already
        $0), so the full {formatCurrency(carryoverTotal)} would carry to future years. Loss carryovers
        aren&apos;t applied yet, so any carryover is informational.
      </p>
    )
  }

  return (
    <div role="note" className="space-y-1 rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Capital gains netted</p>
      {body}
    </div>
  )
}

export function IncomeForm({ value, onChange, capitalGains }: IncomeFormProps) {
  const set = (patch: Partial<TaxInput>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="taxYear" className="text-sm">
          Tax year
        </Label>
        <Select
          value={String(value.taxYear)}
          onValueChange={(v) => set({ taxYear: Number(v) })}
        >
          <SelectTrigger id="taxYear" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AVAILABLE_YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filingStatus" className="text-sm">
          Filing status
        </Label>
        <Select
          value={value.filingStatus}
          onValueChange={(v) => set({ filingStatus: v as FilingStatus })}
        >
          <SelectTrigger id="filingStatus" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {FILING_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ordinary income (marginal rates)
        </legend>
        {ORDINARY_FIELDS.map((f) => (
          <MoneyField key={f} source={f} value={value[f]} onChange={(n) => set({ [f]: n })} />
        ))}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preferential income (0 / 15 / 20%)
        </legend>
        {PREFERENTIAL_FIELDS.map((f) => (
          <MoneyField key={f} source={f} value={value[f]} onChange={(n) => set({ [f]: n })} />
        ))}
      </fieldset>

      <CapitalNettingNote capitalGains={capitalGains} />
    </div>
  )
}
