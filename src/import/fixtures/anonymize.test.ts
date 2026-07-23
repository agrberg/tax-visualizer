import { describe, it, expect, beforeAll } from 'vitest';
import { setImportLogging } from '../importLog';
import { extract1040Fields } from '../extract1040';
import type { TextItem } from '../rows';
import { anonymize } from './anonymize';
import { rebuildPdf } from './rebuildPdf';
import { readPdfInNode } from './readPdfInNode';
import { FIXTURE_PROFILES, type FixtureProfile } from './profiles';

beforeAll(() => setImportLogging(false));

const profileFor = (year: number): FixtureProfile => FIXTURE_PROFILES.find((p) => p.taxYear === year)!;
const LETTER = { width: 612, height: 792 };
const REAL_AMOUNT = '987,654'; // a stand-in for the real (to-be-scrubbed) figures on every income line

// The printed label a given line id carries — enough for the extractor's label cross-checks to agree
// with the id reads (so no spurious mismatch warnings), and to prove labels survive anonymization.
const LABEL_FOR: Record<string, string> = {
  '1z': 'Add lines 1a through 1h',
  '2b': 'Taxable interest',
  '3a': 'Qualified dividends',
  '3b': 'Ordinary dividends',
  '4b': 'IRA distributions Taxable amount',
  '4d': 'Pensions and annuities Taxable amount',
  '5b': 'Pensions and annuities Taxable amount',
  '6': 'Capital gain or (loss)',
  '7': 'Capital gain or (loss)',
  '7a': 'Capital gain or (loss)',
  '9': 'Standard deduction or itemized deductions',
  '12': 'Standard deduction or itemized deductions',
  '12a': 'Standard deduction or itemized deductions',
  '12e': 'Standard deduction or itemized deductions',
};

function row(page: number, y: number, cells: [string, number][]): TextItem[] {
  return cells.map(([text, x]) => ({ text, originalText: text, x, y, width: text.length * 6, page }));
}

// A structurally faithful but entirely made-up "real" 1040 for a profile: header + filing status,
// three identity rows (name / SSN / address) that must be scrubbed, and every profile line printed
// with REAL_AMOUNT (which anonymize must overwrite with the profile's synthetic value). Schedule D
// lines land on page 2; everything else on the face page 1.
function syntheticRealForm(profile: FixtureProfile): TextItem[] {
  const items: TextItem[] = [];
  let y = 740;
  const nextY = () => (y -= 24);

  items.push(
    ...row(1, nextY(), [
      ['Form', 40],
      ['1040', 70],
      ['U.S. Individual Income Tax Return', 120],
      [String(profile.taxYear), 540],
    ]),
  );
  items.push(
    ...row(1, nextY(), [
      ['X', 40],
      ['Single', 60],
      ['Married filing jointly', 160],
      ['Head of household', 320],
    ]),
  );
  // PII rows — no line id, no known label; anonymize must drop them wholesale.
  items.push(...row(1, nextY(), [['John Q Public', 60]]));
  items.push(
    ...row(1, nextY(), [
      ['Your social security number', 60],
      ['123-45-6789', 460],
    ]),
  );
  items.push(...row(1, nextY(), [['123 Main Street, Anytown', 60]]));

  for (const line of profile.lines.filter((l) => l.where === 'face')) {
    items.push(
      ...row(1, nextY(), [
        [line.id, 40],
        [LABEL_FOR[line.id] ?? 'Line', 70],
        [REAL_AMOUNT, 520],
      ]),
    );
  }

  const scheduleDLines = profile.lines.filter((l) => l.where === 'scheduleD');
  if (scheduleDLines.length > 0) {
    let y2 = 740;
    items.push(
      ...row(2, y2, [
        ['SCHEDULE D', 40],
        ['(Form 1040)', 120],
        ['Capital Gains and Losses', 260],
      ]),
    );
    const shortLabel = 'Net short-term capital gain or (loss)';
    const longLabel = 'Net long-term capital gain or (loss)';
    for (const line of scheduleDLines) {
      y2 -= 24;
      items.push(
        ...row(2, y2, [
          [line.id, 40],
          [line.id === '7' ? shortLabel : longLabel, 70],
          [REAL_AMOUNT, 520],
        ]),
      );
    }
  }
  return items;
}

async function extractFromRebuilt(items: TextItem[]) {
  const pages = Math.max(...items.map((i) => i.page));
  const bytes = await rebuildPdf(
    items,
    Array.from({ length: pages }, () => LETTER),
  );
  const { items: read } = await readPdfInNode(bytes);
  return extract1040Fields(read);
}

describe('anonymize', () => {
  it('drops identity rows entirely — no name or SSN survives', () => {
    const out = anonymize(syntheticRealForm(profileFor(2024)), profileFor(2024));
    const text = out.map((i) => i.text).join(' ');
    expect(text).not.toContain('123-45-6789');
    expect(text).not.toContain('John');
    expect(text).not.toContain('Main Street');
  });

  it('overwrites every real amount with the profile synthetic value', () => {
    const out = anonymize(syntheticRealForm(profileFor(2024)), profileFor(2024));
    expect(out.map((i) => i.text).join(' ')).not.toContain(REAL_AMOUNT);
  });

  it('keeps structural text: form header, tax year, filing status, line ids and labels', () => {
    const out = anonymize(syntheticRealForm(profileFor(2024)), profileFor(2024));
    const text = out.map((i) => i.text).join(' ');
    expect(text).toContain('1040');
    expect(text).toContain('2024');
    expect(text).toContain('Single');
    expect(text).toContain('Taxable interest');
  });

  it('round-trips a pre-2025 face-only return to exactly the expected fields', async () => {
    const profile = profileFor(2024);
    const { fields } = await extractFromRebuilt(anonymize(syntheticRealForm(profile), profile));
    expect(fields).toEqual(profile.expected);
  });

  it('round-trips the 2025 return with a Schedule D split and standard deduction', async () => {
    const profile = profileFor(2025);
    const { fields } = await extractFromRebuilt(anonymize(syntheticRealForm(profile), profile));
    expect(fields).toEqual(profile.expected);
    expect(fields.shortTermGains).toBe(4000);
    expect(fields.longTermGains).toBe(11000);
    expect(fields.deduction).toBeNull();
  });
});
