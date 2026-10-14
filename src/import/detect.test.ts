import { describe, it, expect, beforeAll } from 'vitest';
import { detectFilingStatus, detectTaxYear } from './detect';
import { groupRows, type TextItem } from './rows';
import { setImportLogging } from './importLog';
import { line } from '../test/importFixtures';

beforeAll(() => setImportLogging(false));

/** Build a row of `[text, x]` cells at baseline `y` on page 1. */
const rowItems = (y: number, cells: [string, number][]): TextItem[] => line(1, y, cells);

describe('detectFilingStatus', () => {
  it.each([
    ['Married filing jointly', 'mfj'],
    ['Married filing separately', 'mfs'],
    ['Head of household', 'hoh'],
    ['Single', 'single'],
  ])('matches the label following a checkmark on the same row: %s', (label, expected) => {
    const rows = groupRows(
      rowItems(700, [
        ['x', 40],
        [label, 70],
      ]),
    );
    expect(detectFilingStatus(rows)).toBe(expected);
  });

  it.each(['☒', '✗', '✓', '■'])('recognizes checkbox glyph %s', (glyph) => {
    const rows = groupRows(
      rowItems(700, [
        [glyph, 40],
        ['Single', 70],
      ]),
    );
    expect(detectFilingStatus(rows)).toBe('single');
  });

  it('returns null when a status label has no checkmark beside it', () => {
    const rows = groupRows(rowItems(700, [['Single', 70]]));
    expect(detectFilingStatus(rows)).toBeNull();
  });

  it('returns null when a checkmark is followed by no known status label', () => {
    const rows = groupRows(
      rowItems(700, [
        ['x', 40],
        ['Dependents', 70],
      ]),
    );
    expect(detectFilingStatus(rows)).toBeNull();
  });
});

describe('detectTaxYear', () => {
  it('reads a bare 20xx token', () => {
    expect(detectTaxYear(groupRows(rowItems(760, [['2025', 500]])))).toBe(2025);
  });

  it('reads a parenthesized (20xx) token', () => {
    expect(detectTaxYear(groupRows(rowItems(760, [['(2024)', 500]])))).toBe(2024);
  });

  it('returns the first year token encountered', () => {
    const rows = groupRows([...rowItems(760, [['2023', 500]]), ...rowItems(700, [['2025', 500]])]);
    expect(detectTaxYear(rows)).toBe(2023);
  });

  it('returns null when no year-shaped token is present', () => {
    expect(
      detectTaxYear(
        groupRows(
          rowItems(760, [
            ['form', 40],
            ['1040', 90],
          ]),
        ),
      ),
    ).toBeNull();
  });
});
