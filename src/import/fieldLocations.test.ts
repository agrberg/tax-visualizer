import { describe, it, expect } from 'vitest';
import {
  currentLineId,
  DRIFTING_FIELD_IDS,
  EARLIEST_MAPPED_YEAR,
  lineIdForYear,
  STABLE_FIELD_IDS,
} from './fieldLocations';

describe('fieldLocations — stable ids', () => {
  it('maps the never-drifting fields to their fixed line ids', () => {
    expect(STABLE_FIELD_IDS.interest).toBe('2b');
    expect(STABLE_FIELD_IDS.qualifiedDividends).toBe('3a');
    expect(STABLE_FIELD_IDS.ordinaryDividends).toBe('3b');
    expect(STABLE_FIELD_IDS.iraDistributions).toBe('4b');
  });
});

describe('fieldLocations — lineIdForYear (drifting)', () => {
  it('resolves each field at its change-point years', () => {
    expect(lineIdForYear('wages', 2019)).toBe('1');
    expect(lineIdForYear('wages', 2022)).toBe('1z');

    expect(lineIdForYear('pensions', 2019)).toBe('4d');
    expect(lineIdForYear('pensions', 2020)).toBe('5b');

    expect(lineIdForYear('capitalGain', 2019)).toBe('6');
    expect(lineIdForYear('capitalGain', 2020)).toBe('7');
    expect(lineIdForYear('capitalGain', 2025)).toBe('7a');

    expect(lineIdForYear('deduction', 2019)).toBe('9');
    expect(lineIdForYear('deduction', 2020)).toBe('12');
    expect(lineIdForYear('deduction', 2021)).toBe('12a');
    expect(lineIdForYear('deduction', 2022)).toBe('12');
    expect(lineIdForYear('deduction', 2025)).toBe('12e');
  });

  it('inherits the most recent prior change-point for an unlisted year (no per-year duplication)', () => {
    // 2023/2024 have no entry → they resolve to the 2022 change-point.
    expect(lineIdForYear('deduction', 2023)).toBe(lineIdForYear('deduction', 2022));
    expect(lineIdForYear('deduction', 2024)).toBe(lineIdForYear('deduction', 2022));
    expect(lineIdForYear('capitalGain', 2024)).toBe(lineIdForYear('capitalGain', 2020));
    // A far-future year inherits the latest change-point until a new one is added.
    expect(lineIdForYear('deduction', 2030)).toBe(lineIdForYear('deduction', 2025));
  });

  it('resolves 2019 pensions to 4d, never 5b (the Social-Security trap the year map sidesteps)', () => {
    expect(lineIdForYear('pensions', 2019)).toBe('4d');
  });

  it('returns null for a year older than the earliest mapping (caller falls back to label)', () => {
    expect(lineIdForYear('wages', EARLIEST_MAPPED_YEAR - 1)).toBeNull();
    expect(lineIdForYear('deduction', 2017)).toBeNull();
  });

  it('derives EARLIEST_MAPPED_YEAR from the map (oldest change-point)', () => {
    expect(EARLIEST_MAPPED_YEAR).toBe(2019);
  });

  it('keeps every drifting list sorted newest-first so the first match wins', () => {
    for (const points of Object.values(DRIFTING_FIELD_IDS)) {
      const years = points.map((p) => p.since);
      const descending = [...years].sort((a, b) => b - a);
      expect(years).toEqual(descending);
    }
  });

  it('currentLineId returns the newest change-point id for each drifting field', () => {
    expect(currentLineId('wages')).toBe('1z');
    expect(currentLineId('pensions')).toBe('5b');
    expect(currentLineId('capitalGain')).toBe('7a');
    expect(currentLineId('deduction')).toBe('12e');
  });
});
