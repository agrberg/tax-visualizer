import { Lightbulb } from 'lucide-react'
import { formatCurrency, formatRatePercent } from '@/tax/format'
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
          <Row label={`NIIT (${formatRatePercent(s.rate)})`} value={`+${formatCurrency(s.amount, true)}`} strong />
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
          label={`Add'l Medicare (${formatRatePercent(s.rate)})`}
          value={`+${formatCurrency(s.amount, true)}`}
          strong
        />
      ) : (
        <p className="pt-0.5 text-muted-foreground">Wages are under the threshold — no surtax.</p>
      )}
    </dl>
  )
}

/** Social Security is *capped*: the rate applies to wages up to the wage base, then stops. */
function SocialSecurityCalc({ s }: { s: SurchargeResult }) {
  return (
    <dl className="mt-1.5 space-y-0.5 text-xs">
      <Row label="Wages" value={formatCurrency(s.incomeMeasured)} />
      <Row label="Wage base cap" value={formatCurrency(s.cap ?? 0)} />
      {s.applies ? (
        <>
          <Row label="Taxed (up to the cap)" value={formatCurrency(s.taxedAmount)} />
          {s.incomeOverThreshold > 0 && (
            <Row label="Above cap (untaxed)" value={formatCurrency(s.incomeOverThreshold)} />
          )}
          <Row
            label={`Social Security (${formatRatePercent(s.rate)})`}
            value={`+${formatCurrency(s.amount, true)}`}
            strong
          />
        </>
      ) : (
        <p className="pt-0.5 text-muted-foreground">No wages — no Social Security tax.</p>
      )}
    </dl>
  )
}

/** Base Medicare is a flat rate on all wages — no cap, no threshold. */
function MedicareBaseCalc({ s }: { s: SurchargeResult }) {
  return (
    <dl className="mt-1.5 space-y-0.5 text-xs">
      <Row label="Wages" value={formatCurrency(s.incomeMeasured)} />
      {s.applies ? (
        <Row
          label={`Medicare (${formatRatePercent(s.rate)})`}
          value={`+${formatCurrency(s.amount, true)}`}
          strong
        />
      ) : (
        <p className="pt-0.5 text-muted-foreground">No wages — no Medicare tax.</p>
      )}
    </dl>
  )
}

/** The calculation panel for a surcharge, chosen by its rule key. */
function SurchargeCalc({ s }: { s: SurchargeResult }) {
  switch (s.key) {
    case 'socialSecurity':
      return <SocialSecurityCalc s={s} />
    case 'medicare':
      return <MedicareBaseCalc s={s} />
    case 'niit':
      return <NiitCalc s={s} />
    default:
      return <MedicareCalc s={s} />
  }
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
        <div className="flex items-start justify-between gap-2 text-sm font-semibold">
          <span className="min-w-0">{title}</span>
          <span
            className={cn(
              'mt-0.5 shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
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
  socialSecurity: '6.2% on wages up to the annual wage base, then 0%.',
  medicare: '1.45% on all wages — no cap.',
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
          <SurchargeCalc s={s} />
        </Indicator>
      ))}
    </div>
  )
}
