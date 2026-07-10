import { useEffect, useMemo, useState } from 'react'
import { IncomeForm } from '@/components/IncomeForm'
import { ImportReturn } from '@/components/ImportReturn'
import { SavedScenarios } from '@/components/SavedScenarios'
import { ShareLinkButton } from '@/components/ShareLinkButton'
import { OrdinaryTower } from '@/components/OrdinaryTower'
import { CapitalGainsTower } from '@/components/CapitalGainsTower'
import { OverallBreakdown } from '@/components/OverallBreakdown'
import { MarginalNextDollar } from '@/components/MarginalNextDollar'
import { SurchargeIndicators } from '@/components/SurchargeIndicators'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TooltipProvider } from '@/components/ui/tooltip'
import { calculateTax } from '@/tax/calculate'
import { DEFAULT_TAX_YEAR, taxTablesFor } from '@/tax/years'
import { axisMaxFor } from '@/components/tower'
import { loadInput, saveInput, loadScenarios, saveScenarios } from '@/storage'
import {
  normalizeName,
  saveScenario,
  removeScenario,
  renameScenario,
  type Scenarios,
} from '@/scenarios'
import { parseShareHash } from '@/shareLink'
import type { TaxInput } from '@/tax/types'

const DEFAULT_INPUT: TaxInput = {
  filingStatus: 'single',
  taxYear: DEFAULT_TAX_YEAR,
  wages: 120000,
  retirementIncome: 0,
  interest: 2000,
  nonQualifiedDividends: 0,
  shortTermGains: 0,
  qualifiedDividends: 8000,
  longTermGains: 15000,
}

function App() {
  // A shared link (#v=1&filing=…) wins over any locally-saved input on first load.
  const [input, setInput] = useState<TaxInput>(
    () => parseShareHash(window.location.hash) ?? loadInput() ?? DEFAULT_INPUT,
  )
  const [scenarios, setScenarios] = useState<Scenarios>(() => loadScenarios())
  const [selectedName, setSelectedName] = useState<string | null>(null)

  // Consume the shared-link hash once applied, so a reload/edit reverts to normal
  // localStorage behavior and the address bar isn't stuck on the shared state.
  useEffect(() => {
    if (parseShareHash(window.location.hash)) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  useEffect(() => {
    saveInput(input)
  }, [input])

  useEffect(() => {
    saveScenarios(scenarios)
  }, [scenarios])

  const handleSave = (rawName: string) => {
    const name = normalizeName(rawName)
    if (!name) return
    if (scenarios[name] && !confirm(`A scenario named "${name}" already exists. Overwrite it?`)) {
      return
    }
    setScenarios((s) => saveScenario(s, name, input))
    setSelectedName(name)
  }

  const handleLoad = (name: string) => {
    const scenario = scenarios[name]
    if (!scenario) return
    setInput({ ...scenario })
    setSelectedName(name)
  }

  const handleUpdate = (name: string) => {
    if (!scenarios[name]) return
    if (!confirm(`Update "${name}" to the current inputs?`)) return
    setScenarios((s) => saveScenario(s, name, input))
    setSelectedName(name)
  }

  const handleRename = (oldName: string) => {
    const raw = prompt(`New name for "${oldName}"`, oldName)
    if (raw === null) return
    const newName = normalizeName(raw)
    if (!newName || newName === oldName) return
    if (scenarios[newName] && !confirm(`A scenario named "${newName}" already exists. Overwrite it?`)) {
      return
    }
    setScenarios((s) => renameScenario(s, oldName, newName))
    setSelectedName((prev) => (prev === oldName ? newName : prev))
  }

  const handleDelete = (name: string) => {
    if (!confirm(`Delete scenario "${name}"?`)) return
    setScenarios((s) => removeScenario(s, name))
    setSelectedName((prev) => (prev === name ? null : prev))
  }

  const result = useMemo(() => calculateTax(input), [input])
  const axisMax = useMemo(() => axisMaxFor(result), [result])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            {result.taxYear} Federal Tax Bracket Visualizer
          </h1>
          <p className="text-sm text-muted-foreground">
            See how each dollar of income fills the ordinary and capital-gains brackets — and where
            the marginal cost of the next dollar lands.
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
                  setInput(next)
                  setSelectedName(null)
                }}
              />
              <div className="mt-6 border-t pt-4">
                <IncomeForm value={input} onChange={setInput} />
              </div>
              <div className="mt-6 border-t pt-4">
                <ShareLinkButton input={input} />
              </div>
              <div className="mt-6 border-t pt-4">
                <SavedScenarios
                  scenarios={scenarios}
                  selectedName={selectedName}
                  onSave={handleSave}
                  onLoad={handleLoad}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  onUpdate={handleUpdate}
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
                  <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:gap-6">
                    <OrdinaryTower result={result} />
                    <CapitalGainsTower result={result} axisMax={axisMax} />
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
          Estimates for education, not tax advice. Federal only; excludes state tax, credits, and
          many deductions. {result.taxYear} figures per {taxTablesFor(input.taxYear).source}.
        </footer>
      </div>
    </TooltipProvider>
  )
}

export default App
