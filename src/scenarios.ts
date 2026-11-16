import type { TaxInput } from './tax/types';

export type Scenarios = Record<string, TaxInput>;

export function normalizeName(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

export function saveScenario(scenarios: Scenarios, name: string, input: TaxInput): Scenarios {
  return { ...scenarios, [name]: { ...input } };
}

export function removeScenario(scenarios: Scenarios, name: string): Scenarios {
  const next = { ...scenarios };
  delete next[name];
  return next;
}

export function renameScenario(scenarios: Scenarios, oldName: string, newName: string): Scenarios {
  if (!hasScenario(scenarios, oldName)) return { ...scenarios };
  const { [oldName]: value, ...rest } = scenarios;
  return { ...rest, [newName]: { ...value } };
}

// Own-property check: a name like "constructor" must not match an inherited Object.prototype member.
export function hasScenario(scenarios: Scenarios, name: string): boolean {
  return Object.hasOwn(scenarios, name);
}

export function scenarioNames(scenarios: Scenarios): string[] {
  return Object.keys(scenarios).sort((a, b) => a.localeCompare(b));
}
