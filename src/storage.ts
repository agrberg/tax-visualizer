import type { TaxInput } from './tax/types';
import { normalizeInput } from './tax/input';
import type { Scenarios } from './scenarios';

const KEY = 'tax-visualizer:input:v1';
const SCENARIOS_KEY = 'tax-visualizer:saved:v1';

export function loadInput(): TaxInput | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeInput(JSON.parse(raw) as TaxInput) : null;
  } catch {
    return null;
  }
}

export function saveInput(input: TaxInput): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function loadScenarios(): Scenarios {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Scenarios).map(([name, value]) => [name, normalizeInput(value)]),
    );
  } catch {
    return {};
  }
}

export function saveScenarios(scenarios: Scenarios): void {
  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

/** Remove only the saved input, keeping named scenarios — the first recovery step for corrupted input. */
export function clearStoredInput(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.error('Failed to clear saved tax-visualizer input:', err);
  }
}

/** Remove only this app's persisted keys — used to recover from corrupted saved input. */
export function clearStoredData(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SCENARIOS_KEY);
  } catch (err) {
    // On the recovery path, surface the failure rather than swallowing it silently:
    // if the reset can't clear storage, the reload will hit the same corrupt data.
    console.error('Failed to clear saved tax-visualizer data:', err);
  }
}
