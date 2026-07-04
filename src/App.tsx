import { useEffect, useMemo, useState } from 'react'
import { IncomeForm } from '@/components/IncomeForm'
import { OrdinaryTower } from '@/components/OrdinaryTower'
import { CapitalGainsTower } from '@/components/CapitalGainsTower'
import { OverallBreakdown } from '@/components/OverallBreakdown'
import { MarginalNextDollar } from '@/components/MarginalNextDollar'
import { SurchargeIndicators } from '@/components/SurchargeIndicators'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TooltipProvider } from '@/components/ui/tooltip'
import { calculateTax } from '@/tax/calculate'
import { TAX_YEAR } from '@/tax/brackets'
import { axisMaxFor } from '@/components/tower'
import { loadInput, saveInput } from '@/storage'
import type { TaxInput } from '@/tax/types'

const DEFAULT_INPUT: TaxInput = {
  filingStatus: 'single',
  wages: 120000,
  interest: 2000,
  nonQualifiedDividends: 0,
  shortTermGains: 0,
  qualifiedDividends: 8000,
  longTermGains: 15000,
}

function App() {
  const [input, setInput] = useState<TaxInput>(() => loadInput() ?? DEFAULT_INPUT)

  useEffect(() => {
    saveInput(input)
  }, [input])

  const result = useMemo(() => calculateTax(input), [input])
  const axisMax = useMemo(() => axisMaxFor(result), [result])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            {TAX_YEAR} Federal Tax Bracket Visualizer
          </h1>
          <p className="text-sm text-muted-foreground">
            See how each dollar of income fills the ordinary and capital-gains brackets — and where
            the marginal cost of the next dollar lands.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* inputs */}
          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-base">Your income</CardTitle>
            </CardHeader>
            <CardContent>
              <IncomeForm value={input} onChange={setInput} />
            </CardContent>
          </Card>

          {/* visualization */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Where your income goes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-8 xl:grid-cols-[1fr_18rem]">
                  <div className="flex flex-wrap justify-center gap-8 sm:justify-start">
                    <OrdinaryTower result={result} axisMax={axisMax} />
                    <CapitalGainsTower result={result} axisMax={axisMax} />
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Threshold surtaxes
                    </div>
                    <SurchargeIndicators
                      niit={result.niit}
                      additionalMedicare={result.additionalMedicare}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Marginal cost of the next dollar</CardTitle>
              </CardHeader>
              <CardContent>
                <MarginalNextDollar result={result} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Overall breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <OverallBreakdown result={result} />
              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          Estimates for education, not tax advice. Federal only; excludes state tax, credits, and
          many deductions. {TAX_YEAR} figures per IRS Rev. Proc. 2025-32.
        </footer>
      </div>
    </TooltipProvider>
  )
}

export default App
