import { describe, it, expect, beforeAll } from 'vitest';
import { Section } from './section';
import { groupRows, type TextItem } from './rows';
import { setImportLogging } from './importLog';

beforeAll(() => setImportLogging(false));

/** Build a row of text items at baseline `y` on `page` from [text, x] cells. */
function line(page: number, y: number, cells: [string, number][]): TextItem[] {
  return cells.map(([text, x]) => ({ text, x, y, width: text.length * 6, page }));
}

/** A `Section` over the rows reconstructed from the given text items. */
function section(items: TextItem[]): Section {
  return new Section(groupRows(items));
}

describe('Section.amountAndIdForLabelInSegment', () => {
  it('reads the amount right after the label on a single-field row', () => {
    const s = section(
      line(1, 560, [
        ['2b', 40],
        ['Taxable interest', 70],
        ['2,100', 520],
      ]),
    );
    expect(s.amountAndIdForLabelInSegment('taxable interest', ['3a', '3b', '4b'], '2b')).toEqual({
      value: 2100,
      lineId: '2b',
    });
  });

  it("reads each field's own amount on a shared 3a/3b row (no neighbor bleed)", () => {
    // Merged dividends row: "3a Qualified dividends 3a 1,000. b Ordinary dividends 3b 3,000."
    const s = section(
      line(1, 520, [
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
    );
    expect(s.amountAndIdForLabelInSegment('qualified dividends', ['3a', '3b', '4b'], '3a')?.value).toBe(1000);
    expect(s.amountAndIdForLabelInSegment('ordinary dividends', ['3a', '3b', '4b'], '3b')?.value).toBe(3000);
  });

  it('returns null when the labeled line has no amount in its segment', () => {
    const s = section(
      line(1, 300, [
        ['9', 40],
        ['Standard deduction or itemized deductions', 70],
        ['9', 460],
      ]),
    );
    expect(s.amountAndIdForLabelInSegment('standard deduction or itemized deductions', [], '9')).toBeNull();
  });

  it('reads a 1-2 digit amount without mistaking a reprinted id for it', () => {
    const s = section(
      line(1, 360, [
        ['6', 40],
        ['Capital gain or (loss)', 70],
        ['6', 460],
        ['7', 500],
      ]),
    );
    // '6' is the reprinted leading id; the real value is '7'.
    expect(s.amountAndIdForLabelInSegment('capital gain or (loss)', [])?.value).toBe(7);
  });

  it('reads the deduction on a merged 12a/12b/12c row when ownId is omitted', () => {
    // Year undetected → no ownId passed. The leading id (12a) must not bound its own segment, or the
    // scan stops at the reprinted 12a and never reaches the amount, misreading it as 12c's total.
    const s = section(
      line(1, 300, [
        ['12a', 40],
        ['Standard deduction or itemized deductions', 70],
        ['12a', 300],
        ['13,850', 340],
        ['12b', 400],
        ['0', 440],
        ['12c', 500],
        ['13,850', 540],
      ]),
    );
    expect(
      s.amountAndIdForLabelInSegment('standard deduction or itemized deductions', ['12a', '12b', '12c'])?.value,
    ).toBe(13850);
  });

  it('returns null when no row contains the label', () => {
    const s = section(
      line(1, 560, [
        ['2b', 40],
        ['Taxable interest', 70],
        ['2,100', 520],
      ]),
    );
    expect(s.amountAndIdForLabelInSegment('pensions and annuities', [])).toBeNull();
  });
});

describe('Section.amountForId', () => {
  it('reads the rightmost amount in a line id segment, skipping the reprinted id', () => {
    const s = section(
      line(1, 600, [
        ['1z', 40],
        ['Add lines 1a through 1h', 70],
        ['1z', 480],
        ['118,000', 520],
      ]),
    );
    expect(s.amountForId('1z', ['1z', '2b'])).toBe(118000);
  });

  it("bounds a shared row so a neighbor's amount can't bleed in", () => {
    const s = section(
      line(1, 520, [
        ['3a', 60],
        ['3a', 300],
        ['8,000', 340],
        ['3b', 560],
        ['9,500', 600],
      ]),
    );
    expect(s.amountForId('3a', ['3a', '3b'])).toBe(8000);
    expect(s.amountForId('3b', ['3a', '3b'])).toBe(9500);
  });
});

describe('Section.amountAndIdForLabelNear', () => {
  it('prefers the taxable amount in the row after the anchor, else the anchor row', () => {
    // Gross "Pensions and annuities" on one row, "Taxable amount" on the next.
    const s = section([
      ...line(1, 440, [
        ['5a', 40],
        ['Pensions and annuities', 70],
        ['40,000', 520],
      ]),
      ...line(1, 420, [
        ['b', 60],
        ['Taxable amount', 90],
        ['30,000', 520],
      ]),
    ]);
    expect(s.amountAndIdForLabelNear('pensions and annuities', 'taxable amount')?.value).toBe(30000);
  });

  it('returns null when the anchor label is absent', () => {
    const s = section(
      line(1, 560, [
        ['2b', 40],
        ['Taxable interest', 70],
        ['2,100', 520],
      ]),
    );
    expect(s.amountAndIdForLabelNear('pensions and annuities', 'taxable amount')).toBeNull();
  });
});
