import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  saveScenario,
  removeScenario,
  renameScenario,
  scenarioNames,
  type Scenarios,
} from './scenarios';
import { makeInput as input } from './tax/testUtils';

describe('normalizeName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeName('  Bonus year  ')).toBe('Bonus year');
  });

  it('returns null for empty or whitespace-only names', () => {
    expect(normalizeName('')).toBeNull();
    expect(normalizeName('   ')).toBeNull();
  });
});

describe('saveScenario', () => {
  it('adds a new named scenario', () => {
    const next = saveScenario({}, 'Base', input({ wages: 100 }));
    expect(next.Base.wages).toBe(100);
  });

  it('overwrites an existing name', () => {
    const start: Scenarios = { Base: input({ wages: 100 }) };
    const next = saveScenario(start, 'Base', input({ wages: 200 }));
    expect(next.Base.wages).toBe(200);
    expect(Object.keys(next)).toEqual(['Base']);
  });

  it('returns a new object without mutating the original', () => {
    const start: Scenarios = {};
    const next = saveScenario(start, 'Base', input());
    expect(next).not.toBe(start);
    expect(start).toEqual({});
  });

  it('stores a decoupled copy of the input', () => {
    const live = input({ wages: 100 });
    const next = saveScenario({}, 'Base', live);
    live.wages = 999;
    expect(next.Base.wages).toBe(100);
  });
});

describe('removeScenario', () => {
  it('removes a present key', () => {
    const start: Scenarios = { A: input(), B: input() };
    const next = removeScenario(start, 'A');
    expect(Object.keys(next)).toEqual(['B']);
  });

  it('is a no-op for an absent key and returns a new object', () => {
    const start: Scenarios = { A: input() };
    const next = removeScenario(start, 'missing');
    expect(next).toEqual(start);
    expect(next).not.toBe(start);
  });
});

describe('renameScenario', () => {
  it('moves a value from the old name to the new name', () => {
    const start: Scenarios = { Old: input({ wages: 100 }) };
    const next = renameScenario(start, 'Old', 'New');
    expect(next.New.wages).toBe(100);
    expect(next.Old).toBeUndefined();
  });

  it('overwrites when the new name collides with a different existing key', () => {
    const start: Scenarios = { Old: input({ wages: 100 }), Taken: input({ wages: 5 }) };
    const next = renameScenario(start, 'Old', 'Taken');
    expect(next.Taken.wages).toBe(100);
    expect(next.Old).toBeUndefined();
  });

  it('is a no-op when the old name does not exist', () => {
    const start: Scenarios = { A: input() };
    const next = renameScenario(start, 'missing', 'New');
    expect(next).toEqual(start);
  });

  it('stores a decoupled copy of the moved value', () => {
    const original = input({ wages: 100 });
    const start: Scenarios = { Old: original };
    const next = renameScenario(start, 'Old', 'New');
    next.New.wages = 999;
    expect(original.wages).toBe(100);
  });
});

describe('scenarioNames', () => {
  it('returns names in alphabetical order', () => {
    const scenarios: Scenarios = { charlie: input(), alpha: input(), bravo: input() };
    expect(scenarioNames(scenarios)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('returns an empty array for an empty collection', () => {
    expect(scenarioNames({})).toEqual([]);
  });
});
