import { useRef, useState } from 'react'
import { FileUp, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { MoneyInput } from '@/components/MoneyInput'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SOURCE_META } from '@/tax/format'
import { FILING_STATUS_LABELS, FILING_STATUSES, isFilingStatus } from '@/tax/filingStatus'
import { AVAILABLE_YEARS } from '@/tax/years'
import { ALL_SOURCES, allowsNegativeAmount, type IncomeSource, type TaxInput } from '@/tax/types'
import { parse1040 } from '@/import/parse1040'
import { mergeParsedInput, type ParsedReturn } from '@/import/parsedReturn'
import { DeductionControl } from '@/components/DeductionControl'

const MAX_BYTES = 10 * 1024 * 1024

interface ImportReturnProps {
  current: TaxInput
  onApply: (next: TaxInput) => void
}

interface Review {
  draft: TaxInput
  provenance: ParsedReturn['provenance']
  // Field names present in the parsed return. A plain string set: it's only ever queried by
  // `.has(...)` with known TaxInput keys, so widening avoids an unsound `keyof TaxInput` cast
  // over `Object.keys` (which is typed `string[]`).
  detected: Set<string>
  warnings: string[]
}

export function ImportReturn({ current, onApply }: ImportReturnProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)

  async function handleFile(file: File) {
    if (parsing) return
    setError(null)
    setNotice(null)
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That file is larger than 10 MB — please choose a smaller PDF.')
      return
    }
    setParsing(true)
    try {
      const result = await parse1040(file)
      const detected = new Set(Object.keys(result.fields))
      // The PDF read fine but no income figures came out (scanned image / odd layout).
      // Skip the editing modal — it would be a wall of empty fields that reads as success.
      // Point the user at the by-hand fallback below instead.
      if (!ALL_SOURCES.some((s) => detected.has(s))) {
        setNotice(
          "We couldn't read income figures from this PDF — it may be a scanned image or an unusual layout. You can enter your values by hand below.",
        )
        return
      }
      // Seed the draft from a zeroed income base (keeping filing status / tax year)
      // so undetected sources start at 0 — matching the "Not found on your return"
      // hint — rather than silently carrying the current/default amounts into the
      // imported scenario. Detected fields overlay on top.
      const zeroedBase: TaxInput = { ...current }
      for (const source of ALL_SOURCES) zeroedBase[source] = 0
      // Reset the deduction to standard too, so an undetected line 12 matches the review's
      // "defaulting to standard deduction" hint rather than silently carrying the current value.
      zeroedBase.deduction = null
      setReview({
        // A capital loss keeps its sign through the review and Apply; the engine nets it.
        draft: mergeParsedInput(zeroedBase, result.fields),
        provenance: result.provenance,
        detected,
        warnings: result.warnings,
      })
    } catch (err) {
      console.error('[1040 import] parse failed:', err)
      setError("Couldn't read that PDF. You can still enter your values by hand.")
    } finally {
      setParsing(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  function setField(patch: Partial<TaxInput>) {
    setReview((r) => (r ? { ...r, draft: { ...r.draft, ...patch } } : r))
  }

  function apply() {
    if (!review) return
    onApply(mergeParsedInput(current, review.draft))
    setReview(null)
  }

  return (
    <>
      <div className="space-y-2">
        <div className="text-sm font-medium">Start from last year's return</div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          className={`flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed px-3 py-6 text-center text-sm transition-colors ${
            dragging ? 'border-primary bg-primary/5' : 'border-input hover:bg-accent'
          }`}
        >
          <Upload className="size-5 text-muted-foreground" />
          <span className="text-muted-foreground">
            {parsing ? 'Reading…' : 'Drop your 1040 PDF here, or click to choose'}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
        <p className="text-xs text-destructive" aria-live="polite">{error}</p>
        {notice && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900" aria-live="polite">
            {notice}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Reads income figures only, in your browser — nothing is uploaded. You'll confirm the values
          before they're applied.
        </p>
      </div>

      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        labelledBy="import-review-title"
        header={
          review && (
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div
                  id="import-review-title"
                  className="flex items-center gap-2 text-base font-medium"
                >
                  <FileUp className="size-4" />
                  Review imported values
                </div>
                <p className="text-xs text-muted-foreground">
                  Found {ALL_SOURCES.filter((s) => review.detected.has(s)).length} of{' '}
                  {ALL_SOURCES.length} income figures from your {review.draft.taxYear} return. Edit
                  anything below, then apply.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setReview(null)}
                className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        }
        footer={
          review && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setReview(null)}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" onClick={apply}>
                Import
              </Button>
            </div>
          )
        }
      >
        {review && (
          <div className="space-y-4">
            {review.warnings.length > 0 && (
              <ul className="space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                {review.warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="import-filing-status" className="text-sm">Filing status</Label>
              <Select
                value={review.draft.filingStatus}
                onValueChange={(v) => { if (isFilingStatus(v)) setField({ filingStatus: v }) }}
              >
                <SelectTrigger id="import-filing-status" className="w-full">
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
              <DetectedNote
                detected={review.detected.has('filingStatus')}
                provenance={review.provenance.filingStatus}
                fallback="Couldn't detect — please choose"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-tax-year" className="text-sm">Tax year</Label>
              <Select value={String(review.draft.taxYear)} onValueChange={(v) => setField({ taxYear: Number(v) })}>
                <SelectTrigger id="import-tax-year" className="w-full">
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
              <DetectedNote
                detected={review.detected.has('taxYear')}
                provenance={review.provenance.taxYear}
                fallback="Couldn't detect — please choose"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Deduction</p>
              <DeductionControl
                value={review.draft.deduction}
                onChange={(d) => setField({ deduction: d })}
                filingStatus={review.draft.filingStatus}
                taxYear={review.draft.taxYear}
              />
              <DetectedNote
                detected={review.detected.has('deduction')}
                provenance={
                  // Derive live from the current draft so editing the control in the modal
                  // never leaves a stale "standard" note. Guard the interpolation so a detected
                  // field with no provenance string doesn't render "undefined — ...".
                  review.provenance.deduction && review.draft.deduction === null
                    ? `${review.provenance.deduction} — using the standard deduction`
                    : review.provenance.deduction
                }
                fallback="Couldn't detect — defaulting to standard deduction"
              />
            </div>

            {ALL_SOURCES.map((source) => {
              const detected = review.detected.has(source)
              return (
                <ReviewMoneyField
                  key={source}
                  source={source}
                  value={review.draft[source]}
                  detected={detected}
                  provenance={detected ? review.provenance[source] : undefined}
                  onChange={(n) => setField({ [source]: n })}
                />
              )
            })}
          </div>
        )}
      </Modal>
    </>
  )
}

function ReviewMoneyField({
  source,
  value,
  detected,
  provenance,
  onChange,
}: {
  source: IncomeSource
  value: number
  detected: boolean
  provenance: string | undefined
  onChange: (n: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className={`size-2.5 rounded-full ${SOURCE_META[source].swatch}`} aria-hidden />
        <Label htmlFor={`import-${source}`} className="text-sm">
          {SOURCE_META[source].label}
        </Label>
      </div>
      <MoneyInput
        id={`import-${source}`}
        value={value}
        allowNegative={allowsNegativeAmount(source)}
        onChange={onChange}
      />
      <DetectedNote
        detected={detected}
        provenance={provenance}
        fallback="Not found on your return — enter if it applies"
      />
    </div>
  )
}

/**
 * The provenance line under a reviewed field: a green "from <source>" when the value was
 * detected (nothing if detected but the source is unknown), or a muted fallback when it wasn't.
 */
function DetectedNote({
  detected,
  provenance,
  fallback,
}: {
  detected: boolean
  provenance: string | undefined
  fallback: string
}) {
  if (detected) {
    return provenance ? <p className="text-xs text-emerald-700">from {provenance}</p> : null
  }
  return <p className="text-xs text-muted-foreground/70">{fallback}</p>
}
