# Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the defects found in the 2026-11-16 codebase review: the fixture anonymizer leak on the open fixture branch, the wrong marginal rate under capital losses, three data-loss edge cases, split input validation, and the dependency and CI gaps.

**Architecture:** Six independent work groups, one branch each. Group 1 runs on the existing fixture branch. Groups 2 to 6 start from `origin/main`. Group 4 is stacked on group 3 because both edit `src/storage.ts`. Every design decision is already made in this plan; where a step says "stop and report", the executor does not improvise.

**Tech Stack:** TypeScript 6, React 19, Vite 8, Vitest 4, oxlint, Prettier, pdf.js (`pdfjs-dist`), pdf-lib, GitHub Actions.

**Spec:** None. The review findings are restated in each task. Recommended executor model: Sonnet. Every task is fully specified, so no task needs a larger model.

## Global Constraints

- **Do not push, open a PR, edit a PR, reply to review threads, force-push, or delete a branch.** Finish with local commits and report. The repository is public and the user decides what leaves the machine.
- **Never print fixture or return content.** Do not `cat`, log, echo, or paste text from `fixtures-src/` or from `src/import/fixtures/*.pdf`. Report counts and lengths only. No real name, address, or dollar figure from a return may appear in code, tests, commit messages, or your report.
- **Never loosen a test to make it pass.** If an existing test fails after your change, or a new invariant test fails on real data, stop and report the failure output.
- **Worktrees:** groups 2 to 6 each run in their own worktree. Create it with the `EnterWorktree` tool, passing `name:` only. Inside it run `git switch -c <branch> origin/main` (group 4: see its header), then `npm ci`. Leave with `ExitWorktree`.
- **Group 1 is the exception:** it runs in the main checkout at `/Users/agrberg/code/tax-visualizer` on the already checked-out branch `ar/realistic-test-1040s`, because it needs the gitignored `fixtures-src/` directory.
- **Branch names:** lowercase, `ar/<short-description>`, exactly as given in each group header.
- **Staging:** `git add <explicit paths>` only. Never `git add -A` or `git add .`.
- **Before any `git commit --amend`:** run `git log -1 --format='%H %s'` and confirm the commit is yours. Do not use `--no-edit`.
- **Commit messages** end with the line `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Gate before every commit:** `npx prettier --write <each touched file>`, then `npm run lint`, `npm test`, `npm run build`. All four must succeed.
- **Regexes:** every new regex is a named module constant with a `https://regexper.com/#<url-encoded-pattern>` comment. Generate the encoded part with `node -p 'encodeURIComponent(String.raw`<pattern>`)'`.
- **Code style:** match the surrounding file. Descriptive names. No comments except a one-line "why" for a non-obvious invariant. `arrowParens: "always"`. Do not touch code a task does not name.
- **Docs sync:** when a task adds a file under `src/` or changes what a module owns, update the module tables in `CLAUDE.md`, `README.md` ("Where things live"), and `ARCHITECTURE.md` in the same commit. Write docs as a snapshot of the current state, with no history notes.
- **Node 24** (`.tool-versions`).

## Review Focus

1. A face-page label that contains IRS boilerplate money text (for example a threshold inside a long label) will fail the new fixture money-token test. Expected: stop and report, not weaken the test. Owned by Task 1.3.
2. Income exactly on a bracket boundary must report the next bracket's rate for the next dollar. Owned by Task 2.1 (boundary test).
3. A scenario named `__proto__`, `constructor`, or `toString` must save, reload, rename, and delete like any other name. Owned by Task 3.1.
4. A share link opened on a machine with no saved input must still let the first edit persist. Owned by Task 3.2.
5. A stored or shared amount that is fractional or astronomically large must normalize to a whole number within bounds. Owned by Task 4.1.

---

## Group 1: Fixture anonymizer leak

**Branch:** `ar/realistic-test-1040s` (existing, already checked out in the main checkout). **Do not push.**

**Problem:** The committed fixture PDFs carry text from the real returns. Measured by counts only: 16 to 25 pages per fixture, 54 to 99 rows after page 2 that are more than a bare form marker, items from cover pages ahead of the 1040 face in the 2019 and 2022 fixtures, and one money-shaped token on a pre-face page in the 2022 fixture that is not a profile value. Cause: `anonymize.ts` keeps marker text from every page, and keeps whole text items, so a long sentence that mentions "form 1040" survives intact.

### Task 1.1: Scope structural markers to the face and Schedule D, and synthesize them

**Files:**
- Modify: `src/import/fixtures/anonymize.ts:49-57` (the `structuralItems` loop) and the helpers it uses
- Modify: `src/import/fixtures/anonymize.test.ts` (helper `row`, the `syntheticRealForm` builder, new tests)

**Interfaces:**
- Consumes: `FACE_MARKERS`, `SCHEDULE_D_HEADER`, `faceEndPage` from `../form1040`; `FixtureProfile` from `./profiles`.
- Produces: `anonymize(items, profile)` keeps its signature. New guarantee: every returned item is on a face page or the Schedule D page, and no returned marker item contains text beyond the marker itself.

- [ ] **Step 1: Make the test helper faithful to ingestion.** In `anonymize.test.ts`, change `row()` to set `text: text.trim().toLowerCase()` and keep `originalText: text`. Update the existing assertions in the `anonymize` describe block to use lower-case needles against `text` (`'john'`, `'main street'`, `'taxable interest'`). Run `npx vitest run src/import/fixtures/anonymize.test.ts`. Expected: PASS (5 tests).

- [ ] **Step 2: Write the failing tests.** Add a builder `leakyRealForm(profile)` that returns `syntheticRealForm(profile)` with every page number shifted up by 1, plus these extra rows (use `row()`):
  - page 1 (a cover page ahead of the face), one single item: `'Enclosed is your Form 1040 for John Q Public showing a refund of $1,234.56'`
  - the last face page, one single item on its own baseline: `'Form 1040 (2024) John Q Public 123-45-6789 Page 2'`
  - a worksheet page numbered `WORKSHEET_PAGE` = the highest shifted page number + 3 (so it is beyond the two-page default face span), one single item: `'Enter the amount from Form 1040, line 11 for John Q Public 987,654'`

  Add three tests using `profileFor(2024)`:

```ts
it('keeps nothing from pages outside the face and Schedule D', () => {
  const out = anonymize(leakyRealForm(profile), profile);
  const pages = new Set(out.map((i) => i.page));
  expect(pages.has(1)).toBe(false); // the cover page
  expect(pages.has(WORKSHEET_PAGE)).toBe(false);
});

it('keeps only the marker from a single-item footer, not the identity text glued to it', () => {
  const text = anonymize(leakyRealForm(profile), profile)
    .flatMap((i) => [i.text, i.originalText])
    .join(' ')
    .toLowerCase();
  expect(text).not.toContain('john');
  expect(text).not.toContain('public');
  expect(text).not.toContain('123-45-6789');
  expect(text).not.toContain('1,234.56');
  expect(text).not.toContain('987,654');
});

it('still round-trips the leaky form to exactly the expected fields', async () => {
  const { fields } = await extractFromRebuilt(anonymize(leakyRealForm(profile), profile));
  expect(fields).toEqual(profile.expected);
});
```

  If `extractFromRebuilt` takes a page count, pass enough pages for the shifted form.

- [ ] **Step 3: Run to verify failure.** `npx vitest run src/import/fixtures/anonymize.test.ts`. Expected: the first two new tests FAIL.

- [ ] **Step 4: Implement.** Replace the `structuralItems` loop with a function `syntheticMarkerItems(rows, facePage, lastFacePage, scheduleDPage, taxYear): TextItem[]`:
  - Consider only rows with `facePage <= row.page <= lastFacePage` for `FACE_MARKERS`, and only rows on `scheduleDPage` for `SCHEDULE_D_HEADER`.
  - Locate the marker with the existing `itemsSatisfying`. Do **not** return the matched items. Return one new `TextItem` per match, positioned at the first matched item's `x`, `y`, `page`, with `width: text.length * 5`.
  - Text of the new item, by marker:

    | Marker | `text` | `originalText` |
    | --- | --- | --- |
    | `FACE_MARKERS[0]` | `u.s. individual income tax return` | `U.S. Individual Income Tax Return` |
    | `FACE_MARKERS[1]` | `` `form 1040 (${taxYear})` `` | `` `Form 1040 (${taxYear})` `` |
    | `SCHEDULE_D_HEADER` | `schedule d (form 1040)` | `SCHEDULE D (Form 1040)` |

  - Call it with `profile.taxYear`. Leave `stampLine`, `syntheticFilingStatusRow`, and `ensureYearToken` as they are.
  - Update the doc comment on `anonymize` and on `itemsSatisfying` to describe the new behavior (snapshot style).

- [ ] **Step 5: Run to verify pass.** `npx vitest run src/import/fixtures`. Expected: PASS.

- [ ] **Step 6: Commit.** Paths: `src/import/fixtures/anonymize.ts`, `src/import/fixtures/anonymize.test.ts`. Message: `Keep only synthetic markers from face and Schedule D pages in fixtures`.

### Task 1.2: Draw the printed casing, and make the builder's verification strict

**Files:**
- Modify: `src/import/fixtures/rebuildPdf.ts:75`
- Modify: `scripts/build-1040-fixtures.ts:43-50` (`verify`)
- Modify: `src/import/fixtures/pdfRoundtrip.test.ts`

- [ ] **Step 1: Write the failing test.** In `pdfRoundtrip.test.ts` add:

```ts
it('draws the printed casing (originalText), which reads back lower-cased in text', async () => {
  const mixed: TextItem[] = [{ text: 'form 1040', originalText: 'Form 1040', x: 50, y: 700, width: 40, page: 1 }];
  const { items: read } = await readPdfInNode(await rebuildPdf(mixed, [LETTER]));
  expect(read[0].originalText).toBe('Form 1040');
  expect(read[0].text).toBe('form 1040');
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/import/fixtures/pdfRoundtrip.test.ts`. Expected: FAIL on `originalText`.

- [ ] **Step 3: Implement.** In `rebuildPdf`, draw `toWinAnsiSafe(item.originalText.trim())` instead of `item.text`. Fix the two comments that say the fixture is drawn from normalized text.

- [ ] **Step 4: Make `verify` exact.** In `scripts/build-1040-fixtures.ts`, `verify(profile, fields)` must also report every key present in `fields` and absent from `profile.expected` as `  <key>: unexpected field`. Iterate the union of both key sets.

- [ ] **Step 5: Run.** `npx vitest run src/import/fixtures`. Expected: PASS.

- [ ] **Step 6: Commit.** Paths: the three files above. Message: `Rebuild fixtures in printed casing and verify extracted fields exactly`.

### Task 1.3: Guard the committed fixtures, then regenerate them

**Files:**
- Modify: `src/import/fixtures.test.ts`
- Regenerate: `src/import/fixtures/1040-2019.pdf` to `1040-2025.pdf`

- [ ] **Step 1: Rewrite the per-fixture guards in `fixtures.test.ts`.**
  - Remove the `existsSync` / `it.skip` switch. Add one test per year: `expect(existsSync(pathFor(taxYear))).toBe(true)`. All other tests use plain `it`.
  - In the extraction test, replace the `if / else` on `profile.expected.taxYear` with `expect(fields.taxYear).toBe(taxYear)`.
  - Add a module constant `MONEY_TOKEN = /\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\b\d+\.\d{2}\b/g` with its regexper link.
  - Add one test per year, `carries only synthetic structure in the ${taxYear} fixture`:

```ts
const { items, pageSizes } = await readPdfInNode(pathFor(taxYear));
expect(pageSizes.length).toBeLessThanOrEqual(profile.hasScheduleD ? 3 : 2);
const profileAmounts = new Set(profile.lines.map((l) => Math.abs(l.amount)));
const moneyTokens = items.flatMap((i) => i.text.match(MONEY_TOKEN) ?? []);
for (const token of moneyTokens) {
  expect(profileAmounts.has(Number(token.replace(/,/g, '').split('.')[0]))).toBe(true);
}
expect(items.some((i) => /[A-Z]/.test(i.originalText))).toBe(true);
```

  - Update the comment above the describe block: the fixtures are committed and a missing one fails.

- [ ] **Step 2: Run to verify failure against the old PDFs.** `npx vitest run src/import/fixtures.test.ts`. Expected: the new `carries only synthetic structure` tests FAIL (page count, and upper-case).

- [ ] **Step 3: Regenerate.** Run `npm run build:fixtures`. Expected final line: `Built 7 fixture(s).` with seven `✓` lines.
  - If any year prints `✗`, or fewer than 7 are built: **stop and report** the year and the mismatched field names. Do not edit profiles, tests, or the extractor to get past it.

- [ ] **Step 4: Run the full gate.** `npm test`. Expected: all pass.
  - If a `carries only synthetic structure` test fails on the money-token loop: **stop and report** the year and the count of offending tokens. Do not print the tokens.

- [ ] **Step 5: Commit.** Paths: `src/import/fixtures.test.ts` and the seven PDFs by explicit path. Message: `Regenerate fixtures from face and Schedule D only; fail on missing or unclean fixtures`.

### Task 1.4: Bring the fixture docs up to date

**Files:**
- Modify: `src/import/fixtures/README.md:12-14`, `src/import/fixtures/devSamples.ts:4-5`, `src/import/fixtures/profiles.ts:40-42`, `scripts/build-1040-fixtures.ts` (`compactPages` comment), `CLAUDE.md` (the "Realistic per-year fixtures" paragraph), `ARCHITECTURE.md` (the matching passage, if present)

- [ ] **Step 1: Edit.** Each passage must describe the current state:
  - The seven fixtures are committed. A missing fixture fails the test.
  - Markers (form title, form number with year, Schedule D header, filing status) are synthetic; only the mapped line rows come from the real layout.
  - Fixtures are drawn in printed casing.
  - `profiles.ts`: the 2025 profile prints the standard deduction and imports as `null`; the others print a custom amount.

- [ ] **Step 2: Gate and commit.** Message: `Update fixture docs to match the committed, synthetic-marker fixtures`.

- [ ] **Step 3: Report and stop.** Report: commits made, fixture page counts per year, and that the old PDF blobs are still reachable in pushed commit `60db59f`. State that removing them from the public branch needs a history rewrite, which is the user's decision. Do not push.

---

## Group 2: Marginal rate under capital losses

**Branch:** `ar/marginal-rate-capital-loss` from `origin/main`.

**Problem:** `marginalNextDollar` reads the rate at a position on a ladder. With a net capital loss, the next dollar of gain is absorbed by the loss or taxed in a different pool, so the reported rate is wrong. Example: MFS 2022, wages 309,092, retirement 1,792, interest 11,315, non-qualified dividends 2,042, long-term gains −323,530. The card reports 23.8% for the next long-term gain dollar; one more dollar adds $0 of tax.

**Design (already validated against the current implementation on 16,527 random no-loss inputs: identical output):** compute each card as a real one-dollar recalculation, and split out the gain cards only when a loss makes them differ.

### Task 2.1: Compute the next-dollar cards by recalculation

**Files:**
- Modify: `src/tax/types.ts` (`TaxResult`, `MarginalScenario`)
- Modify: `src/tax/calculate.ts`
- Modify: `src/tax/marginal.ts`
- Modify: `src/tax/surcharges.ts`, `src/tax/surcharges.test.ts`
- Create: `src/tax/marginal.test.ts`

**Interfaces:**
- Produces: `TaxResult.input: TaxInput` (the input the result was computed from).
- Produces: `MarginalScenario['key']` is `'wages' | 'ordinaryInvestment' | 'retirement' | 'preferential' | 'shortTermGain' | 'longTermGain'`.
- Produces: `marginalNextDollar(result: TaxResult): MarginalScenario[]`, same signature. It returns the first four keys always, in that order, then `shortTermGain` only when its `totalRate` differs from `ordinaryInvestment`'s by more than `1e-9`, then `longTermGain` only when its `totalRate` differs from `preferential`'s by more than `1e-9`.

- [ ] **Step 1: Write the failing tests** in `src/tax/marginal.test.ts`. Use `makeInput` from `./testUtils`, and a helper `rates(input)` that returns `Object.fromEntries(marginalNextDollar(calculateTax(input)).map((s) => [s.key, s]))`.

```ts
const LOSS_CARRYOVER = makeInput({
  filingStatus: 'mfs', taxYear: 2022, wages: 309092, retirementIncome: 1792,
  interest: 11315, nonQualifiedDividends: 2042, longTermGains: -323530,
});

it('reports 0 for the next gain dollar when an unused capital loss absorbs it', () => {
  const m = rates(LOSS_CARRYOVER);
  expect(m.longTermGain.totalRate).toBe(0);
  expect(m.shortTermGain.totalRate).toBe(0);
  expect(m.preferential.totalRate).toBeCloseTo(0.238, 6); // a qualified dividend is not nettable
  expect(m.ordinaryInvestment.totalRate).toBeCloseTo(0.388, 6);
  expect(m.wages.totalRate).toBeCloseTo(0.3735, 6);
});

it('taxes the next long-term dollar at the ordinary rate when it shrinks a fully used loss', () => {
  const m = rates(makeInput({ wages: 100000, longTermGains: -2000 }));
  expect(m.longTermGain.totalRate).toBeCloseTo(0.22, 6);
  expect(m.preferential.totalRate).toBeCloseTo(0.15, 6);
  expect(m.shortTermGain).toBeUndefined(); // same as interest, so not shown
});

it('taxes the next long-term dollar as short-term when it offsets a long-term loss against a short-term gain', () => {
  const m = rates(makeInput({ wages: 100000, shortTermGains: 1000, longTermGains: -100 }));
  expect(m.longTermGain.totalRate).toBeCloseTo(0.22, 6);
});

it('reports 0 income tax on the next ordinary dollar when the loss deduction sits on preferential income', () => {
  const m = rates(makeInput({
    filingStatus: 'mfj', taxYear: 2020, shortTermGains: 4088, qualifiedDividends: 26699,
    longTermGains: -17603, deduction: 0,
  }));
  expect(m.ordinaryInvestment.totalRate).toBe(0);
  expect(m.wages.totalRate).toBeCloseTo(0.0765, 6);
});

it('returns exactly the four base cards when no capital loss is present', () => {
  const keys = marginalNextDollar(calculateTax(makeInput({ wages: 100000, longTermGains: 5000 }))).map((s) => s.key);
  expect(keys).toEqual(['wages', 'ordinaryInvestment', 'retirement', 'preferential']);
});

it('reports the next bracket rate when income sits exactly on a bracket boundary', () => {
  const tables = taxTablesFor(2026);
  const topOfSecondBracket = tables.ordinaryBrackets.single[1].max + tables.standardDeduction.single;
  const m = rates(makeInput({ retirementIncome: topOfSecondBracket }));
  expect(m.retirement.baseRate).toBeCloseTo(tables.ordinaryBrackets.single[2].rate, 6);
});

it('matches a real one-dollar recalculation for every card, on seeded random inputs', () => {
  // 2,000 inputs from a seeded PRNG; about 30% carry a negative short- or long-term figure.
  // For each scenario s: baseRate >= 0, every surtax rate > 0,
  // totalRate === round6(baseRate + surRate), and
  // |calculateTax(input with +1 on the scenario's probe field).totalTax - base.totalTax - totalRate| < 2e-6.
});
```

  For the last test, write the body from its comment. Use this PRNG so failures reproduce: mulberry32 with seed `12345`. Amount generator: 30% chance of 0, else `Math.round(random() ** 2 * max)` with maxima wages 400,000, retirement 150,000, interest 60,000, non-qualified dividends 30,000, short-term 80,000, qualified dividends 60,000, long-term 700,000. Filing status and year uniformly over `FILING_STATUSES` and `AVAILABLE_YEARS`. Custom deduction (max 80,000) in 20% of cases.

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/tax/marginal.test.ts`. Expected: FAIL (`longTermGain` undefined).

- [ ] **Step 3: Add `input` to the result.** In `types.ts` add `input: TaxInput` to `TaxResult` with a one-line doc comment. In `calculateTax` return `input: inputRaw`.

- [ ] **Step 4: Rewrite `marginalNextDollar`** in `marginal.ts` to this algorithm:

```ts
const PROBE_FIELD: Record<MarginalScenario['key'], IncomeSource> = {
  wages: 'wages',
  ordinaryInvestment: 'interest',
  retirement: 'retirementIncome',
  preferential: 'qualifiedDividends',
  shortTermGain: 'shortTermGains',
  longTermGain: 'longTermGains',
};
const ORDINARY_KEYS: ReadonlySet<MarginalScenario['key']> = new Set(['wages', 'ordinaryInvestment', 'retirement', 'shortTermGain']);
const roundRate = (rate: number): number => Math.round(rate * 1e6) / 1e6;
```

  For each key:
  1. `plus = calculateTax({ ...result.input, [field]: result.input[field] + 1 })`.
  2. `ordinaryDelta = roundRate(plus.federal.ordinaryTax - result.federal.ordinaryTax)`; `gainsDelta` likewise from `capitalGainsTax`.
  3. `baseRate` is `ordinaryDelta` for an ordinary key, else `roundRate(ordinaryDelta + gainsDelta)`.
  4. Surtaxes, in `federalSurchargeRules` order: for index `i`, `rate = roundRate(plus.federal.surcharges[i].amount - result.federal.surcharges[i].amount)`; include `{ label: rule.shortLabel, rate, tone: 'surtax' }` when `rate > 0`.
  5. For an ordinary key with `gainsDelta > 0`, append the bump component last: `rate: gainsDelta`, `tone: 'bump'`, label `` `pushes a gain ${pct(bump.fromRate)}→${pct(bump.toRate)}` `` when `result.federal.marginalGainsBump` is non-null, else `'raises capital-gains tax'`.
  6. `surRate = roundRate(sum of surtax rates)`, `totalRate = roundRate(baseRate + surRate)`.

  Then apply the inclusion rule from the Interfaces block. `marginal.ts` imports `calculateTax` from `./calculate`, and `calculate.ts` re-exports `marginalNextDollar` from `./marginal`; that cycle is safe because neither module calls the other at load time. Keep the doc comment accurate.

- [ ] **Step 5: Remove the now-unused rule method.** Delete `marginalRate` from the `SurchargeRule` interface and from all four rule factories in `surcharges.ts`, and delete the `marginalRate` assertions in `surcharges.test.ts` (keep every `assess` assertion; delete a test only when nothing else remains in it). Confirm with `grep -rn "marginalRate(" src`: expected no output.

- [ ] **Step 6: Run everything.** `npm test`. Expected: all pass, including every existing `marginalNextDollar` assertion in `src/tax/calculate.test.ts` unchanged. If an existing assertion fails, **stop and report** it; do not edit the expectation.

- [ ] **Step 7: Commit.** Message: `Compute next-dollar marginal rates by recalculation so capital losses are honored`.

### Task 2.2: Show the split gain cards

**Files:**
- Modify: `src/components/MarginalNextDollar.tsx:13-34` (`LABELS`) and the label lookup at the top of the map callback
- Create: `src/components/MarginalNextDollar.test.tsx`

- [ ] **Step 1: Write the failing test** (`jsdom` project; render inside `TooltipProvider` if the component needs it, as `App.tsx` does):

```tsx
it('adds gain cards and renames the preferential card when a capital loss changes the gain rate', () => {
  render(<MarginalNextDollar result={calculateTax(makeInput({ wages: 100000, longTermGains: -2000 }))} />);
  expect(screen.getByText('Long-term gains (with your capital loss)')).toBeInTheDocument();
  expect(screen.getByText('Qualified dividends')).toBeInTheDocument();
  expect(screen.queryByText('Qualified div. & LT gains')).not.toBeInTheDocument();
});

it('shows the four standard cards when there is no capital loss', () => {
  render(<MarginalNextDollar result={calculateTax(makeInput({ wages: 100000, longTermGains: 5000 }))} />);
  expect(screen.getByText('Qualified div. & LT gains')).toBeInTheDocument();
  expect(screen.queryByText(/with your capital loss/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure.** Expected: FAIL (TypeScript: `LABELS` lacks the new keys).

- [ ] **Step 3: Implement.** Add to `LABELS`:

  | Key | `label` | `baseLabel` | `hint` |
  | --- | --- | --- | --- |
  | `shortTermGain` | `Short-term gains (with your capital loss)` | `income tax` | `Your capital results net to a loss, so the next dollar of short-term gain first reduces that loss instead of being taxed like interest.` |
  | `longTermGain` | `Long-term gains (with your capital loss)` | `income tax` | `Your capital results net to a loss, so the next dollar of long-term gain first reduces that loss instead of being taxed on the 0 / 15 / 20% ladder.` |

  When the scenario list contains `longTermGain`, the `preferential` card uses label `Qualified dividends` and hint `Qualified dividends are taxed on the preferential 0 / 15 / 20% ladder. A capital loss cannot offset them.`

- [ ] **Step 4: Run, gate, commit.** Message: `Show separate gain cards when a capital loss changes the next-dollar rate`.

---

## Group 3: Scenario and stored-data safety

**Branch:** `ar/scenario-and-storage-safety` from `origin/main`.

### Task 3.1: Scenario names that collide with `Object.prototype`

**Problem:** `scenarios[name]` is used as an existence check, so `constructor` and `toString` look like existing scenarios on an empty store. `loadScenarios` assigns `normalized[name] = …`, so a scenario named `__proto__` vanishes on reload.

**Files:**
- Modify: `src/scenarios.ts`, `src/storage.ts:59-73` (`loadScenarios`), `src/components/ScenarioManager.tsx:62,71,78,88,98`
- Test: `src/scenarios.test.ts`, `src/storage.test.ts`

**Interfaces:**
- Produces: `hasScenario(scenarios: Scenarios, name: string): boolean` in `src/scenarios.ts`, an own-property check.

- [ ] **Step 1: Write the failing tests.** In `scenarios.test.ts`:

```ts
describe.each(['__proto__', 'constructor', 'toString'])('a scenario named %s', (name) => {
  it('does not exist in an empty store', () => {
    expect(hasScenario({}, name)).toBe(false);
  });
  it('is listed after save and gone after remove', () => {
    const saved = saveScenario({}, name, input);
    expect(hasScenario(saved, name)).toBe(true);
    expect(scenarioNames(saved)).toEqual([name]);
    expect(scenarioNames(removeScenario(saved, name))).toEqual([]);
  });
  it('survives being a rename target', () => {
    const renamed = renameScenario(saveScenario({}, 'plain', input), 'plain', name);
    expect(scenarioNames(renamed)).toEqual([name]);
  });
});
it('renaming a missing scenario with an inherited name changes nothing', () => {
  expect(scenarioNames(renameScenario({}, 'toString', 'x'))).toEqual([]);
});
```

  In `storage.test.ts`, following that file's existing `localStorage` setup:

```ts
it.each(['__proto__', 'constructor', 'toString'])('round-trips a scenario named %s through storage', (name) => {
  saveScenarios(saveScenario({}, name, input));
  expect(Object.keys(loadScenarios())).toEqual([name]);
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/scenarios.test.ts src/storage.test.ts`.

- [ ] **Step 3: Implement.**
  - `hasScenario` uses `Object.hasOwn`.
  - `renameScenario`: return a copy unchanged when `!hasScenario(scenarios, oldName)`; otherwise build the result with rest destructuring and a computed key (`{ ...rest, [newName]: { ...value } }`), never by assignment.
  - `loadScenarios`: build the result with `Object.fromEntries`, never by assignment.
  - `ScenarioManager.tsx`: replace each truthiness or `!== undefined` read of `scenarios[...]` used as an existence check with `hasScenario`.

- [ ] **Step 4: Run, gate, commit.** Message: `Treat scenario names as own keys so prototype names save, load, and rename`.

### Task 3.2: Opening a share link must not overwrite saved input

**Problem:** `App.tsx:43-59` seeds state from the URL hash and the save effect persists it on mount, replacing the visitor's own saved input.

**Files:**
- Modify: `src/App.tsx`
- Create: `src/App.test.tsx`

- [ ] **Step 1: Write the failing tests.** Use `shareHash` from `@/shareLink` and the storage key `tax-visualizer:input:v1`. Reset `localStorage` and `window.location.hash` in `beforeEach`.

```tsx
it('does not overwrite saved input when a share link is opened', () => {
  localStorage.setItem(KEY, JSON.stringify(makeInput({ wages: 11111 })));
  window.location.hash = shareHash(makeInput({ wages: 22222 }));
  render(<App />);
  expect(screen.getByLabelText('Wages / earned income')).toHaveValue('22222');
  expect(JSON.parse(localStorage.getItem(KEY)!).wages).toBe(11111);
  expect(window.location.hash).toBe('');
});

it('saves once the visitor edits the shared input', async () => {
  window.location.hash = shareHash(makeInput({ wages: 22222 }));
  render(<App />);
  expect(localStorage.getItem(KEY)).toBeNull();
  await userEvent.type(screen.getByLabelText('Wages / earned income'), '5');
  expect(JSON.parse(localStorage.getItem(KEY)!).wages).toBe(222225);
});

it('still saves the default input on a normal first visit', () => {
  render(<App />);
  expect(localStorage.getItem(KEY)).not.toBeNull();
});
```

  If `App` cannot render under jsdom after reasonable use of the stubs in `src/test/setup.ts`, **stop and report** the error.

- [ ] **Step 2: Run to verify failure.** Expected: the first two FAIL.

- [ ] **Step 3: Implement.** Hold the share-link input decoded at first render in a ref (`null` when there was none). In the save effect, return early while `input` is that same object. Add a one-line comment giving the reason.

- [ ] **Step 4: Run, gate, commit.** Message: `Keep saved input when a share link is only viewed`.

### Task 3.3: Error recovery must keep saved scenarios

**Problem:** `ErrorBoundary`'s single button calls `clearStoredData`, which deletes every saved scenario for any render error.

**Files:**
- Modify: `src/storage.ts`, `src/components/ErrorBoundary.tsx`
- Test: `src/storage.test.ts`; create `src/components/ErrorBoundary.test.tsx`

**Interfaces:**
- Produces: `clearStoredInput(): void` in `src/storage.ts`. It removes only `tax-visualizer:input:v1`, with the same catch-and-`console.error` behavior as `clearStoredData`.
- Produces: `ErrorBoundary` accepts an optional prop `onReload?: () => void`, default `() => location.reload()`.

- [ ] **Step 1: Write the failing tests.**
  - `storage.test.ts`: `clearStoredInput` removes the input key and leaves `tax-visualizer:saved:v1` and an unrelated key in place.
  - `ErrorBoundary.test.tsx`: render a child that throws, with `onReload` a `vi.fn()` and both storage keys set (silence `console.error` with a spy).
    - Clicking `Reset current input & reload` removes the input key, keeps the scenarios key, and calls `onReload` once.
    - Clicking `Delete saved scenarios too & reload` removes both keys and calls `onReload` once.
    - A child that does not throw renders normally and neither button is present.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** Primary button: `Reset current input & reload` → `clearStoredInput()` then `onReload()`. Secondary, styled as a plain text button beneath it: `Delete saved scenarios too & reload` → `clearStoredData()` then `onReload()`. Body copy: `The visualizer hit an unexpected error. Saved input may be corrupted — resetting it usually fixes this. Your saved scenarios are kept.` Update the class doc comment.

- [ ] **Step 4: Run, gate, commit.** Message: `Keep saved scenarios when recovering from a render error`.

---

## Group 4: One input sanitizer

**Branch:** `ar/unify-input-normalization`, **stacked on group 3**: inside the new worktree run `git switch -c ar/unify-input-normalization ar/scenario-and-storage-safety`.

**Problem:** `normalizeInput` lives in `src/storage.ts`, the import layer reaches into storage for it, and the share-link decoder re-implements the rules. The share link accepts `wages=1e308` and `wages=1.5`.

### Task 4.1: Move `normalizeInput` into the tax layer, bound it, and route the share link through it

**Files:**
- Create: `src/tax/input.ts`, `src/tax/input.test.ts`
- Modify: `src/storage.ts`, `src/storage.test.ts`, `src/import/parsedReturn.ts:2`, `src/shareLink.ts:52-69`, `src/shareLink.test.ts`
- Modify: `CLAUDE.md`, `README.md`, `ARCHITECTURE.md` (module tables)

**Interfaces:**
- Produces, in `src/tax/input.ts`: `export const MAX_INPUT_AMOUNT = 1_000_000_000_000;` and `export function normalizeInput(input: TaxInput): TaxInput`.
- Rules, in addition to the current ones: every finite income amount is `Math.round`ed, then clamped to `[0, MAX_INPUT_AMOUNT]`, or `[-MAX_INPUT_AMOUNT, MAX_INPUT_AMOUNT]` for the two signed capital-gains fields. A non-null deduction is rounded and capped at `MAX_INPUT_AMOUNT`.
- No re-export from `src/storage.ts`. Importers import from `@/tax/input` or the relative path.

- [ ] **Step 1: Move the tests.** Move the two `normalizeInput` describe blocks from `storage.test.ts` to `src/tax/input.test.ts`, importing from `./input`. Add:

```ts
it('rounds fractional amounts to whole dollars', () => {
  expect(normalizeInput(makeInput({ wages: 1.5, longTermGains: -2.4 }))).toMatchObject({ wages: 2, longTermGains: -2 });
});
it('clamps amounts to the supported range', () => {
  const n = normalizeInput(makeInput({ wages: 1e308, shortTermGains: -1e308, deduction: 1e308 }));
  expect(n.wages).toBe(MAX_INPUT_AMOUNT);
  expect(n.shortTermGains).toBe(-MAX_INPUT_AMOUNT);
  expect(n.deduction).toBe(MAX_INPUT_AMOUNT);
});
```

  In `shareLink.test.ts` add:

```ts
it('normalizes fractional and out-of-range amounts from a hand-edited link', () => {
  expect(decodeInput('v=1&filing=single&y=2025&wages=1.5')!.wages).toBe(2);
  expect(decodeInput('v=1&filing=single&y=2025&wages=1e308')!.wages).toBe(MAX_INPUT_AMOUNT);
});
```

- [ ] **Step 2: Run to verify failure.** Expected: FAIL (`./input` does not exist).

- [ ] **Step 3: Implement.**
  - Create `src/tax/input.ts` with the moved function and its doc comment, plus the new rules.
  - `storage.ts` and `parsedReturn.ts` import it from the tax layer.
  - `decodeInput`: keep the version check, the filing-status check (still returns `null`), and the blank-`ded` handling. Build the raw object with `Number(...)` per field and return `normalizeInput(raw)`. Delete the per-field validity logic that normalization now covers. Keep the doc comment accurate.

- [ ] **Step 4: Run everything.** `npm test`. Every existing `shareLink.test.ts` and `storage.test.ts` assertion must pass unchanged. If one fails, **stop and report**.

- [ ] **Step 5: Docs.** Add `input.ts` ("Input sanitizer shared by storage, share links, and import: `normalizeInput`, `MAX_INPUT_AMOUNT`") to the tax-engine module tables, and correct the `storage.ts` description.

- [ ] **Step 6: Gate and commit.** Message: `Move input normalization into the tax layer and bound amounts`.

### Task 4.2: Small form cleanups

**Files:**
- Modify: `src/components/IncomeForm.tsx:13-20,150,168,177`, `index.html:7`

- [ ] **Step 1: Implement.**
  - Delete the local `ORDINARY_FIELDS` and `PREFERENTIAL_FIELDS`; use `ORDINARY_SOURCES` and `PREFERENTIAL_SOURCES` from `@/tax/types`.
  - Replace `set({ filingStatus: v as FilingStatus })` with the guard already used in `ImportReturn.tsx`: `if (isFilingStatus(v)) set({ filingStatus: v })`. Remove the unused `FilingStatus` type import if nothing else needs it.
  - `index.html` title: `Federal Tax Bracket Visualizer`.

- [ ] **Step 2: Verify no behavior change.** `npm test`. Expected: all pass with no test edits (`IncomeForm.test.tsx` covers the form).

- [ ] **Step 3: Gate and commit.** Message: `Reuse the source lists and filing-status guard in the income form; drop the year from the page title`.

---

## Group 5: Year-table invariants and coverage tooling

**Branch:** `ar/year-table-invariants` from `origin/main`.

### Task 5.1: Structural test for every year's tables

**Files:**
- Modify: `src/tax/years.test.ts`

- [ ] **Step 1: Write the test.** `describe.each(AVAILABLE_YEARS)` × `it.each(FILING_STATUSES)`, asserting for `taxTablesFor(year)`:
  - `tables.year === year`
  - `ordinaryBrackets[status][0].min === 0`
  - every bracket's `min` equals the previous bracket's `max`, and `min < max`
  - rates strictly increase
  - the last bracket's `max === Infinity`
  - `0 < rate0Max < rate15Max` for the capital-gains breakpoints
  - `standardDeduction[status] > 0`, and the NIIT and Additional Medicare thresholds are `> 0`

  Update the file's header comment, which says the spec covers only the registry.

- [ ] **Step 2: Run.** `npx vitest run src/tax/years.test.ts`. Expected: PASS. If any year fails, that is a data error in a table: **stop and report** the year, status, and assertion. Do not edit the tables.

- [ ] **Step 3: Gate and commit.** Message: `Assert structural invariants on every year's tax tables`.

### Task 5.2: Coverage tooling

**Files:**
- Modify: `package.json`, `package-lock.json`, `.gitignore`, `.prettierignore`, `CLAUDE.md` (Commands block)

- [ ] **Step 1: Install and wire.** `npm install --save-dev @vitest/coverage-v8@^4.1.9`. Add script `"test:coverage": "vitest run --coverage"`. Add `coverage` to `.gitignore` and `.prettierignore`. Add the command to the Commands block in `CLAUDE.md`. Set no thresholds.

- [ ] **Step 2: Run.** `npm run test:coverage`. Expected: tests pass and a coverage table prints. Record the "All files" line for your report.

- [ ] **Step 3: Gate and commit.** Message: `Add a coverage script`.

---

## Group 6: Dependency and CI hardening

**Branch:** `ar/dependency-and-ci-hardening` from `origin/main`.

### Task 6.1: Clear the audit findings

**Files:**
- Modify: `package.json` (only if a range must change), `package-lock.json`

- [ ] **Step 1: Update.** `npm update pdfjs-dist`, then `npm audit fix` (never `--force`).

- [ ] **Step 2: Verify.** `npm ls pdfjs-dist` must show `6.2.108` or later (this clears [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j)). Run `npm audit` and record what remains. Run the full gate. If a test or the build fails after the update, **stop and report**; do not pin back or patch around it.

- [ ] **Step 3: Commit.** Message: `Update pdfjs-dist past GHSA-hq66-cqwq-w95j and apply audit fixes`. In your report, state that the PDF import needs one manual check in a browser (`npm run dev`, drop a PDF), which this plan does not perform.

### Task 6.2: Least-privilege deploy, tests before deploy, Dependabot, pinned actions

**Files:**
- Modify: `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Permissions.** In `deploy.yml`, reduce the workflow-level block to `permissions: { contents: read }` and give the `deploy` job its own `permissions:` with `pages: write` and `id-token: write`.

- [ ] **Step 2: Test before deploy.** In the `deploy.yml` build job, add `- run: npm test` before `- run: npm run build`, and update the comment above it.

- [ ] **Step 3: Dependabot.** Create `.github/dependabot.yml` (version 2) with two weekly updaters: `npm` at `/` and `github-actions` at `/`.

- [ ] **Step 4: Pin actions to commit SHAs.** For each `uses: owner/repo@vN` in both workflows, resolve the SHA with `gh api repos/<owner>/<repo>/commits/vN --jq .sha` and write `uses: owner/repo@<sha> # vN`. If a lookup fails, leave that line unchanged and report it.

- [ ] **Step 5: Validate and commit.** Confirm both workflow files parse (`ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f) }' .github/workflows/*.yml .github/dependabot.yml` — a few lines of shell glue, no project language applies). Run the gate. Message: `Scope deploy permissions to the deploy job, test before deploy, pin actions, add Dependabot`.

---

## Deliberately not in this plan

| Item | Why it is left out |
| --- | --- |
| Removing the old fixture blobs from the pushed branch | A history rewrite on a public branch; the user decides. |
| Content Security Policy `<meta>` tag | Needs verification in a real browser against the pdf.js worker. |
| Moving `scripts/` and Node types out of `tsconfig.app.json` | Tests and fixture helpers under `src/` use Node APIs, so the split is a design task of its own. |
| Moving UI metadata out of `src/tax/format.ts` | Wide import churn for a layering preference. |
| `noUncheckedIndexedAccess` (53 errors) | Optional strictness, not a defect. |
| Tests for the tower and composition chart components | Open-ended; pick after reading the coverage report from Task 5.2. |
| A page cap for returns with no Schedule D | Changes import behavior; already bounded by the 10 MB limit. |

## Final report (every group)

Report, per group: branch name, commit list (`git log --oneline origin/main..HEAD`, or `60db59f..HEAD` for group 1), the last lines of `npm test` and `npm run build`, every "stop and report" condition you hit, and anything you could not verify.
