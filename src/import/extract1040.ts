import { ALL_SOURCES, coerceDeduction, type FilingStatus, type IncomeSource, type TaxInput } from '../tax/types'
import { isTaxYear, taxTablesFor } from '../tax/years'
import type { ParsedReturn } from './parsedReturn'
import { ilog, setImportStep } from './importLog'

/**
 * A single positioned piece of text from the PDF, in PDF user-space coordinates
 * (origin bottom-left, y increases upward). Deliberately independent of pdf.js so
 * the mapping below is a pure function we can unit-test with synthetic layouts.
 */
export interface TextItem {
  text: string
  x: number
  y: number
  width: number
  page: number
}

/** A reconstructed line of the form: items sharing a baseline, left-to-right. */
export interface Row {
  page: number
  y: number
  items: TextItem[]
  text: string
}

// Items whose baselines fall within this many units are treated as one row.
const ROW_TOLERANCE = 4

/** Group loose text items into rows (top-to-bottom, then left-to-right within a row). */
export function groupRows(items: TextItem[]): Row[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
  const rows: Row[] = []
  for (const item of sorted) {
    if (item.text.trim() === '') continue
    const row = rows[rows.length - 1]
    if (row && row.page === item.page && Math.abs(row.y - item.y) <= ROW_TOLERANCE) {
      row.items.push(item)
    } else {
      rows.push({ page: item.page, y: item.y, items: [item], text: '' })
    }
  }
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x)
    row.text = row.items.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim()
  }
  return rows
}

/**
 * Parse a whole-dollar figure. Handles thousands commas, a `$`, a leading minus or
 * parentheses for negatives, and a trailing cents decimal, e.g. "$1,234" → 1234,
 * "(500)" → -500, "-4,000" → -4000, "2,100.00" → 2100. The app models whole dollars,
 * so any cents are dropped. Returns null for anything without digits in its integer
 * part (so a stray label token isn't mistaken for an amount).
 */
export function parseAmount(text: string): number | null {
  const t = text.trim()
  if (!/\d/.test(t)) return null
  if (/[a-zA-Z]/.test(t)) return null
  const negative = /^\(.*\)$/.test(t) || /^-/.test(t)
  const integerPart = t.replace(/[^0-9.]/g, '').split('.')[0]
  const digits = integerPart.replace(/[^0-9]/g, '')
  if (digits === '') return null
  const value = Number(digits)
  return negative ? -value : value
}

/** The page of the first row whose text contains `phrase` (case-insensitive), or null. */
function pageOf(rows: Row[], phrase: string): number | null {
  const want = phrase.toLowerCase()
  for (const row of rows) {
    if (row.text.toLowerCase().includes(want)) return row.page
  }
  return null
}

/**
 * Dump a matched line and its raw token pieces so we can eyeball how pdf.js split the
 * text — e.g. whether a "(2,500)" loss arrives as one box or three (`(`, `2,500`, `)`),
 * which decides whether parseAmount can see the sign. `seg` flags the pieces that fall
 * in this line id's own segment (the tokens the value is read from). JSON so the console
 * output pastes cleanly back into review notes.
 */
function logMatchedLine(id: string, row: Row, start: number, end: number): void {
  const pieces = row.items.map((item, i) => ({
    text: item.text,
    x: Math.round(item.x),
    seg: i >= start && i < end,
  }))
  ilog(`matched line "${id}" on page ${row.page}: "${row.text}"`)
  ilog(`  pieces: ${JSON.stringify(pieces)}`)
}

/** Normalize a token for line-id / boundary comparison: trimmed and lower-cased. */
const normalizeToken = (text: string): string => text.trim().toLowerCase()

/**
 * The half-open index range `[start, end)` of a line id's *segment* within a row — from the
 * token matching `want` up to the next boundary id (or the row's end); null if the row has no
 * such token. Sibling lines often share a baseline (e.g. 3a and 3b print side by side, grouping
 * into one row `"3a … 3a 58,986 b … 3b 84,388"`), so the segment stops one line's amount from
 * bleeding into its neighbour's.
 */
function lineSegment(
  items: TextItem[],
  want: string,
  bounds: Set<string>,
): { start: number; end: number } | null {
  const start = items.findIndex((item) => normalizeToken(item.text) === want)
  if (start === -1) return null
  let end = start + 1
  while (end < items.length && !bounds.has(normalizeToken(items[end].text))) end++
  return { start, end }
}

/**
 * The rightmost parseable dollar amount in `items[start+1, end)`, or null. Skips any token equal
 * to `want`: a line number is often reprinted beside its own amount, and e.g. "7" must not be
 * read as $7.
 */
function rightmostAmount(items: TextItem[], start: number, end: number, want: string): number | null {
  for (let i = end - 1; i > start; i--) {
    if (normalizeToken(items[i].text) === want) continue
    const value = parseAmount(items[i].text)
    if (value !== null) return value
  }
  return null
}

/**
 * The dollar amount belonging to a line identifier (e.g. "3a", "7"): the rightmost amount within
 * the id's segment, scanning rows until one yields a value. `boundaryIds` are the sibling line
 * ids that delimit a segment (see `lineSegment` for why a segment is needed).
 */
function amountForLine(rows: Row[], id: string, boundaryIds: string[]): number | null {
  const want = normalizeToken(id)
  const bounds = new Set(boundaryIds.map(normalizeToken).filter((b) => b !== want))
  for (const row of rows) {
    const segment = lineSegment(row.items, want, bounds)
    if (!segment) continue
    logMatchedLine(id, row, segment.start, segment.end)
    const value = rightmostAmount(row.items, segment.start, segment.end, want)
    if (value !== null) return value
    // Matched the id but found no amount in its segment; keep scanning later rows.
  }
  return null
}

const STATUS_KEYWORDS: { status: FilingStatus; labels: string[] }[] = [
  { status: 'mfj', labels: ['married filing jointly'] },
  { status: 'mfs', labels: ['married filing separately'] },
  { status: 'hoh', labels: ['head of household'] },
  { status: 'single', labels: ['single'] },
]

const CHECK_TOKENS = new Set(['x', '☒', '✗', '✓', '■'])

/**
 * Best-effort: on a 1040 the checkbox mark sits just left of its status label, so
 * match the label that immediately follows a checkmark on the same row. Still
 * unreliable across layouts, so the caller always asks the user to confirm.
 */
function detectFilingStatus(rows: Row[]): FilingStatus | null {
  ilog(`detectFilingStatus: scanning ${rows.length} rows`)
  for (const row of rows) {
    const idx = row.items.findIndex((i) => CHECK_TOKENS.has(i.text.trim().toLowerCase()))
    if (idx === -1) {
      // Surface items that look like they could be unrecognized checkbox glyphs so we
      // can identify what character the PDF is using (logged as Unicode code points).
      const candidates = row.items.filter(
        (i) => i.text.trim().length <= 2 && !/^[a-z0-9\s]+$/i.test(i.text.trim()) && i.text.trim() !== '',
      )
      if (candidates.length > 0) {
        ilog(
          `detectFilingStatus: row "${row.text}" — no known CHECK_TOKEN but suspicious items: ${JSON.stringify(
            candidates.map((c) => ({
              text: c.text,
              codePoints: [...c.text].map((ch) => 'U+' + (ch.codePointAt(0) ?? 0).toString(16).padStart(4, '0')),
            })),
          )}`,
        )
      }
      continue
    }
    const tok = row.items[idx]
    ilog(
      `detectFilingStatus: check token "${tok.text}" (${[...tok.text].map((ch) => 'U+' + (ch.codePointAt(0) ?? 0).toString(16).padStart(4, '0')).join(' ')}) in row "${row.text}"`,
    )
    const after = row.items
      .slice(idx + 1)
      .map((i) => i.text)
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    ilog(`detectFilingStatus: text after check token: "${after}"`)
    for (const { status, labels } of STATUS_KEYWORDS) {
      if (labels.some((label) => after.startsWith(label))) {
        ilog(`detectFilingStatus: matched status "${status}"`)
        return status
      }
    }
    ilog(`detectFilingStatus: check token found but no status label matched`)
  }
  ilog('detectFilingStatus: no filing status found')
  return null
}

/**
 * A plausible 4-digit tax year (a 20xx token) on the 1040 face. Whether it's one the
 * app actually supports is left to `isTaxYear` at the call site, so a newly filed year
 * still reaches the "unsupported year" warning rather than looking undetected.
 *
 * IRS PDFs often render the year as "(2025)" with surrounding parentheses, so the
 * regex strips those before matching.
 */
function detectTaxYear(faceRows: Row[]): number | null {
  ilog(`detectTaxYear: scanning ${faceRows.length} rows`)
  for (const row of faceRows) {
    for (const item of row.items) {
      const t = item.text.trim()
      if (/20\d{2}/.test(t)) {
        ilog(`detectTaxYear: year-like token "${t}" full-match=${/^\(?(20\d{2})\)?$/.test(t)}`)
      }
      const m = t.match(/^\(?(20\d{2})\)?$/)
      if (m) {
        ilog(`detectTaxYear: matched year ${m[1]} from "${t}"`)
        return Number(m[1])
      }
    }
  }
  ilog('detectTaxYear: no year token found on face page')
  return null
}

/**
 * Map a positioned-text dump of a Form 1040 onto the app's income fields. Pure and
 * best-effort: it fills what it can find, records where each value came from, and
 * warns about anything the user must confirm or that the 1040 face can't express
 * (short vs. long-term split, capital losses). Undetected fields are simply omitted.
 */
// The 1040-face income lines we read, in the order they appear on page 1. Passed as
// each other's segment boundaries so a value never bleeds across sibling lines.
const FACE_IDS = ['1z', '2b', '3a', '3b', '4b', '5b', '7a']

export function extract1040Fields(items: TextItem[]): ParsedReturn {
  const rows = groupRows(items)
  ilog(`grouped ${items.length} text items into ${rows.length} rows`)

  const fields: Partial<TaxInput> = {}
  const provenance: Partial<Record<keyof TaxInput, string>> = {}
  const warnings: string[] = []

  const setMoney = (field: IncomeSource, value: number, source: string) => {
    fields[field] = value
    provenance[field] = source
    ilog(`matched ${field} = ${value} (${source})`)
  }

  // Scope the face lines to the 1040's own page, so a stray "7" on Schedule 2 (or a
  // repeated line number deep in the return) can't be mistaken for a 1040 value.
  setImportStep('match')
  const facePage = pageOf(rows, 'u.s. individual income tax return') ?? pageOf(rows, 'form 1040') ?? 1
  const faceRows = rows.filter((r) => r.page === facePage)
  ilog(`reading 1040 face on page ${facePage}`)
  const amountAt = (line: string): number | null => {
    const value = amountForLine(faceRows, line, FACE_IDS)
    ilog(`line ${line}: -> ${value}`)
    return value
  }

  const wages = amountAt('1z')
  if (wages !== null) setMoney('wages', wages, '1040 line 1z')

  const interest = amountAt('2b')
  if (interest !== null) setMoney('interest', interest, '1040 line 2b')

  const qualified = amountAt('3a')
  if (qualified !== null) setMoney('qualifiedDividends', qualified, '1040 line 3a')

  const ordinaryDiv = amountAt('3b')
  if (ordinaryDiv !== null) {
    const nonQual = ordinaryDiv - (qualified ?? 0)
    if (nonQual < 0) {
      warnings.push('Qualified dividends exceeded ordinary dividends — non-qualified set to $0.')
    }
    setMoney('nonQualifiedDividends', Math.max(0, nonQual), '1040 line 3b − 3a')
  }

  const ira = amountAt('4b')
  const pensions = amountAt('5b')
  if (ira !== null || pensions !== null) {
    setMoney(
      'retirementIncome',
      (ira ?? 0) + (pensions ?? 0),
      '1040 lines 4b + 5b (taxable IRA + pensions)',
    )
  }

  // Capital gains: prefer Schedule D for a real short/long-term split; fall back to
  // 1040 line 7a (assumed long-term) when it isn't attached. Losses keep their real sign;
  // the engine nets short- against long-term and applies up to $3,000 of a net loss
  // against other income (see nettedCapitalGains), so a loss is meaningful, not zeroed.
  const setCapitalGain = (field: 'shortTermGains' | 'longTermGains', value: number, source: string, label: string) => {
    if (value < 0) {
      warnings.push(
        `Schedule D shows a net ${label} capital loss of $${Math.abs(value).toLocaleString()}. It's shown below as a negative and netted against your gains; up to $3,000 of a net loss ($1,500 if married filing separately) offsets other income.`,
      )
    }
    setMoney(field, value, source)
  }
  const schedDPage = pageOf(rows, 'capital gains and losses')
  const schedDRows = schedDPage !== null ? rows.filter((r) => r.page === schedDPage) : []
  const shortTerm = schedDPage !== null ? amountForLine(schedDRows, '7', ['7', '15']) : null
  const longTerm = schedDPage !== null ? amountForLine(schedDRows, '15', ['7', '15']) : null
  if (shortTerm !== null || longTerm !== null) {
    ilog(`Schedule D (page ${schedDPage}): line 7 short-term ${shortTerm}, line 15 long-term ${longTerm}`)
    if (shortTerm !== null) setCapitalGain('shortTermGains', shortTerm, 'Schedule D line 7 (net short-term)', 'short-term')
    if (longTerm !== null) setCapitalGain('longTermGains', longTerm, 'Schedule D line 15 (net long-term)', 'long-term')
  } else {
    const capitalGain = amountAt('7a')
    if (capitalGain !== null && capitalGain < 0) {
      setMoney('longTermGains', capitalGain, '1040 line 7a')
      warnings.push(
        `1040 line 7a is a capital loss of $${Math.abs(capitalGain).toLocaleString()}. It's shown below as a negative and netted against your gains; up to $3,000 of a net loss ($1,500 if married filing separately) offsets other income.`,
      )
    } else if (capitalGain !== null) {
      setMoney('longTermGains', capitalGain, '1040 line 7a (assumed long-term)')
      warnings.push(
        'Capital gains from 1040 line 7a were treated as long-term (no Schedule D found to split them). Adjust below if some were short-term.',
      )
    }
  }

  setImportStep('detect')
  // "Couldn't detect" for filing status / tax year is surfaced inline under those
  // controls in the review UI (from the absence of a provenance entry), so no warning here.
  const filingStatus = detectFilingStatus(faceRows)
  if (filingStatus) {
    fields.filingStatus = filingStatus
    provenance.filingStatus = '1040 filing-status checkbox'
    ilog(`matched filingStatus = ${filingStatus}`)
  }

  const taxYear = detectTaxYear(faceRows)
  if (taxYear !== null && isTaxYear(taxYear)) {
    fields.taxYear = taxYear
    provenance.taxYear = '1040 form header'
    ilog(`matched taxYear = ${taxYear}`)
  } else if (taxYear !== null) {
    warnings.push(`Detected tax year ${taxYear} isn't supported yet — please choose it below.`)
  }

  // Deduction line: "Standard deduction or itemized deductions (from Schedule A)". Its id and
  // page moved across form redesigns — line 12 on page 1 (2022–2024), and line 12e on page 2 of
  // the 2025+ form, where the expanded income section (1a–1z) pushed AGI to line 11a and the
  // deduction onto page 2. Search both 1040 pages, trying 12e before 12 so a 2025 return reads
  // the deduction rather than the page-2 "12a" dependent-claim checkbox line.
  const deductionRows = rows.filter((r) => r.page === facePage || r.page === facePage + 1)
  const DEDUCTION_IDS = ['12e', '12']
  const DEDUCTION_BOUNDS = [...DEDUCTION_IDS, '11', '11a', '11b', '13', '13a', '13b', '14']
  let deductionAmount: number | null = null
  let deductionLineId = ''
  for (const id of DEDUCTION_IDS) {
    const value = amountForLine(deductionRows, id, DEDUCTION_BOUNDS)
    if (value !== null) {
      deductionAmount = value
      deductionLineId = id
      break
    }
  }

  // Validate the parsed amount through the same predicate as every other input boundary
  // (a finite number ≥ 0, else null). If it matches the standard deduction for the detected
  // year/status we stay in standard mode (null); otherwise the filer itemized, so we import
  // the number as custom. `provenance.deduction` reports only *where* the value came from —
  // whether it's an itemized amount is a property of the value, derived fresh by the review
  // UI from the live draft, not baked in here (a filer can still edit the amount afterward).
  const coercedDeduction = coerceDeduction(deductionAmount)
  if (coercedDeduction !== null) {
    const detectedYear = fields.taxYear
    const detectedStatus = fields.filingStatus
    const tableStandard =
      detectedYear && isTaxYear(detectedYear) && detectedStatus
        ? taxTablesFor(detectedYear).standardDeduction[detectedStatus]
        : null
    fields.deduction = tableStandard !== null && coercedDeduction === tableStandard ? null : coercedDeduction
    provenance.deduction = `1040 line ${deductionLineId}`
    ilog(`line ${deductionLineId} deduction: ${coercedDeduction} -> ${String(fields.deduction)}`)
  }

  const foundIncome = ALL_SOURCES.some((source) => fields[source] !== undefined)
  if (!foundIncome) {
    warnings.unshift(
      "Couldn't read any income values from this PDF. It may be a scanned image (not yet supported) or an unexpected layout.",
    )
  }

  setImportStep('result')
  ilog('final fields', fields)
  ilog('warnings', warnings)
  setImportStep('')
  return { fields, provenance, warnings }
}
