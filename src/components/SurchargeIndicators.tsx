import { Lightbulb } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/tax/format'
import type { SurchargeResult } from '@/tax/types'
import { cn } from '@/lib/utils'

interface IndicatorProps {
  title: string
  description: string
  /** What the rate is applied to, e.g. "net investment income" or "wages". */
  baseNoun: string
  surcharge: SurchargeResult
}

function Indicator({ title, description, baseNoun, surcharge }: IndicatorProps) {
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
          on ? 'fill-amber-300 text-amber-500 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]' : 'text-muted-foreground/50',
        )}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {title}
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
              on ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground',
            )}
          >
            {on ? 'Applies' : 'Not triggered'}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        <p className="mt-1 text-xs">
          {on ? (
            <>
              <span className="font-medium text-amber-700 dark:text-amber-400">
                +{formatCurrency(surcharge.amount, true)}
              </span>{' '}
              — {formatPercent(surcharge.rate, 1)} on {formatCurrency(surcharge.taxedAmount)} of{' '}
              {baseNoun} (over the {formatCurrency(surcharge.threshold)} threshold)
            </>
          ) : (
            <>Kicks in above {formatCurrency(surcharge.threshold)}</>
          )}
        </p>
      </div>
    </div>
  )
}

interface Props {
  niit: SurchargeResult
  additionalMedicare: SurchargeResult
}

export function SurchargeIndicators({ niit, additionalMedicare }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Indicator
        title="Net Investment Income Tax"
        description="3.8% surtax on the lesser of net investment income and MAGI over the threshold."
        baseNoun="net investment income"
        surcharge={niit}
      />
      <Indicator
        title="Additional Medicare Tax"
        description="0.9% surtax on earned income (wages) above the threshold."
        baseNoun="wages"
        surcharge={additionalMedicare}
      />
    </div>
  )
}
