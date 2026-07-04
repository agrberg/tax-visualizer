import { Info } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { FILING_STATUS_LABELS } from '@/tax/brackets'
import { SOURCE_META } from '@/tax/format'
import type { FilingStatus, IncomeSource, TaxInput } from '@/tax/types'

const FILING_STATUSES: FilingStatus[] = ['single', 'mfj', 'hoh', 'mfs']

const ORDINARY_FIELDS: IncomeSource[] = [
  'wages',
  'interest',
  'nonQualifiedDividends',
  'shortTermGains',
]
const PREFERENTIAL_FIELDS: IncomeSource[] = ['qualifiedDividends', 'longTermGains']

interface IncomeFormProps {
  value: TaxInput
  onChange: (next: TaxInput) => void
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
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground" aria-label={`About ${meta.label}`}>
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-60">{meta.hint}</TooltipContent>
        </Tooltip>
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          id={source}
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          className="pl-6"
          value={value === 0 ? '' : value}
          placeholder="0"
          onChange={(e) => {
            const n = e.target.valueAsNumber
            onChange(Number.isNaN(n) ? 0 : Math.max(0, n))
          }}
        />
      </div>
    </div>
  )
}

export function IncomeForm({ value, onChange }: IncomeFormProps) {
  const set = (patch: Partial<TaxInput>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-6">
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
    </div>
  )
}
