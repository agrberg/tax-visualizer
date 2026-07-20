import { describe, it, expect, beforeAll } from 'vitest';
import { extract1040Fields } from './extract1040';
import { groupRows, parseAmount, type TextItem } from './rows';
import { setImportLogging } from './importLog';

beforeAll(() => setImportLogging(false));

/** Build a row of text items at baseline `y` on `page` from [text, x] cells. */
function line(page: number, y: number, cells: [string, number][]): TextItem[] {
  return cells.map(([text, x]) => ({ text, x, y, width: text.length * 6, page }));
}

// A stripped-down but structurally faithful page-1 1040: line number on the left,
// label in the middle, amount in the right column.
function sample1040(): TextItem[] {
  return [
    ...line(1, 720, [
      ['Form', 60],
      ['1040', 90],
      ['2025', 300],
      ['OMB No. 1545-0074', 500],
    ]),
    ...line(1, 700, [
      ['Filing Status', 40],
      ['X', 70],
      ['Single', 90],
      ['Married filing jointly', 200],
    ]),
    ...line(1, 600, [
      ['1z', 40],
      ['Add lines 1a through 1h', 70],
      ['118,000', 520],
    ]),
    ...line(1, 560, [
      ['2b', 40],
      ['Taxable interest', 70],
      ['2,100', 520],
    ]),
    ...line(1, 520, [
      ['3a', 40],
      ['Qualified dividends', 70],
      ['8,000', 520],
    ]),
    ...line(1, 500, [
      ['3b', 40],
      ['Ordinary dividends', 70],
      ['9,500', 520],
    ]),
    ...line(1, 460, [
      ['4b', 40],
      ['IRA distributions', 70],
      ['5,000', 520],
    ]),
    ...line(1, 420, [
      ['5b', 40],
      ['Pensions and annuities', 70],
      ['3,000', 520],
    ]),
    ...line(1, 360, [
      ['7a', 40],
      ['Capital gain or (loss)', 70],
      ['15,000', 520],
    ]),
  ];
}

describe('parseAmount', () => {
  it('parses commas and a dollar sign', () => {
    expect(parseAmount('$1,234')).toBe(1234);
    expect(parseAmount('118,000')).toBe(118000);
  });
  it('treats parentheses as negative', () => {
    expect(parseAmount('(500)')).toBe(-500);
  });
  it('treats a leading minus as negative', () => {
    expect(parseAmount('-4,000')).toBe(-4000);
  });
  it('drops trailing cents rather than inflating the value', () => {
    expect(parseAmount('2,100.00')).toBe(2100);
    expect(parseAmount('1,234.56')).toBe(1234);
  });
  it('returns null for non-numeric text', () => {
    expect(parseAmount('Taxable interest')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
  it('returns null for text with letters mixed with digits (label tokens)', () => {
    expect(parseAmount('Add lines 1a through 1h')).toBeNull();
    expect(parseAmount('1z')).toBeNull();
  });
});

describe('groupRows', () => {
  it('groups items sharing a baseline and orders them left-to-right, top-to-bottom', () => {
    const rows = groupRows([
      ...line(1, 100, [
        ['b', 200],
        ['a', 50],
      ]),
      ...line(1, 200, [['top', 50]]),
    ]);
    expect(rows.map((r) => r.text)).toEqual(['top', 'a b']);
  });
});

describe('extract1040Fields', () => {
  it('maps the standard income lines', () => {
    const { fields } = extract1040Fields(sample1040());
    expect(fields.wages).toBe(118000);
    expect(fields.interest).toBe(2100);
    expect(fields.qualifiedDividends).toBe(8000);
    expect(fields.nonQualifiedDividends).toBe(1500); // 3b 9,500 − 3a 8,000
    expect(fields.retirementIncome).toBe(8000); // 4b 5,000 + 5b 3,000
    expect(fields.longTermGains).toBe(15000); // line 7a, assumed long-term
  });

  it('records provenance for detected fields', () => {
    const { provenance } = extract1040Fields(sample1040());
    expect(provenance.wages).toBe('1040 line 1z');
    expect(provenance.nonQualifiedDividends).toBe('1040 line 3b − 3a');
  });

  it('reads each amount when 3a and 3b share a baseline', () => {
    // Real forms print the 3a and 3b amount boxes side by side, so our row grouping
    // yields one row with both. The value must come from each line's own segment, not
    // the rightmost amount (which would give 3a its neighbour's 3b figure).
    const items = [
      ...line(1, 738, [
        ['Form', 40],
        ['1040', 70],
        ['U.S. Individual Income Tax Return', 120],
      ]),
      ...line(1, 520, [
        ['if', 20],
        ['required.', 35],
        ['3a', 60],
        ['Qualified', 80],
        ['dividends', 120],
        ['3a', 300],
        ['1,000.', 340],
        ['b', 380],
        ['Ordinary', 400],
        ['dividends', 440],
        ['3b', 560],
        ['3,000.', 600],
      ]),
    ];
    const { fields } = extract1040Fields(items);
    expect(fields.qualifiedDividends).toBe(1000);
    expect(fields.nonQualifiedDividends).toBe(2000); // 3b 3,000 − 3a 1,000
  });

  it('reads short- and long-term gains from Schedule D when present', () => {
    const items = [
      ...line(1, 738, [
        ['Form', 40],
        ['1040', 70],
        ['U.S. Individual Income Tax Return', 120],
      ]),
      ...line(1, 300, [
        ['7a', 40],
        ['Capital gain or (loss)', 70],
        ['20,000', 520],
      ]),
      ...line(3, 750, [
        ['SCHEDULE D', 40],
        ['(Form 1040)', 130],
        ['Capital Gains and Losses', 220],
      ]),
      ...line(3, 400, [
        ['7', 40],
        ['Net short-term capital gain or (loss)', 70],
        ['3,000', 520],
      ]),
      ...line(3, 200, [
        ['15', 40],
        ['Net long-term capital gain or (loss)', 70],
        ['17,000', 520],
      ]),
    ];
    const { fields, provenance } = extract1040Fields(items);
    expect(fields.shortTermGains).toBe(3000);
    expect(fields.longTermGains).toBe(17000); // not the 20,000 from 1040 line 7a
    expect(provenance.shortTermGains).toBe('Schedule D line 7 (net short-term)');
    expect(provenance.longTermGains).toBe('Schedule D line 15 (net long-term)');
  });

  it('reports a Schedule D capital loss with its real sign and warns', () => {
    const items = [
      ...line(1, 738, [
        ['Form', 40],
        ['1040', 70],
        ['U.S. Individual Income Tax Return', 120],
      ]),
      ...line(3, 750, [
        ['SCHEDULE D', 40],
        ['Capital Gains and Losses', 220],
      ]),
      ...line(3, 400, [
        ['7', 40],
        ['Net short-term capital gain or (loss)', 70],
        ['(2,500)', 520],
      ]),
      ...line(3, 200, [
        ['15', 40],
        ['Net long-term capital gain or (loss)', 70],
        ['9,000', 520],
      ]),
    ];
    const { fields, warnings } = extract1040Fields(items);
    // The reader keeps the sign; clamping to $0 happens later at the merge boundary.
    expect(fields.shortTermGains).toBe(-2500);
    expect(fields.longTermGains).toBe(9000);
    expect(warnings.some((w) => w.toLowerCase().includes('short-term') && w.toLowerCase().includes('loss'))).toBe(true);
  });

  it('does not mistake Schedule 2 line 7 for 1040 capital gains', () => {
    // Schedule 2 line 7 ("additional SS/Medicare tax") is a different form; a loose
    // page-wide "7" match used to pull its line number in as $7 of long-term gains.
    const items = [
      ...line(1, 738, [
        ['Form', 40],
        ['1040', 70],
        ['U.S. Individual Income Tax Return', 120],
      ]),
      ...line(1, 600, [
        ['1z', 40],
        ['Add lines 1a through 1h', 70],
        ['50,000', 520],
      ]),
      ...line(5, 750, [
        ['SCHEDULE 2', 40],
        ['Additional Taxes', 200],
      ]),
      ...line(5, 300, [
        ['7', 40],
        ['Total additional social security and Medicare tax. Add lines 5 and 6', 70],
        ['7', 900],
      ]),
    ];
    const { fields } = extract1040Fields(items);
    expect(fields.wages).toBe(50000);
    expect(fields.longTermGains).toBeUndefined();
    expect(fields.shortTermGains).toBeUndefined();
  });

  it('detects filing status and tax year', () => {
    const { fields } = extract1040Fields(sample1040());
    expect(fields.filingStatus).toBe('single');
    expect(fields.taxYear).toBe(2025);
  });

  it('detects a year from a parenthesized token as used in IRS form headers', () => {
    const items = line(1, 720, [
      ['Form', 60],
      ['1040', 90],
      ['(2025)', 300],
    ]);
    const { fields } = extract1040Fields(items);
    expect(fields.taxYear).toBe(2025);
  });

  it('detects the other filing statuses from the checked box', () => {
    const cases: [string, string][] = [
      ['Married filing jointly', 'mfj'],
      ['Married filing separately', 'mfs'],
      ['Head of household', 'hoh'],
    ];
    for (const [label, expected] of cases) {
      const items = line(1, 700, [
        ['Filing Status', 40],
        ['X', 70],
        [label, 90],
      ]);
      expect(extract1040Fields(items).fields.filingStatus).toBe(expected);
    }
  });

  it('sums retirement income when only one of 4b / 5b is present', () => {
    const iraOnly = line(1, 460, [
      ['4b', 40],
      ['IRA distributions', 70],
      ['5,000', 520],
    ]);
    expect(extract1040Fields(iraOnly).fields.retirementIncome).toBe(5000);
    const pensionsOnly = line(1, 420, [
      ['5b', 40],
      ['Pensions and annuities', 70],
      ['3,000', 520],
    ]);
    expect(extract1040Fields(pensionsOnly).fields.retirementIncome).toBe(3000);
  });

  it('reads IRA (4b) from its own segment when it shares a baseline with pensions (4c/4d) — 2019 layout', () => {
    // On the 2019 form, "b Taxable amount 4b" and "d Taxable amount 4d" can land on the same
    // physical row. 4c/4d are in SEGMENT_BOUNDARY_IDS precisely so they bound 4b's segment here:
    // without them, 4b's segment would bleed past its own amount into the pension columns and read
    // 4d's amount instead of 4b's — retirementIncome would then double-count pensions and drop IRA.
    const items = line(1, 460, [
      ['4a', 40],
      ['IRA distributions', 70],
      ['4a', 200],
      ['5,500.', 230],
      ['b', 260],
      ['Taxable amount', 280],
      ['4b', 400],
      ['5,000.', 430],
      ['4c', 460],
      ['Pensions and annuities', 480],
      ['4c', 600],
      ['4,500.', 630],
      ['d', 660],
      ['Taxable amount', 680],
      ['4d', 800],
      ['4,000.', 830],
    ]);
    const { fields } = extract1040Fields(items);
    expect(fields.retirementIncome).toBe(9000); // IRA 5,000 + pensions 4,000
  });

  it('reads the taxable pension amount, not the gross amount, when the gross/taxable sub-lines land on separate rows', () => {
    // "c Pensions and annuities" (gross) and "d Taxable amount" (taxable) usually merge into one
    // row, but a layout could split them — amountForLabel must follow to the taxable sub-line's
    // own row rather than reading the gross line's rightmost amount.
    const items = [
      ...line(1, 420, [
        ['4c', 40],
        ['Pensions and annuities', 70],
        ['4c', 460],
        ['9,000.', 500],
      ]),
      ...line(1, 410, [
        ['d', 40],
        ['Taxable amount', 70],
        ['4d', 460],
        ['4,000.', 500],
      ]),
    ];
    const { fields } = extract1040Fields(items);
    expect(fields.retirementIncome).toBe(4000); // taxable 4,000, not gross 9,000
  });

  it('warns instead of setting an unsupported detected tax year', () => {
    const items = line(1, 720, [
      ['Form', 60],
      ['1040', 90],
      ['2024', 300],
    ]);
    const { fields, warnings } = extract1040Fields(items);
    expect(fields.taxYear).toBeUndefined();
    expect(warnings.some((w) => w.includes('2024') && w.includes('supported'))).toBe(true);
  });

  it('routes a future 4-digit year to the unsupported-year warning, not "not found"', () => {
    // 2030 is past the old hard-coded 20[12]x range, so this also guards that the
    // detector recognizes any 20xx token and lets isTaxYear() decide apply-vs-warn.
    const items = line(1, 720, [
      ['Form', 60],
      ['1040', 90],
      ['2030', 300],
    ]);
    const { fields, warnings } = extract1040Fields(items);
    expect(fields.taxYear).toBeUndefined();
    expect(warnings.some((w) => w.includes('2030') && w.includes('supported'))).toBe(true);
  });

  it('warns that line 7 was treated as long-term', () => {
    const { warnings } = extract1040Fields(sample1040());
    expect(warnings.some((w) => w.includes('long-term'))).toBe(true);
  });

  it('reports a 1040 line 7a capital loss with its real sign and warns', () => {
    const items = line(1, 360, [
      ['7a', 40],
      ['Capital gain or (loss)', 70],
      ['(4,000)', 520],
    ]);
    const { fields, warnings } = extract1040Fields(items);
    expect(fields.longTermGains).toBe(-4000);
    expect(warnings.some((w) => w.toLowerCase().includes('loss'))).toBe(true);
  });

  it('sets non-qualified dividends to 0 when qualified exceeds ordinary', () => {
    const items = [
      ...line(1, 520, [
        ['3a', 40],
        ['Qualified dividends', 70],
        ['9,000', 520],
      ]),
      ...line(1, 500, [
        ['3b', 40],
        ['Ordinary dividends', 70],
        ['8,000', 520],
      ]),
    ];
    const { fields, warnings } = extract1040Fields(items);
    expect(fields.nonQualifiedDividends).toBe(0);
    expect(warnings.some((w) => w.includes('exceeded'))).toBe(true);
  });

  it('does not extract the line number when a targeted line has no dollar value', () => {
    // Blank line 7a (no capital gains): only the line-number item and label are present.
    // amountForId must not return the line identifier itself as a dollar value.
    const items = line(1, 360, [
      ['7a', 40],
      ['Capital gain or (loss)', 70],
    ]);
    const { fields } = extract1040Fields(items);
    expect(fields.longTermGains).toBeUndefined();
  });

  it('reads a label-anchored amount that is itself 1-2 digits, without mistaking the reprinted id for it', () => {
    // The real form reprints the line id immediately before the amount box (see the page-12e/2025
    // deduction fixture below). A 1-2 digit dollar amount is shaped just like a line id, so
    // amountForLabel used to skip it as the reprint and return null instead of the real value.
    const items = line(1, 360, [
      ['6', 40],
      ['Capital gain or (loss)', 70],
      ['6', 460],
      ['7', 500],
    ]);
    const { fields } = extract1040Fields(items);
    expect(fields.longTermGains).toBe(7);
  });

  it('still returns no value for a blank label-anchored line whose reprinted id has no letter suffix', () => {
    // '6' (2019's capital-gain id) is fully digit-shaped, just like a small dollar amount — make
    // sure reading small amounts correctly (above) doesn't turn a blank line's reprint into one.
    const items = line(1, 360, [
      ['6', 40],
      ['Capital gain or (loss)', 70],
      ['6', 460],
    ]);
    const { fields } = extract1040Fields(items);
    expect(fields.longTermGains).toBeUndefined();
  });

  it('reads a 1-2 digit label-anchored amount even when the id is not reprinted before it', () => {
    // Only the leading id, no reprint next to the amount box — the small value's only neighbor
    // is the label text, not another id-shaped token.
    const items = line(1, 360, [
      ['6', 40],
      ['Capital gain or (loss)', 70],
      ['7', 500],
    ]);
    const { fields } = extract1040Fields(items);
    expect(fields.longTermGains).toBe(7);
  });

  it('warns and detects nothing on an empty/unreadable dump', () => {
    const { fields, warnings } = extract1040Fields([]);
    expect(Object.keys(fields)).toHaveLength(0);
    expect(warnings[0]).toContain("Couldn't read any income values");
  });

  it('warns about missing income when only header fields parse', () => {
    // A readable header (year + filing status) but no income lines should still tell
    // the user nothing income-wise was found — the header fields must not mask that.
    const items = [
      ...line(1, 720, [
        ['Form', 60],
        ['1040', 90],
        ['2025', 300],
      ]),
      ...line(1, 700, [
        ['Filing Status', 40],
        ['X', 70],
        ['Single', 90],
      ]),
    ];
    const { fields, warnings } = extract1040Fields(items);
    expect(fields.filingStatus).toBe('single');
    expect(warnings[0]).toContain("Couldn't read any income values");
  });
});

describe('extract1040Fields — line 12 deduction', () => {
  // sample1040() detects Single + 2025. The 2025 single standard deduction is $15,750.
  const STANDARD_2025_SINGLE = 15750;

  function with12(amount: string): TextItem[] {
    return [
      ...sample1040(),
      ...line(1, 300, [
        ['12', 40],
        ['Standard deduction or itemized deductions', 70],
        [amount, 520],
      ]),
    ];
  }

  it('treats a line 12 that matches the standard deduction as standard mode (null)', () => {
    const { fields, provenance } = extract1040Fields(with12(STANDARD_2025_SINGLE.toLocaleString()));
    expect(fields.deduction).toBeNull();
    expect(provenance.deduction).toBe('1040 line 12');
  });

  it('imports a line 12 above the standard as a custom deduction', () => {
    const { fields, provenance } = extract1040Fields(with12('28,500'));
    expect(fields.deduction).toBe(28500);
    expect(provenance.deduction).toBe('1040 line 12');
  });

  it('imports a line 12 below the standard as custom too', () => {
    // 10,000 < the 2025 single standard (15,750): still a custom amount — only an exact match
    // stays in standard mode. Doesn't occur on a rational return, but the branch exists.
    const { fields, provenance } = extract1040Fields(with12('10,000'));
    expect(fields.deduction).toBe(10000);
    expect(provenance.deduction).toBe('1040 line 12');
  });

  it('leaves the deduction undetected when line 12 is absent', () => {
    const { fields } = extract1040Fields(sample1040());
    expect(fields.deduction).toBeUndefined();
  });

  it('still reads line 7a when line 12 is present (segment-boundary regression)', () => {
    // The deduction is read separately from the income lines (7a stays the last FACE_ID), so a
    // line 12 present on the same page must not narrow or steal the line-7a read.
    const { fields } = extract1040Fields(with12('28,500'));
    expect(fields.longTermGains).toBe(15000); // 1040 line 7a, assumed long-term
    expect(fields.deduction).toBe(28500);
  });

  // On the 2025 redesign the deduction moved to page 2 as line 12e (page 1 ends at AGI on 11a).
  function with12eOnPage2(amount: string): TextItem[] {
    return [
      ...sample1040(), // page 1: 2025 header, single filer, income lines
      ...line(2, 700, [
        ['12e', 40],
        ['Standard deduction or itemized deductions (from Schedule A)', 70],
        ['12e', 500],
        [amount, 560],
      ]),
    ];
  }

  it('reads the deduction from line 12e on page 2 (2025+ layout)', () => {
    const { fields, provenance } = extract1040Fields(with12eOnPage2(STANDARD_2025_SINGLE.toLocaleString()));
    expect(fields.deduction).toBeNull(); // 15,750 == 2025 single standard → standard mode
    expect(provenance.deduction).toBe('1040 line 12e');
  });

  it('imports a custom deduction from line 12e (2025+ layout)', () => {
    const { fields, provenance } = extract1040Fields(with12eOnPage2('30,000'));
    expect(fields.deduction).toBe(30000);
    expect(provenance.deduction).toBe('1040 line 12e');
  });

  it("imports line 12 as custom when the year/filing status are unknown (can't compare)", () => {
    // No header (year + filing status), just an income line and line 12: without a known
    // year/status there's no standard to compare against, so the value is imported as custom.
    const items = [
      ...line(1, 600, [
        ['1z', 40],
        ['Add lines 1a through 1h', 70],
        ['80,000', 520],
      ]),
      ...line(1, 300, [
        ['12', 40],
        ['Standard deduction or itemized deductions', 70],
        ['15,750', 520],
      ]),
    ];
    const { fields, provenance } = extract1040Fields(items);
    expect(fields.deduction).toBe(15750);
    expect(provenance.deduction).toBe('1040 line 12');
  });

  it('leaves the deduction undetected on a blank line whose id is preceded by a merged heading', () => {
    // The left-margin "Standard Deduction for—" heading can merge onto the same row as the
    // deduction line, landing left of its id — so the id isn't the row's leading token. On a
    // blank line, the reprinted id ('9', 2019's fully-digit-shaped deduction id) must still be
    // skipped rather than read as a bogus $9 deduction.
    const items = line(1, 300, [
      ['Standard Deduction for—', 20],
      ['9', 40],
      ['Standard deduction or itemized deductions', 70],
      ['9', 460],
    ]);
    const { fields } = extract1040Fields(items);
    expect(fields.deduction).toBeUndefined();
  });
});

describe('extract1040Fields — multi-year layouts (label-anchored)', () => {
  // Faithful-enough page-1 (+ page-2 for 2025) layouts capturing the real line-id/page drift
  // across the supported window. No Schedule D attached, so capital gain comes from the 1040
  // line via label (assumed long-term). Each row carries its era's real line id AND the stable
  // printed label the parser anchors on.
  interface YearLayout {
    year: number;
    wagesId: string; // '1' (2019–2021) or '1z' (2022+)
    pensionsId: string; // '4d' (2019) or '5b' (2020+)
    ssId: string; // '5b' (2019) or '6b' (2020+) — must NOT be read as pensions
    capGainId: string; // '6' (2019), '7' (2020–2024), '7a' (2025)
    deductionId: string; // '9' (2019), '12' (2020/2022–2024), '12a' (2021), '12e' (2025)
    deductionPage: number; // 1, or 2 for the 2025 redesign
  }

  const YEARS: YearLayout[] = [
    { year: 2019, wagesId: '1', pensionsId: '4d', ssId: '5b', capGainId: '6', deductionId: '9', deductionPage: 1 },
    { year: 2020, wagesId: '1', pensionsId: '5b', ssId: '6b', capGainId: '7', deductionId: '12', deductionPage: 1 },
    { year: 2021, wagesId: '1', pensionsId: '5b', ssId: '6b', capGainId: '7', deductionId: '12a', deductionPage: 1 },
    { year: 2022, wagesId: '1z', pensionsId: '5b', ssId: '6b', capGainId: '7', deductionId: '12', deductionPage: 1 },
    // 2023 is identical to 2022, so no separate test case.
    { year: 2024, wagesId: '1z', pensionsId: '5b', ssId: '6b', capGainId: '7', deductionId: '12', deductionPage: 1 },
    { year: 2025, wagesId: '1z', pensionsId: '5b', ssId: '6b', capGainId: '7a', deductionId: '12e', deductionPage: 2 },
  ];

  function buildForm(l: YearLayout): TextItem[] {
    const dedAmount = l.year === 2025 ? '15,750' : '13,850'; // 2025 single standard = matches
    const wagesLabel = l.wagesId === '1z' ? 'Add lines 1a through 1h' : 'Wages, salaries, tips, etc.';
    return [
      ...line(1, 760, [
        ['Form', 40],
        ['1040', 70],
        ['U.S. Individual Income Tax Return', 120],
        [String(l.year), 400],
      ]),
      ...line(1, 700, [
        ['Filing Status', 20],
        ['X', 60],
        ['Single', 90],
      ]),
      ...line(1, 600, [
        [l.wagesId, 40],
        [wagesLabel, 70],
        ['70,000', 520],
      ]),
      ...line(1, 560, [
        ['2b', 40],
        ['Taxable interest', 70],
        ['1,000', 520],
      ]),
      ...line(1, 520, [
        ['3a', 40],
        ['Qualified dividends', 70],
        ['2,000', 520],
      ]),
      ...line(1, 500, [
        ['3b', 40],
        ['Ordinary dividends', 70],
        ['3,000', 520],
      ]),
      ...line(1, 460, [
        ['4b', 40],
        ['IRA distributions', 70],
        ['5,000', 520],
      ]),
      ...line(1, 420, [
        [l.pensionsId, 40],
        ['Pensions and annuities', 70],
        ['4,000', 520],
      ]),
      // Social Security taxable — its cell must not be misread as pensions (the 2019 5b trap).
      ...line(1, 400, [
        [l.ssId, 40],
        ['Social security benefits', 70],
        ['9,999', 520],
      ]),
      ...line(1, 360, [
        [l.capGainId, 40],
        ['Capital gain or (loss)', 70],
        ['8,000', 520],
      ]),
      ...line(l.deductionPage, l.deductionPage === 2 ? 700 : 300, [
        [l.deductionId, 40],
        ['Standard deduction or itemized deductions (from Schedule A)', 70],
        [dedAmount, 520],
      ]),
    ];
  }

  for (const l of YEARS) {
    it(`reads the ${l.year} layout (wages ${l.wagesId}, pensions ${l.pensionsId}, cap-gain ${l.capGainId}, deduction ${l.deductionId})`, () => {
      const { fields, assumed } = extract1040Fields(buildForm(l));
      expect(fields.wages).toBe(70000);
      expect(fields.interest).toBe(1000);
      expect(fields.qualifiedDividends).toBe(2000);
      expect(fields.nonQualifiedDividends).toBe(1000); // 3b 3,000 − 3a 2,000
      // IRA 5,000 + pensions 4,000 — NOT the 9,999 Social Security line (2019 read 5b as pensions)
      expect(fields.retirementIncome).toBe(9000);
      // 1040 capital-gain line, assumed long-term (no Schedule D to split)
      expect(fields.longTermGains).toBe(8000);
      expect(fields.shortTermGains).toBeUndefined();
      expect(assumed?.longTermGains).toBe(true);
      // Wages via the older single-line-1 label is a lower-confidence read; 1z is confident.
      expect(assumed?.wages).toBe(l.wagesId === '1z' ? undefined : true);
      // 2025's 15,750 matches the single standard (tables exist) → standard mode (null);
      // pre-2025 years have no tables here, so the value imports as a custom deduction.
      expect(fields.deduction).toBe(l.year === 2025 ? null : 13850);
    });
  }

  it('flags a form older than the supported window for full verification', () => {
    const l: YearLayout = {
      year: 2017,
      wagesId: '1',
      pensionsId: '4d',
      ssId: '5b',
      capGainId: '6',
      deductionId: '9',
      deductionPage: 1,
    };
    const { warnings } = extract1040Fields(buildForm(l));
    expect(warnings.some((w) => w.includes('2017') && /older/i.test(w))).toBe(true);
  });
});
