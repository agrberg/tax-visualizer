import { ALL_SOURCES, type FilingStatus, type IncomeSource, type TaxInput } from '../tax/types'
import { isTaxYear } from '../tax/years'
import type { ParsedReturn } from './parsedReturn'
import { ilog } from './importLog'

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

/** The rightmost parseable dollar amount on a row (the 1040's amount column). */
function rowAmount(row: Row): number | null {
  for (let i = row.items.length - 1; i >= 0; i--) {
    // Skip the leftmost item when there are others — on a 1040 it is always a
    // line identifier ("7", "1z", …) and never the value column.
    if (i === 0 && row.items.length > 1) continue
    const value = parseAmount(row.items[i].text)
    if (value !== null) return value
  }
  return null
}

/** Find the row whose leading cells contain a standalone line number (e.g. "1z", "3a"). */
function findLine(rows: Row[], line: string): Row | null {
  const want = line.toLowerCase()
  for (const row of rows) {
    if (row.items.some((i) => i.text.trim().toLowerCase() === want)) return row
  }
  return null
}

const STATUS_KEYWORDS: { status: FilingStatus; needles: string[] }[] = [
  { status: 'mfj', needles: ['married filing jointly'] },
  { status: 'mfs', needles: ['married filing separately'] },
  { status: 'hoh', needles: ['head of household'] },
  { status: 'single', needles: ['single'] },
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
    for (const { status, needles } of STATUS_KEYWORDS) {
      if (needles.some((n) => after.startsWith(n))) return status
    }
  }
  return null
}

/**
 * A plausible 4-digit tax year (a 20xx token) near the top of page 1. Whether it's
 * one the app actually supports is left to `isTaxYear` at the call site, so a newly
 * filed year still reaches the "unsupported year" warning rather than looking
 * undetected.
 */
function detectTaxYear(rows: Row[]): number | null {
  const topOfPage1 = rows.filter((r) => r.page === 1)
  for (const row of topOfPage1) {
    for (const item of row.items) {
      const m = item.text.trim().match(/^(20[12]\d)$/)
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
export function extract1040Fields(items: TextItem[]): ParsedReturn {
  const rows = groupRows(items)
  ilog(`grouped ${items.length} text items into ${rows.length} rows`)
  for (const row of rows) ilog(`  p${row.page} y${Math.round(row.y)}: ${row.text}`)

  const fields: Partial<TaxInput> = {}
  const provenance: Partial<Record<keyof TaxInput, string>> = {}
  const warnings: string[] = []

  const setMoney = (field: IncomeSource, value: number, source: string) => {
    fields[field] = value
    provenance[field] = source
    ilog(`matched ${field} = ${value} (${source})`)
  }

  // Simple single-line amounts.
  const amountAt = (line: string): number | null => {
    const row = findLine(rows, line)
    const value = row ? rowAmount(row) : null
    ilog(`line ${line}: ${row ? `row "${row.text}"` : 'not found'} -> ${value}`)
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

  const capitalGain = amountAt('7')
  if (capitalGain !== null) {
    if (capitalGain < 0) {
      warnings.push("Line 7 is a capital loss; set to $0 (the app doesn't model losses).")
      setMoney('longTermGains', 0, '1040 line 7')
    } else {
      setMoney('longTermGains', capitalGain, '1040 line 7 (assumed long-term)')
      warnings.push(
        'Capital gains from line 7 were treated as long-term. If some were short-term, move them in the review below.',
      )
    }
  }

  const filingStatus = detectFilingStatus(rows)
  if (filingStatus) {
    fields.filingStatus = filingStatus
    provenance.filingStatus = '1040 filing-status checkbox'
    ilog(`matched filingStatus = ${filingStatus}`)
    warnings.push('Filing status was auto-detected — please confirm it below.')
  } else {
    warnings.push("Couldn't detect your filing status — please choose it below.")
  }

  const taxYear = detectTaxYear(rows)
  if (taxYear !== null && isTaxYear(taxYear)) {
    fields.taxYear = taxYear
    provenance.taxYear = '1040 form header'
    ilog(`matched taxYear = ${taxYear}`)
  } else if (taxYear !== null) {
    warnings.push(`Detected tax year ${taxYear} isn't supported yet — please choose it below.`)
  } else {
    warnings.push("Couldn't detect the tax year — please choose it below.")
  }

  const foundIncome = ALL_SOURCES.some((source) => fields[source] !== undefined)
  if (!foundIncome) {
    warnings.unshift(
      "Couldn't read any income values from this PDF. It may be a scanned image (not yet supported) or an unexpected layout.",
    )
  }

  ilog('final fields', fields)
  ilog('warnings', warnings)
  return { fields, provenance, warnings }
}
