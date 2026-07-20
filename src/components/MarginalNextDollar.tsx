import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { marginalNextDollar } from '@/tax/calculate';
import type { MarginalScenario, TaxResult } from '@/tax/types';

const cents = (rate: number) => `${(rate * 100).toFixed(1)}¢`;
// Surtax component rates need exact precision (e.g. Medicare 1.45¢), trailing zeros trimmed.
const centsExact = (rate: number) => `${+(rate * 100).toFixed(2)}¢`;
// The whole dollar kept reads as "$1", not "100.0¢".
const keepLabel = (kept: number) => (kept >= 1 ? '$1' : cents(kept));
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LABELS: Record<MarginalScenario['key'], { label: string; baseLabel: string; hint: string }> = {
  wages: {
    label: 'Wages / earned income',
    baseLabel: 'income tax',
    hint: 'W-2 wages and self-employment income. Taxed at ordinary rates plus FICA — Social Security and Medicare.',
  },
  ordinaryInvestment: {
    label: 'Interest & non-qual. div.',
    baseLabel: 'income tax',
    hint: 'Taxable interest, non-qualified dividends, and short-term capital gains. Ordinary rates, and counted as net investment income (NIIT).',
  },
  retirement: {
    label: 'Retirement',
    baseLabel: 'income tax',
    hint: 'RMDs, pensions, and traditional IRA/401(k) withdrawals. Ordinary rates — not earned income (no FICA) and not investment income (no NIIT).',
  },
  preferential: {
    label: 'Qualified div. & LT gains',
    baseLabel: 'cap-gains tax',
    hint: 'Qualified dividends and long-term capital gains. Taxed on the preferential 0 / 15 / 20% capital-gains ladder.',
  },
};

/** A component of the next dollar: its color, label, and cents — for the receipt rows. */
interface Part {
  label: string;
  value: string;
  dot: string;
  bump?: boolean;
}

/** What the next $1 of each income type costs in tax, with surtaxes broken out. */
export function MarginalNextDollar({ result }: { result: TaxResult }) {
  const scenarios = marginalNextDollar(result);

  return (
    <div className="divide-y">
      {scenarios.map((s) => {
        const meta = LABELS[s.key];
        const kept = Math.max(0, 1 - s.totalRate);
        const noTax = s.totalRate <= 0;

        // Receipt rows: base tax, each surtax, then what's kept — colors match the bar.
        const parts: Part[] = [];
        if (s.baseRate > 0) {
          parts.push({ label: capitalize(meta.baseLabel), value: cents(s.baseRate), dot: 'bg-slate-500' });
        }
        for (const su of s.surtaxes) {
          parts.push({
            label: su.label,
            value: centsExact(su.rate),
            dot: su.tone === 'bump' ? 'bg-violet-500' : 'bg-amber-500',
            bump: su.tone === 'bump',
          });
        }
        parts.push({ label: 'Keep', value: cents(kept), dot: 'bg-emerald-500' });

        return (
          <div key={s.key} className="py-4 first:pt-0 last:pb-0">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <span className="flex items-center gap-1 text-sm font-medium">
                {meta.label}
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="shrink-0 text-muted-foreground" aria-label={`About ${meta.label}`}>
                      <Info className="size-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="max-w-60 text-xs">{meta.hint}</PopoverContent>
                </Popover>
              </span>
              <span className="whitespace-nowrap text-sm font-semibold">{cents(s.totalRate)} tax</span>
            </div>

            <div className="flex h-6 w-full overflow-hidden rounded-md border text-[10px] font-medium text-white">
              <div
                className="flex items-center justify-center bg-slate-500"
                style={{ width: `${s.baseRate * 100}%`, minWidth: s.baseRate > 0 ? '0.375rem' : undefined }}
              >
                {s.baseRate >= 0.08 ? cents(s.baseRate) : ''}
              </div>
              {s.surtaxes.map((su) => (
                <div
                  key={su.label}
                  className={`flex items-center justify-center ${su.tone === 'bump' ? 'bg-violet-500' : 'bg-amber-500'}`}
                  style={{ width: `${su.rate * 100}%`, minWidth: su.rate > 0 ? '0.375rem' : undefined }}
                  title={`${centsExact(su.rate)} ${su.label}`}
                >
                  {su.rate >= 0.08 ? centsExact(su.rate) : ''}
                </div>
              ))}
              <div className="flex items-center justify-center bg-emerald-500" style={{ width: `${kept * 100}%` }}>
                {kept >= 0.1 ? `keep ${keepLabel(kept)}` : ''}
              </div>
            </div>

            {noTax ? (
              <div className="mt-1.5 text-xs text-muted-foreground">No tax on the next dollar — keep the full $1.</div>
            ) : (
              <div className="mt-1.5 space-y-0.5 text-xs">
                {parts.map((p, i) => (
                  <div key={`${p.label}-${i}`} className="flex items-center gap-1.5">
                    <span className={`size-2 shrink-0 rounded-full ${p.dot}`} aria-hidden />
                    <span className={p.bump ? 'text-violet-600' : 'text-muted-foreground'}>{p.label}</span>
                    <span className="ml-auto tabular-nums text-foreground">{p.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
