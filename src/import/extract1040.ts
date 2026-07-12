import { ALL_SOURCES, type FilingStatus, type IncomeSource, type TaxInput } from '../tax/types'
import { isTaxYear } from '../tax/years'
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

/**
 * The dollar amount belonging to a line identifier (e.g. "3a", "7").
 *
 * A single printed line renders as `<id> <label…> <amount>`, but two sibling lines
 * often share a baseline — e.g. 3a and 3b print side by side, so our row grouping
 * yields one row "3a Qualified dividends … 3a 58,986 b Ordinary dividends … 3b 84,388".
 * Reading the rightmost amount there would hand 3a its neighbour's value. So we take
 * the rightmost amount within the id's *segment*: from the id up to the next sibling
 * id in `boundaryIds`. Tokens equal to the id are skipped (the id is often reprinted
 * beside its own amount, and "7" must not be read as $7).
 */
function amountForLine(rows: Row[], id: string, boundaryIds: string[]): number | null {
  const want = id.toLowerCase()
  const bounds = new Set(boundaryIds.map((b) => b.toLowerCase()).filter((b) => b !== want))
  for (const row of rows) {
    const items = row.items
    const start = items.findIndex((item) => item.text.trim().toLowerCase() === want)
    if (start === -1) continue
    let end = items.length
    for (let i = start + 1; i < items.length; i++) {
      if (bounds.has(items[i].text.trim().toLowerCase())) {
        end = i
        break
      }
    }
    logMatchedLine(id, row, start, end)
    for (let i = end - 1; i > start; i--) {
      const token = items[i].text.trim()
      if (token.toLowerCase() === want) continue
      const value = parseAmount(token)
      if (value !== null) return value
    }
    // Matched the line but found no value in its segment; keep looking on other rows.
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
  for (const row of rows) {
    const idx = row.items.findIndex((i) => CHECK_TOKENS.has(i.text.trim().toLowerCase()))
    if (idx === -1) continue
    const after = row.items
      .slice(idx + 1)
      .map((i) => i.text)
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    for (const { status, labels } of STATUS_KEYWORDS) {
      if (labels.some((label) => after.startsWith(label))) return status
    }
  }
  return null
}

/**
 * A plausible 4-digit tax year (a 20xx token) on the 1040 face. Whether it's one the
 * app actually supports is left to `isTaxYear` at the call site, so a newly filed year
 * still reaches the "unsupported year" warning rather than looking undetected.
 */
function detectTaxYear(faceRows: Row[]): number | null {
  for (const row of faceRows) {
    for (const item of row.items) {
      const m = item.text.trim().match(/^(20\d{2})$/)
      if (m) return Number(m[1])
    }
  }
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
