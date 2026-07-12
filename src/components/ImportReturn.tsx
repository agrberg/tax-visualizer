import { useRef, useState } from 'react'
import { FileUp, Upload } from 'lucide-react'
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

const MAX_BYTES = 10 * 1024 * 1024

interface ImportReturnProps {
  current: TaxInput
  onApply: (next: TaxInput) => void
}

interface Review {
  draft: TaxInput
  provenance: ParsedReturn['provenance']
  detected: Set<keyof TaxInput>
  warnings: string[]
}

export function ImportReturn({ current, onApply }: ImportReturnProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)

  async function handleFile(file: File) {
    if (parsing) return
    setError(null)
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
      setReview({
        // A capital loss keeps its sign through the review and Apply; the engine nets it.
        draft: mergeParsedInput(current, result.fields),
        provenance: result.provenance,
        detected: new Set(Object.keys(result.fields) as (keyof TaxInput)[]),
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
        <p className="text-xs text-muted-foreground">
          Reads income figures only, in your browser — nothing is uploaded. You'll confirm the values
          before they're applied.
        </p>
      </div>

      <Modal open={!!review} onClose={() => setReview(null)} labelledBy="import-review-title">
        {review && (
          <div className="space-y-4">
            <div id="import-review-title" className="flex items-center gap-2 text-base font-medium">
              <FileUp className="size-4" />
              Review imported values
            </div>

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
              {review.detected.has('filingStatus') && review.provenance.filingStatus && (
                <p className="text-xs text-muted-foreground">from {review.provenance.filingStatus}</p>
              )}
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
              {review.detected.has('taxYear') && review.provenance.taxYear && (
                <p className="text-xs text-muted-foreground">from {review.provenance.taxYear}</p>
              )}
            </div>

            {ALL_SOURCES.map((source) => (
              <ReviewMoneyField
                key={source}
                source={source}
                value={review.draft[source]}
                provenance={review.detected.has(source) ? review.provenance[source] : undefined}
                onChange={(n) => setField({ [source]: n })}
              />
            ))}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setReview(null)}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" onClick={apply}>
                Import
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function ReviewMoneyField({
  source,
  value,
  provenance,
  onChange,
}: {
  source: IncomeSource
  value: number
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
      {provenance && <p className="text-xs text-muted-foreground">from {provenance}</p>}
    </div>
  )
}
