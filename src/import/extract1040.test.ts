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
    ...line(1, 360, [['7a', 40], ['Capital gain or (loss)', 70], ['15,000', 520]]),
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
    expect(fields.longTermGains).toBe(15000) // line 7a, assumed long-term
  })

  it('records provenance for detected fields', () => {
    const { provenance } = extract1040Fields(sample1040())
    expect(provenance.wages).toBe('1040 line 1z')
    expect(provenance.nonQualifiedDividends).toBe('1040 line 3b − 3a')
  })

  it('reads each amount when 3a and 3b share a baseline', () => {
    // Real forms print the 3a and 3b amount boxes side by side, so our row grouping
    // yields one row with both. The value must come from each line's own segment, not
    // the rightmost amount (which would give 3a its neighbour's 3b figure).
    const items = [
      ...line(1, 738, [['Form', 40], ['1040', 70], ['U.S. Individual Income Tax Return', 120]]),
      ...line(1, 520, [
        ['if', 20], ['required.', 35], ['3a', 60], ['Qualified', 80], ['dividends', 120],
        ['3a', 300], ['58,986.', 340],
        ['b', 380], ['Ordinary', 400], ['dividends', 440], ['3b', 560], ['84,388.', 600],
      ]),
    ]
    const { fields } = extract1040Fields(items)
    expect(fields.qualifiedDividends).toBe(58986)
    expect(fields.nonQualifiedDividends).toBe(25402) // 3b 84,388 − 3a 58,986
  })

  it('reads short- and long-term gains from Schedule D when present', () => {
    const items = [
      ...line(1, 738, [['Form', 40], ['1040', 70], ['U.S. Individual Income Tax Return', 120]]),
      ...line(1, 300, [['7a', 40], ['Capital gain or (loss)', 70], ['20,000', 520]]),
      ...line(3, 750, [['SCHEDULE D', 40], ['(Form 1040)', 130], ['Capital Gains and Losses', 220]]),
      ...line(3, 400, [['7', 40], ['Net short-term capital gain or (loss)', 70], ['3,000', 520]]),
      ...line(3, 200, [['15', 40], ['Net long-term capital gain or (loss)', 70], ['17,000', 520]]),
    ]
    const { fields, provenance } = extract1040Fields(items)
    expect(fields.shortTermGains).toBe(3000)
    expect(fields.longTermGains).toBe(17000) // not the 20,000 from 1040 line 7a
    expect(provenance.shortTermGains).toBe('Schedule D line 7 (net short-term)')
    expect(provenance.longTermGains).toBe('Schedule D line 15 (net long-term)')
  })

  it('reports a Schedule D capital loss with its real sign and warns', () => {
    const items = [
      ...line(1, 738, [['Form', 40], ['1040', 70], ['U.S. Individual Income Tax Return', 120]]),
      ...line(3, 750, [['SCHEDULE D', 40], ['Capital Gains and Losses', 220]]),
      ...line(3, 400, [['7', 40], ['Net short-term capital gain or (loss)', 70], ['(2,500)', 520]]),
      ...line(3, 200, [['15', 40], ['Net long-term capital gain or (loss)', 70], ['9,000', 520]]),
    ]
    const { fields, warnings } = extract1040Fields(items)
    // The reader keeps the sign; clamping to $0 happens later at the merge boundary.
    expect(fields.shortTermGains).toBe(-2500)
    expect(fields.longTermGains).toBe(9000)
    expect(warnings.some((w) => w.toLowerCase().includes('short-term') && w.toLowerCase().includes('loss'))).toBe(true)
  })

  it('does not mistake Schedule 2 line 7 for 1040 capital gains', () => {
    // Schedule 2 line 7 ("additional SS/Medicare tax") is a different form; a loose
    // page-wide "7" match used to pull its line number in as $7 of long-term gains.
    const items = [
      ...line(1, 738, [['Form', 40], ['1040', 70], ['U.S. Individual Income Tax Return', 120]]),
      ...line(1, 600, [['1z', 40], ['Add lines 1a through 1h', 70], ['50,000', 520]]),
      ...line(5, 750, [['SCHEDULE 2', 40], ['Additional Taxes', 200]]),
      ...line(5, 300, [['7', 40], ['Total additional social security and Medicare tax. Add lines 5 and 6', 70], ['7', 900]]),
    ]
    const { fields } = extract1040Fields(items)
    expect(fields.wages).toBe(50000)
    expect(fields.longTermGains).toBeUndefined()
    expect(fields.shortTermGains).toBeUndefined()
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

  it('routes a future 4-digit year to the unsupported-year warning, not "not found"', () => {
    // 2030 is past the old hard-coded 20[12]x range, so this also guards that the
    // detector recognizes any 20xx token and lets isTaxYear() decide apply-vs-warn.
    const items = line(1, 720, [['Form', 60], ['1040', 90], ['2030', 300]])
    const { fields, warnings } = extract1040Fields(items)
    expect(fields.taxYear).toBeUndefined()
    expect(warnings.some((w) => w.includes('2030') && w.includes('supported'))).toBe(true)
  })

  it('warns that line 7 was treated as long-term', () => {
    const { warnings } = extract1040Fields(sample1040())
    expect(warnings.some((w) => w.includes('long-term'))).toBe(true)
  })

  it('reports a 1040 line 7a capital loss with its real sign and warns', () => {
    const items = line(1, 360, [['7a', 40], ['Capital gain or (loss)', 70], ['(4,000)', 520]])
    const { fields, warnings } = extract1040Fields(items)
    expect(fields.longTermGains).toBe(-4000)
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
    // Blank line 7a (no capital gains): only the line-number item and label are present.
    // amountForLine must not return the line identifier itself as a dollar value.
    const items = line(1, 360, [['7a', 40], ['Capital gain or (loss)', 70]])
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
