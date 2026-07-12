import { useState, type ReactNode } from 'react'
import { compositionSegments, formatCurrency, formatPercent, taxComponents } from '@/tax/format'
import type { TaxResult } from '@/tax/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CompositionRibbon } from './CompositionRibbon'
import { CompositionMarimekko } from './CompositionMarimekko'
import { Swatch } from './TowerParts'

interface Props {
  result: TaxResult
}

type CompositionView = 'bars' | 'marimekko' | 'both'

const COMPOSITION_VIEWS: { value: CompositionView; label: string }[] = [
  { value: 'bars', label: 'Paired bars' },
  { value: 'marimekko', label: 'Marimekko' },
  { value: 'both', label: 'Both' },
]

export function OverallBreakdown({ result }: Props) {
  const segments = compositionSegments(result)
  const total = result.totalIncome
  const takeHome = total - result.totalTax
  const hasTax = result.totalTax > 0
  const [view, setView] = useState<CompositionView>('bars')

  // The headline total and effective rate fold income tax, payroll tax (FICA), and
  // surtaxes into one number; a hover breaks them apart so the blend is legible.
  const components = taxComponents(result).filter((c) => c.amount > 0)
  // True when FICA/surtaxes fold into a source's "Tax" column below (e.g. wages carry FICA).
  const sourceTaxIncludesSurcharges = components.some((c) => c.key !== 'income')
  const taxBreakout = hasTax ? (
    <div>
      <div className="font-medium">Total tax by type</div>
      <div className="mb-1.5 opacity-70">Income tax spans every source; payroll tax is on wages only.</div>
      <table className="w-full">
        <tbody>
          {components.map((c) => (
            <tr key={c.key}>
              <td className="py-0.5 pr-3">{c.label}</td>
              <td className="py-0.5 pr-3 text-right tabular-nums">{formatCurrency(c.amount)}</td>
              <td className="py-0.5 text-right tabular-nums opacity-80">
                {total > 0 ? formatPercent(c.amount / total, 1) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-medium">
            <td className="py-0.5 pr-3">Total</td>
            <td className="py-0.5 pr-3 text-right tabular-nums">{formatCurrency(result.totalTax)}</td>
            <td className="py-0.5 text-right tabular-nums">{formatPercent(result.effectiveRate, 1)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-1.5 opacity-70">
        The source table below splits this same total by income source instead — each source's
        tax there includes its share of payroll tax and surtaxes.
      </div>
    </div>
  ) : null

  return (
    <div className="space-y-4">
      {/* headline stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat label="Total income" value={formatCurrency(total)} />
        <Stat label="Total tax" value={formatCurrency(result.totalTax)} tooltip={taxBreakout} />
        <Stat label="Take-home" value={formatCurrency(takeHome)} />
        <Stat
          label="Weighted rate"
          value={formatPercent(result.effectiveRate, 1)}
          tooltip={taxBreakout}
          emphasis
        />
      </div>

      {/* income & tax composition — switch between the two views */}
      {total > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium">
              {hasTax ? 'Income & tax composition' : 'Income composition'}
            </div>
            {hasTax && (
              <div className="inline-flex w-fit rounded-md border p-0.5 text-xs">
                {COMPOSITION_VIEWS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setView(o.value)}
                    className={`rounded px-2 py-1 transition-colors ${
                      view === o.value
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-5">
            {(!hasTax || view === 'bars' || view === 'both') && <CompositionRibbon result={result} />}
            {hasTax && (view === 'marimekko' || view === 'both') && (
              <CompositionMarimekko result={result} />
            )}
          </div>
        </div>
      )}

      {/* per-source table */}
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-1 font-medium">Source</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Amount</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Tax</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Take-home</th>
            <th className="pb-1 pl-2 text-right font-medium sm:pl-3">Eff. rate</th>
          </tr>
        </thead>
        <tbody>
          {segments.length === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-center text-muted-foreground">
                Enter income to see the breakdown.
              </td>
            </tr>
          )}
          {segments.map((s) => (
            <tr key={s.key} className="border-t">
              <td className="py-1.5">
                <span className="flex items-center gap-1.5">
                  <Swatch colors={s.colors} />
                  {s.short}
                </span>
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(s.amount)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(s.tax)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(s.amount - s.tax)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatPercent(s.effectiveRate, 1)}
              </td>
            </tr>
          ))}
        </tbody>
        {segments.length > 0 && (
          <tfoot>
            <tr className="border-t-2 font-medium">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(total)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(result.totalTax)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatCurrency(takeHome)}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums sm:pl-3">
                {formatPercent(result.effectiveRate, 1)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {sourceTaxIncludesSurcharges && (
        <p className="text-[10px] text-muted-foreground">
          Each source's <span className="font-medium">Tax</span> is by income source — it includes
          the payroll tax (FICA) and surtaxes attributed to it (e.g. FICA on wages), so it is more
          than income tax alone. Hover <span className="font-medium">Total tax</span> to see the
          split by kind of tax.
        </p>
      )}

      {segments.some((s) => s.key === 'ordinaryInvestment') && (
        <p className="text-[10px] text-muted-foreground">
          Interest, non-qualified dividends, and short-term gains are all ordinary income taxed
          identically — grouped here. Any per-source rate differences reflect stacking order, not
          the tax treatment.
        </p>
      )}

      <CapitalLossNote capitalGains={result.capitalGains} />
    </div>
  )
}

/**
 * A capital loss nets away in the table above (its taxable amount is $0), so a short note
 * explains where it went: up to $3,000 / $1,500 MFS offsets ordinary income this year
 * (IRC §1211(b)); the rest carries forward (IRC §1212(b)), which this tool reports but
 * doesn't yet apply.
 */
function CapitalLossNote({ capitalGains }: { capitalGains: TaxResult['capitalGains'] }) {
  const carryover = capitalGains.carryover.shortTerm + capitalGains.carryover.longTerm
  const deduction = capitalGains.lossDeduction
  if (deduction <= 0 && carryover <= 0) return null
  return (
    <p className="text-[10px] text-muted-foreground">
      Your capital gains net to a loss.{' '}
      {deduction > 0 ? (
        <>
          {formatCurrency(deduction)} offsets ordinary income this year (the annual limit is $3,000;
          $1,500 if married filing separately)
          {carryover > 0 && <> and {formatCurrency(carryover)} would carry to future years</>}.
        </>
      ) : (
        <>
          None of it offsets income this year (taxable income is already $0), so the full{' '}
          {formatCurrency(carryover)} would carry to future years.
        </>
      )}{' '}
      Loss carryovers aren&apos;t applied yet.
    </p>
  )
}

function Stat({
  label,
  value,
  tooltip,
  emphasis = false,
}: {
  label: string
  value: string
  tooltip?: ReactNode
  emphasis?: boolean
}) {
  const card = (
    <div
      className={`flex h-full flex-col rounded-lg border p-2 sm:p-3 ${
        tooltip ? 'cursor-pointer' : ''
      }`}
    >
      <div className="text-xs text-muted-foreground">
        {label}
        {tooltip && (
          <span aria-hidden className="ml-1 text-muted-foreground/60">
            ⓘ
          </span>
        )}
      </div>
      <div
        className={`mt-auto pt-1 ${
          emphasis ? 'text-lg font-bold sm:text-xl' : 'text-base font-semibold sm:text-lg'
        }`}
      >
        {value}
      </div>
    </div>
  )
  if (!tooltip) return card
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="block h-full w-full text-left">
          {card}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-xs">{tooltip}</PopoverContent>
    </Popover>
  )
}
