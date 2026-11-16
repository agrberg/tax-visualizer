import { describe, it, expect, vi } from 'vitest';
import { clearStoredData, clearStoredInput, loadScenarios, saveScenarios } from './storage';
import { saveScenario } from './scenarios';
import { makeInput } from './tax/testUtils';

// Minimal in-memory localStorage for the node test env (no DOM by default).
function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  return store;
}

describe('clearStoredData', () => {
  it("removes only this app's keys and leaves unrelated origin data intact", () => {
    const store = stubLocalStorage();
    store.set('tax-visualizer:input:v1', '{}');
    store.set('tax-visualizer:saved:v1', '{}');
    store.set('other-app:data', 'keep');
    clearStoredData();
    expect(store.has('tax-visualizer:input:v1')).toBe(false);
    expect(store.has('tax-visualizer:saved:v1')).toBe(false);
    expect(store.get('other-app:data')).toBe('keep');
    vi.unstubAllGlobals();
  });

  it('swallows and logs a removeItem failure instead of throwing (recovery path)', () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('storage access denied');
      },
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => clearStoredData()).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('clearStoredInput', () => {
  it('removes only the saved input, leaving scenarios and unrelated data in place', () => {
    const store = stubLocalStorage();
    store.set('tax-visualizer:input:v1', '{}');
    store.set('tax-visualizer:saved:v1', '{}');
    store.set('other-app:data', 'keep');
    clearStoredInput();
    expect(store.has('tax-visualizer:input:v1')).toBe(false);
    expect(store.get('tax-visualizer:saved:v1')).toBe('{}');
    expect(store.get('other-app:data')).toBe('keep');
    vi.unstubAllGlobals();
  });

  it('swallows and logs a removeItem failure instead of throwing (recovery path)', () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('storage access denied');
      },
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => clearStoredInput()).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('scenario names that collide with Object.prototype', () => {
  it.each(['__proto__', 'constructor', 'toString'])('round-trips a scenario named %s through storage', (name) => {
    stubLocalStorage();
    saveScenarios(saveScenario({}, name, makeInput()));
    expect(Object.keys(loadScenarios())).toEqual([name]);
    vi.unstubAllGlobals();
  });
});
