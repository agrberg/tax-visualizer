import { useEffect, useMemo, useState } from 'react';
import { IncomeForm } from '@/components/IncomeForm';
import { ImportReturn } from '@/components/ImportReturn';
import { ScenarioManager } from '@/components/ScenarioManager';
import { ShareLinkButton } from '@/components/ShareLinkButton';
import { OrdinaryTower } from '@/components/OrdinaryTower';
import { CapitalGainsTower } from '@/components/CapitalGainsTower';
import { OverallBreakdown } from '@/components/OverallBreakdown';
import { MarginalNextDollar } from '@/components/MarginalNextDollar';
import { SurchargeIndicators } from '@/components/SurchargeIndicators';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/tooltip';
import { calculateTax } from '@/tax/calculate';
import { DEFAULT_TAX_YEAR, taxTablesFor } from '@/tax/years';
import { axisMaxFor } from '@/components/tower';
import { loadInput, saveInput } from '@/storage';
import { parseShareHash } from '@/shareLink';
import type { TaxInput } from '@/tax/types';

// A deliberately-tuned example so a first-time visitor lands on the tool's most
// instructive state. With the 2026 single-filer tables, ordinary taxable income
// ($53k − $16.1k standard deduction = $36.9k) sits below
// the $49,450 top of the 0% capital-gains rate, while the gains stack on top of it spills
// past that ceiling — so gains are split across the 0% and 15% zones and the next ordinary
// dollar bumps a gain from 0% to 15% (a ~27% marginal cost on a 12% bracket). All seven
// sources are populated to contrast ordinary-rate short-term gains / non-qualified
// dividends against the preferential long-term gains / qualified dividends.
const DEFAULT_INPUT: TaxInput = {
  filingStatus: 'single',
  taxYear: DEFAULT_TAX_YEAR,
  wages: 40000,
  retirementIncome: 8000,
  interest: 2000,
  nonQualifiedDividends: 1000,
  shortTermGains: 2000,
  qualifiedDividends: 3000,
  longTermGains: 18000,
  deduction: null,
};

function App() {
  // A shared link (#v=1&filing=…) wins over any locally-saved input on first load.
  const [input, setInput] = useState<TaxInput>(
    () => parseShareHash(window.location.hash) ?? loadInput() ?? DEFAULT_INPUT,
  );
  // The loaded scenario's name — set by ScenarioManager on load/save, cleared here on import.
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // Consume the shared-link hash once applied, so a reload/edit reverts to normal
  // localStorage behavior and the address bar isn't stuck on the shared state.
  useEffect(() => {
    if (parseShareHash(window.location.hash)) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    saveInput(input);
  }, [input]);

  const result = useMemo(() => calculateTax(input), [input]);
  const axisMax = useMemo(() => axisMaxFor(result), [result]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-7xl overflow-x-clip px-4 py-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Federal Tax Bracket Visualizer</h1>
          <p className="text-sm text-muted-foreground">
            See how each dollar of income fills the ordinary and capital-gains brackets — and where the marginal cost of
            the next dollar lands.
          </p>
        </header>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[320px_1fr]">
          {/* inputs */}
          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-base">Your income</CardTitle>
            </CardHeader>
            <CardContent>
              <ImportReturn
                current={input}
                onApply={(next) => {
                  setInput(next);
                  setSelectedName(null);
                }}
              />
              <div className="mt-6 border-t pt-4">
                <IncomeForm value={input} onChange={setInput} capitalGains={result.capitalGains} />
              </div>
              <div className="mt-6 border-t pt-4">
                <ShareLinkButton input={input} />
              </div>
              <div className="mt-6 border-t pt-4">
                <ScenarioManager
                  input={input}
                  selectedName={selectedName}
                  onSelectedNameChange={setSelectedName}
                  onLoad={setInput}
                />
              </div>
            </CardContent>
          </Card>

          {/* visualization */}
          <div className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="text-base">Where your income goes</CardTitle>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                <div className="grid gap-8 xl:grid-cols-[1fr_18rem]">
                  <div>
                    <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:gap-6">
                      <OrdinaryTower result={result} />
                      <CapitalGainsTower result={result} axisMax={axisMax} />
                    </div>
                    <p className="mt-4 text-center text-xs text-muted-foreground">
                      Hover or tap any slice for its per-bracket breakdown.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Payroll tax &amp; surtaxes
                    </div>
                    <SurchargeIndicators surcharges={result.federal.surcharges} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="text-base">Marginal cost of the next dollar</CardTitle>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                <MarginalNextDollar result={result} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="text-base">Overall breakdown</CardTitle>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                <OverallBreakdown result={result} />
              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          Estimates for education, not tax advice. Federal only; excludes state tax, credits, and many deductions.{' '}
          {result.taxYear} figures per {taxTablesFor(input.taxYear).source}.
        </footer>
      </div>
    </TooltipProvider>
  );
}

export default App;
