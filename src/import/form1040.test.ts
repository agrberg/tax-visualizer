import { describe, it, expect, beforeAll } from 'vitest';
import { Form1040, haveEverythingNeeded } from './form1040';
import type { TextItem } from './rows';
import { setImportLogging } from './importLog';

beforeAll(() => setImportLogging(false));

/** Build a row of text items at baseline `y` on `page` from [text, x] cells. */
function line(page: number, y: number, cells: [string, number][]): TextItem[] {
  return cells.map(([text, x]) => ({
    text: text.trim().toLowerCase(),
    originalText: text,
    x,
    y,
    width: text.length * 6,
    page,
  }));
}

/** The masthead that marks a page as the 1040 face. */
function faceHeader(page = 1, year?: string): TextItem[] {
  return line(page, 738, [
    ['Form', 40],
    ['1040', 70],
    ['U.S. Individual Income Tax Return', 120],
    ...(year ? ([[year, 460]] as [string, number][]) : []),
  ]);
}

describe('Form1040.from', () => {
  it('detects the header and reads a face line by id', () => {
    const form = Form1040.from([
      ...faceHeader(1, '2025'),
      ...line(1, 700, [
        ['Filing Status', 40],
        ['X', 70],
        ['Single', 90],
      ]),
      ...line(1, 600, [
        ['1z', 40],
        ['Add lines 1a through 1h', 70],
        ['118,000', 520],
      ]),
    ]);
    expect(form.filingStatus).toBe('single');
    expect(form.taxYear).toBe(2025);
    expect(form.amountForId('1z')).toBe(118000);
  });

  it('exposes Schedule D as a queryable section when attached', () => {
    const form = Form1040.from([
      ...faceHeader(),
      ...line(3, 750, [
        ['SCHEDULE D', 40],
        ['(Form 1040)', 130],
        ['Capital Gains and Losses', 220],
      ]),
      ...line(3, 500, [
        ['7', 40],
        ['Net short-term gain or (loss)', 70],
        ['7', 300],
        ['4,000', 340],
      ]),
      ...line(3, 300, [
        ['15', 40],
        ['Net long-term gain or (loss)', 70],
        ['15', 300],
        ['9,000', 340],
      ]),
    ]);
    expect(form.scheduleD).not.toBeNull();
    expect(form.scheduleD?.amountForId('7', ['7', '15'])).toBe(4000);
    expect(form.scheduleD?.amountForId('15', ['7', '15'])).toBe(9000);
  });

  it('has a null Schedule D when the return carries none', () => {
    const form = Form1040.from([
      ...faceHeader(),
      ...line(1, 360, [
        ['7a', 40],
        ['Capital gain or (loss)', 70],
        ['7a', 300],
        ['15,000', 340],
      ]),
    ]);
    expect(form.scheduleD).toBeNull();
    expect(form.amountForId('7a')).toBe(15000);
  });

  it('scopes face queries to the face pages, ignoring a colliding id on a later schedule', () => {
    const form = Form1040.from([
      ...faceHeader(),
      ...line(1, 360, [
        ['7a', 40],
        ['Capital gain or (loss)', 70],
        ['7a', 300],
        ['15,000', 340],
      ]),
      // Schedule 2 begins page 2, so the face ends at page 1.
      ...line(2, 750, [
        ['SCHEDULE 2', 40],
        ['(Form 1040)', 130],
        ['Additional Taxes', 220],
      ]),
      ...line(2, 500, [
        ['7', 40],
        ['Some Schedule 2 line', 70],
        ['7', 300],
        ['999', 340],
      ]),
    ]);
    expect(form.amountForId('7a', ['7a'])).toBe(15000);
    expect(form.amountForId('7')).toBeNull(); // line 7 sits only on the schedule, outside the face
  });

  it('reads a face line that drifted onto page 2 (face bounded by the page-3 schedule)', () => {
    const form = Form1040.from([
      ...faceHeader(),
      ...line(2, 600, [
        ['12e', 40],
        ['Standard deduction or itemized deductions', 70],
        ['12e', 300],
        ['21,900', 340],
      ]),
      ...line(3, 750, [
        ['SCHEDULE D', 40],
        ['(Form 1040)', 130],
      ]),
    ]);
    expect(form.amountForId('12e')).toBe(21900);
  });

  it('delegates label queries to the face (whole-row and windowed)', () => {
    const form = Form1040.from([
      ...faceHeader(),
      ...line(1, 420, [
        ['5a', 40],
        ['Pensions and annuities', 70],
        ['40,000', 520],
      ]),
      ...line(1, 400, [
        ['b', 60],
        ['Taxable amount', 90],
        ['30,000', 520],
      ]),
    ]);
    expect(form.amountAndIdForLabel('pensions and annuities')?.value).toBe(40000);
    expect(form.amountAndIdForLabelNear('pensions and annuities', 'taxable amount')?.value).toBe(30000);
  });
});

describe('haveEverythingNeeded', () => {
  const facePage = line(1, 738, [
    ['Form', 40],
    ['1040', 70],
    ['U.S. Individual Income Tax Return', 120],
  ]);
  const schedule1 = line(2, 500, [
    ['SCHEDULE 1', 40],
    ['Additional Income and Adjustments to Income', 200],
  ]);
  const scheduleD = line(3, 750, [
    ['SCHEDULE D', 40],
    ['(Form 1040)', 130],
    ['Capital Gains and Losses', 220],
  ]);

  it('signals done at the last needed page (Schedule D) once the face has been seen', () => {
    const stop = haveEverythingNeeded();
    expect(stop(facePage)).toBe(false); // the face itself — keep reading toward the last needed page
    expect(stop(schedule1)).toBe(false); // an intervening schedule — keep going
    expect(stop(scheduleD)).toBe(true); // Schedule D — nothing the importer reads lies past here
  });

  it('does not signal done on a Schedule-D-looking page seen before the face', () => {
    // A worksheet before the 1040 could mention "Capital Gains and Losses"; stopping there would
    // skip the return entirely. The face must be seen first.
    const stop = haveEverythingNeeded();
    expect(stop(scheduleD)).toBe(false);
  });

  it('never signals done when the face is never found (reads the whole document, as before)', () => {
    const stop = haveEverythingNeeded();
    expect(stop(schedule1)).toBe(false);
    expect(stop(scheduleD)).toBe(false);
  });
});
