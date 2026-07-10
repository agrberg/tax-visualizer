import { describe, it, expect, beforeAll } from 'vitest'
import { extract1040Fields, groupRows, parseAmount, type TextItem } from './extract1040'
import { setImportLogging } from './importLog'

beforeAll(() => setImportLogging(false))

/** Build a row of text items at baseline `y` on `page` from [text, x] cells. */
function line(page: number, y: number, cells: [string, number][]): TextItem[] {
  return cells.map(([text, x]) => ({ text, x, y, width: text.length * 6, page }))
}

// A stripped-down but structurally faithful page-1 1040: line number on the left,
// label in the middle, amount in the right column.
function sample1040(): TextItem[] {
  return [
    ...line(1, 720, [['Form', 60], ['1040', 90], ['2025', 300], ['OMB No. 1545-0074', 500]]),
    ...line(1, 700, [['Filing Status', 40], ['X', 70], ['Single', 90], ['Married filing jointly', 200]]),
    ...line(1, 600, [['1z', 40], ['Add lines 1a through 1h', 70], ['118,000', 520]]),
    ...line(1, 560, [['2b', 40], ['Taxable interest', 70], ['2,100', 520]]),
    ...line(1, 520, [['3a', 40], ['Qualified dividends', 70], ['8,000', 520]]),
    ...line(1, 500, [['3b', 40], ['Ordinary dividends', 70], ['9,500', 520]]),
    ...line(1, 460, [['4b', 40], ['IRA distributions', 70], ['5,000', 520]]),
    ...line(1, 420, [['5b', 40], ['Pensions and annuities', 70], ['3,000', 520]]),
    ...line(1, 360, [['7', 40], ['Capital gain or (loss)', 70], ['15,000', 520]]),
  ]
}

describe('parseAmount', () => {
  it('parses commas and a dollar sign', () => {
    expect(parseAmount('$1,234')).toBe(1234)
    expect(parseAmount('118,000')).toBe(118000)
  })
  it('treats parentheses as negative', () => {
    expect(parseAmount('(500)')).toBe(-500)
  })
  it('treats a leading minus as negative', () => {
    expect(parseAmount('-4,000')).toBe(-4000)
  })
  it('drops trailing cents rather than inflating the value', () => {
    expect(parseAmount('2,100.00')).toBe(2100)
    expect(parseAmount('1,234.56')).toBe(1234)
  })
  it('returns null for non-numeric text', () => {
    expect(parseAmount('Taxable interest')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })
  it('returns null for text with letters mixed with digits (label tokens)', () => {
    expect(parseAmount('Add lines 1a through 1h')).toBeNull()
    expect(parseAmount('1z')).toBeNull()
  })
})

describe('groupRows', () => {
  it('groups items sharing a baseline and orders them left-to-right, top-to-bottom', () => {
    const rows = groupRows([
      ...line(1, 100, [['b', 200], ['a', 50]]),
      ...line(1, 200, [['top', 50]]),
    ])
    expect(rows.map((r) => r.text)).toEqual(['top', 'a b'])
  })
})

describe('extract1040Fields', () => {
  it('maps the standard income lines', () => {
    const { fields } = extract1040Fields(sample1040())
    expect(fields.wages).toBe(118000)
    expect(fields.interest).toBe(2100)
    expect(fields.qualifiedDividends).toBe(8000)
    expect(fields.nonQualifiedDividends).toBe(1500) // 3b 9,500 − 3a 8,000
    expect(fields.retirementIncome).toBe(8000) // 4b 5,000 + 5b 3,000
    expect(fields.longTermGains).toBe(15000) // line 7, assumed long-term
  })

  it('records provenance for detected fields', () => {
    const { provenance } = extract1040Fields(sample1040())
    expect(provenance.wages).toBe('1040 line 1z')
    expect(provenance.nonQualifiedDividends).toBe('1040 line 3b − 3a')
  })

  it('detects filing status and tax year', () => {
    const { fields } = extract1040Fields(sample1040())
    expect(fields.filingStatus).toBe('single')
    expect(fields.taxYear).toBe(2025)
  })

  it('detects the other filing statuses from the checked box', () => {
    const cases: [string, string][] = [
      ['Married filing jointly', 'mfj'],
      ['Married filing separately', 'mfs'],
      ['Head of household', 'hoh'],
    ]
    for (const [label, expected] of cases) {
      const items = line(1, 700, [['Filing Status', 40], ['X', 70], [label, 90]])
      expect(extract1040Fields(items).fields.filingStatus).toBe(expected)
    }
  })

  it('sums retirement income when only one of 4b / 5b is present', () => {
    const iraOnly = line(1, 460, [['4b', 40], ['IRA distributions', 70], ['5,000', 520]])
    expect(extract1040Fields(iraOnly).fields.retirementIncome).toBe(5000)
    const pensionsOnly = line(1, 420, [['5b', 40], ['Pensions and annuities', 70], ['3,000', 520]])
    expect(extract1040Fields(pensionsOnly).fields.retirementIncome).toBe(3000)
  })

  it('warns instead of setting an unsupported detected tax year', () => {
    const items = line(1, 720, [['Form', 60], ['1040', 90], ['2024', 300]])
    const { fields, warnings } = extract1040Fields(items)
    expect(fields.taxYear).toBeUndefined()
    expect(warnings.some((w) => w.includes('2024') && w.includes('supported'))).toBe(true)
  })

  it('warns that line 7 was treated as long-term', () => {
    const { warnings } = extract1040Fields(sample1040())
    expect(warnings.some((w) => w.includes('long-term'))).toBe(true)
  })

  it('clamps a capital loss on line 7 to zero and warns', () => {
    const items = line(1, 360, [['7', 40], ['Capital gain or (loss)', 70], ['(4,000)', 520]])
    const { fields, warnings } = extract1040Fields(items)
    expect(fields.longTermGains).toBe(0)
    expect(warnings.some((w) => w.toLowerCase().includes('loss'))).toBe(true)
  })

  it('sets non-qualified dividends to 0 when qualified exceeds ordinary', () => {
    const items = [
      ...line(1, 520, [['3a', 40], ['Qualified dividends', 70], ['9,000', 520]]),
      ...line(1, 500, [['3b', 40], ['Ordinary dividends', 70], ['8,000', 520]]),
    ]
    const { fields, warnings } = extract1040Fields(items)
    expect(fields.nonQualifiedDividends).toBe(0)
    expect(warnings.some((w) => w.includes('exceeded'))).toBe(true)
  })

  it('does not extract the line number when a targeted line has no dollar value', () => {
    // Blank line 7 (no capital gains): only the line-number item and label are present.
    // rowAmount must not return 7 (the line number) as $7 of capital gains.
    const items = line(1, 360, [['7', 40], ['Capital gain or (loss)', 70]])
    const { fields } = extract1040Fields(items)
    expect(fields.longTermGains).toBeUndefined()
  })

  it('warns and detects nothing on an empty/unreadable dump', () => {
    const { fields, warnings } = extract1040Fields([])
    expect(Object.keys(fields)).toHaveLength(0)
    expect(warnings[0]).toContain("Couldn't read any income values")
  })

  it('warns about missing income when only header fields parse', () => {
    // A readable header (year + filing status) but no income lines should still tell
    // the user nothing income-wise was found — the header fields must not mask that.
    const items = [
      ...line(1, 720, [['Form', 60], ['1040', 90], ['2025', 300]]),
      ...line(1, 700, [['Filing Status', 40], ['X', 70], ['Single', 90]]),
    ]
    const { fields, warnings } = extract1040Fields(items)
    expect(fields.filingStatus).toBe('single')
    expect(warnings[0]).toContain("Couldn't read any income values")
  })
})
