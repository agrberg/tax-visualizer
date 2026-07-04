import { Lightbulb } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/tax/format'
import type { SurchargeResult } from '@/tax/types'
import { cn } from '@/lib/utils'

/** A labeled row in the calculation breakdown. */
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'font-semibold text-amber-700 dark:text-amber-400' : 'font-medium')}>
        {value}
      </dd>
    </div>
  )
}

function NiitCalc({ s }: { s: SurchargeResult }) {
  const nii = s.investmentIncome ?? 0
  const lesserIsNii = nii <= s.incomeOverThreshold
  return (
    <dl className="mt-1.5 space-y-0.5 text-xs">
      <Row label="MAGI" value={formatCurrency(s.incomeMeasured)} />
      <Row label={`Over ${formatCurrency(s.threshold)} threshold`} value={formatCurrency(s.incomeOverThreshold)} />
      <Row label="Net investment income" value={formatCurrency(nii)} />
      {s.applies ? (
        <>
          <Row
            label={`Taxed — lesser (${lesserIsNii ? 'net inv. income' : 'MAGI over threshold'})`}
            value={formatCurrency(s.taxedAmount)}
          />
          <Row label={`NIIT (${formatPercent(s.rate, 1)})`} value={`+${formatCurrency(s.amount, true)}`} strong />
        </>
      ) : (
        <p className="pt-0.5 text-muted-foreground">
          {s.incomeOverThreshold <= 0
            ? 'MAGI is under the threshold — no NIIT.'
            : 'No net investment income to tax.'}
        </p>
      )}
    </dl>
  )
}

function MedicareCalc({ s }: { s: SurchargeResult }) {
  return (
    <dl className="mt-1.5 space-y-0.5 text-xs">
      <Row label="Wages" value={formatCurrency(s.incomeMeasured)} />
      <Row label={`Over ${formatCurrency(s.threshold)} threshold`} value={formatCurrency(s.incomeOverThreshold)} />
      {s.applies ? (
        <Row
          label={`Add'l Medicare (${formatPercent(s.rate, 1)})`}
          value={`+${formatCurrency(s.amount, true)}`}
          strong
        />
      ) : (
        <p className="pt-0.5 text-muted-foreground">Wages are under the threshold — no surtax.</p>
      )}
    </dl>
  )
}

interface IndicatorProps {
  title: string
  description: string
  surcharge: SurchargeResult
  children: React.ReactNode
}

function Indicator({ title, description, surcharge, children }: IndicatorProps) {
  const on = surcharge.applies
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-colors',
        on ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/30',
      )}
    >
      <Lightbulb
        className={cn(
          'mt-0.5 size-6 shrink-0',
          on
            ? 'fill-amber-300 text-amber-500 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]'
            : 'text-muted-foreground/50',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {title}
          <span
            className={cn(
              'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
              on ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground',
            )}
          >
            {on ? 'Applies' : 'Inactive'}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        {children}
      </div>
    </div>
  )
}

/** Static blurb per surcharge, keyed by its rule key. */
const DESCRIPTIONS: Record<string, string> = {
  niit: '3.8% on the lesser of net investment income and MAGI over the threshold.',
  additionalMedicare: '0.9% on earned income (wages) above the threshold.',
}

interface Props {
  surcharges: SurchargeResult[]
}

export function SurchargeIndicators({ surcharges }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      {surcharges.map((s) => (
        <Indicator key={s.key} title={s.label} description={DESCRIPTIONS[s.key] ?? ''} surcharge={s}>
          {/* NIIT carries a net-investment-income figure (the other side of its "lesser of"); Medicare doesn't. */}
          {s.investmentIncome !== undefined ? <NiitCalc s={s} /> : <MedicareCalc s={s} />}
        </Indicator>
      ))}
    </div>
  )
}
