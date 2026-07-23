# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Dev server (Vite, hot reload)
npm run build          # Type-check (tsc -b) + production build
npm run lint           # oxlint
npm run format         # Prettier, write formatting fixes
npm run format:check   # Prettier, check only (used in CI)
npm test               # Vitest, run once
npm run test:watch     # Vitest, watch mode
```

Run a single test file: `npx vitest run src/tax/engine.test.ts`

Node 24 required (pinned in `.tool-versions`).

## Git worktrees

Parallel workstreams live in git worktrees under `.claude/worktrees/` (already gitignored), not as
sibling directories next to this repo. Use the `EnterWorktree` tool to create them.

## Architecture

**Frontend-only SPA** — no backend, no API. All tax computation is pure client-side TypeScript. State persists to `localStorage` and URL hash only.

### Clean layer separation

**`src/tax/`** — Pure TypeScript tax engine. Zero React, zero DOM, zero side effects. Accepts a `TaxInput`, returns a `TaxResult`. Unit-testable in isolation. All logic here should remain framework-free.

**`src/` + `src/components/`** — React UI. Holds input state in `App.tsx`, calls `calculateTax()`, renders visualizations.

Data flow:

```
User input → IncomeForm → App.tsx (TaxInput state)
                              ↓
                    calculateTax(input) [src/tax/calculate.ts]
                              ↓
                          TaxResult
                              ↓
              Towers / Breakdown / Indicators (display only)
```

### Tax engine modules (`src/tax/`)

| File                            | Role                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `types.ts`                      | `TaxInput`, `TaxResult`, `JurisdictionResult` — the public contract                   |
| `calculate.ts`                  | Orchestrator entry point                                                              |
| `income.ts`                     | Capital-gains netting (`nettedCapitalGains`); classify ordinary vs preferential pools |
| `federal.ts`                    | Assembles federal `Jurisdiction` from a year's tables                                 |
| `jurisdiction.ts`               | Core computation: deductions, bracket fills, per-source attribution, surcharges       |
| `engine.ts`                     | Band math: `fillBands`, `taxOverRange`, `marginalRateAt`                              |
| `deduction.ts`                  | Splits the deduction across income pools                                              |
| `surcharges.ts`                 | NIIT (3.8%) and Additional Medicare Tax (0.9%) rules                                  |
| `attribution.ts`                | Per-source layers (tower data) + combined breakdown table                             |
| `marginal.ts`                   | Next-dollar marginal cost by income type                                              |
| `years/2019.ts`…`years/2026.ts` | Per-year tax tables (brackets, deductions, rates)                                     |
| `years/index.ts`                | Year registry: `AVAILABLE_YEARS`, `DEFAULT_TAX_YEAR`, `taxTablesFor()`                |
| `filingStatus.ts`               | Filing status labels and validity guard                                               |
| `format.ts`                     | Currency/percent formatting + composition segments                                    |

Adding a new tax year: see `src/tax/years/README.md` for the step-by-step guide and source citation conventions.

### Persistence and sharing

- `storage.ts` — `localStorage` load/save for `TaxInput` + named scenarios
- `scenarios.ts` — Scenario CRUD (save, rename, remove, list)
- `shareLink.ts` — URL-hash codec for encoding input into a shareable link (`#v=1&...`)

### PDF 1040 import (`src/import/`)

Uses the bundled `pdfjs-dist` package (worker asset bundled too — no CDN or network fetch), lazily code-split via a dynamic `import()` so the ~1 MB parser only loads when a PDF is dropped. Extracts the text layer and maps fields to `TaxInput`. Pure client-side; no upload. Entry point: `parse1040.ts`.

The pipeline is split into focused modules:

| File                | Role                                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `parse1040.ts`      | Composition root — dynamically loads `pdfText.ts`, builds the `Form1040`, and hands it to `ReturnExtractor.extract`                                                                                                                                                                        |
| `pdfText.ts`        | Pulls positioned text items out of a PDF via `pdfjs-dist` (the only external dep); stops after a caller-supplied page predicate                                                                                                                                                            |
| `rows.ts`           | Reconstructs form "rows" from positioned text (`groupRows`) + `parseAmount`                                                                                                                                                                                                                |
| `section.ts`        | `Section` — a region of rows (the face or Schedule D) queried for a line's amount by id (`amountForId`), by label (`amountAndIdForLabel`, whole-row or segment-bounded via an `opts` arg), or by a windowed label read (`amountForLabelNear`); owns the lookup logic                       |
| `detect.ts`         | Best-effort filing-status + tax-year detection from the face                                                                                                                                                                                                                               |
| `fieldLocations.ts` | Which line id each field sits on by year: `STABLE_FIELD_IDS` + the per-year `DRIFTING_FIELD_IDS` map + `lineIdForYear`                                                                                                                                                                     |
| `form1040.ts`       | `Form1040` — encapsulates a parsed 1040: private rows, queried by id/label (`amountForId`/`amountAndIdForLabel`/`amountForLabelNear`) + a `scheduleD` `Section` + detected `filingStatus`/`taxYear`; owns page classification + `haveEverythingNeeded`                                     |
| `extract1040.ts`    | `ReturnExtractor` class — its `extract(form: Form1040)` entry point asks the `Form1040` for each field's amount by that year's id, cross-checks/falls back to the label via one shared `readIdWithLabelCheck`, and owns the tax logic; owns `SHARED_LINE_IDS`; never references `TextItem` |
| `parsedReturn.ts`   | `ParsedReturn` type + `mergeParsedInput`                                                                                                                                                                                                                                                   |
| `importLog.ts`      | Dev-only console tracing                                                                                                                                                                                                                                                                   |

The `Form1040` object (`form1040.ts`) **encapsulates** a parsed 1040: it groups the positioned text into rows once, scopes the **1040 face's own pages** — from the face page up to (not including) the next schedule header (`SCHEDULE X (Form 1040)`), so it stays correct if the face ever grows past two pages — and a `scheduleD` `Section`, and detects the header. The rows stay **private**; `ReturnExtractor` doesn't pass `Row[]` around, it asks the form for a line's amount (`amountForId` / `amountAndIdForLabel` / `amountForLabelNear`, or `form.scheduleD?.amountForId(...)`) and owns the tax logic. It reads fields across a **7-year window (2019–2025)**. Line numbers drift year to year and even get reused with different meanings (e.g. `9` = deduction in 2019 but total income later; the deduction moved to page-2 `12e` in 2025). The importer **detects the year first**, then reads each field by that year's exact line id via `fieldLocations.ts`: `STABLE_FIELD_IDS` for ids that never move (`2b`/`3a`/`3b`/`4b`), and the per-year `DRIFTING_FIELD_IDS` map (`lineIdForYear`) for the movers (wages, pensions, capital gain, deduction). No page is stored per field — the reader scans the face pages in order and takes the **first occurrence** of an id, so a field is found wherever its line drifted to (like the 2025 page-2 deduction) without page bookkeeping. The map is **effective-dated**: each drifting field lists only the years it _changes_, newest-first, so `lineIdForYear` returns the first entry with `since ≤ year` (recent forms — the common case — match first; adding a year is a one-line prepend). Reading pensions by its year id sidesteps the 2019 `5b`=Social-Security trap by construction. Text extraction is **bounded**: `parse1040` (the composition root, which builds the `Form1040` and passes it to `ReturnExtractor.extract`) passes `pdfText.ts` the `haveEverythingNeeded` predicate (from `form1040.ts`), so once the face has been seen and Schedule D read, the worksheets/state returns/K-1s padding a filed bundle are never parsed (a return with no Schedule D is still read to the end). `TextItem` stays confined to `pdfText` (the producer) and the geometry engine (`rows`/`section`/`detect`/`form1040`); `parse1040` wires them together, and `ReturnExtractor` and everything downstream speak only `Form1040`/`ParsedReturn`, never `TextItem`.

Each field has its own reader method on `ReturnExtractor` (`readInterest`, `readWages`, …); the simple ones (interest, deduction, the 1040 capital-gain line) share one private `readIdWithLabelCheck` that asks the `Form1040` for the year id's amount (segment-bounded via `SHARED_LINE_IDS`), cross-checks it against the printed label read _in the same segment_ (`amountAndIdForLabel` with segment-bounding `opts`, so a shared `3a`/`3b` or `12a`/`12b`/`12c` row reads each field's own amount rather than a neighbour's), and falls back to the label. The stable printed **label** is thus the **fallback** — used when the year is undetected or older than the map's window (pre-2019) — and a **cross-check** that warns on disagreement (a runtime guard against a wrong map entry). Two fields read id-only / fallback-only and are _not_ cross-checked, because their label names a different cell than the id: IRA (`IRA distributions` = gross `4a`, not taxable `4b`) and wages (`wages, salaries, tips` = the `1a` W-2 subset, not the `1z` total). `readInterest` is a narrower case of the shared dance: it still cross-checks against the label but sets the field only on an id match, with no label fallback for the value itself. Lower-confidence reads (label-anchored wages on an unmapped year; capital gain taken from the 1040 with no Schedule D to split it) are flagged `assumed` and shown as "assumed — verify" in the review modal. Year _misdetection_ is a known gap left for later (a year hint / most-frequent `20xx` scan).

## Keeping docs in sync

README.md's "Where things live" and ARCHITECTURE.md's module map describe the current
file/module structure. Before finishing a feature, check whether they still describe it
accurately — and update them if not — when you: add a new file/module under `src/`, change
what an existing module is responsible for, or add/remove a user-facing feature. Routine logic
changes, bug fixes, and refactors that don't change a module's shape don't need this check.

## Readability conventions

Naming and cleanup preferences applied across this codebase:

- **Names carry the meaning** so a clarifying comment isn't needed. Non-trivial locals and every
  function/constant get a descriptive, accurate name (`amountForId` not `amountForLine`,
  `setFieldAndSource` not `setMoney`, `itemIndex`/`checkToken` not `idx`/`tok`). A name reused with
  different meanings gets a distinct one each time.
- **But don't over-rename.** Single-letter `i`/`c`/`t` are fine in short inline callbacks that just
  grab `.text` (± trim); match the file's existing style. Keep diffs minimal — don't churn what
  already reads fine.
- **Regexes become named module constants** with a `https://regexper.com/#…` link where first
  introduced; dedupe a pattern used more than once.
- **Remove dead, duplicate, or needlessly-coupled code**: redundant operations, duplicate types
  (alias instead), and back-compat re-export shims (import from the owner module — that's the point
  of splitting a file).
- **Efficiency with judgment**: compute once, order predicate checks cheapest-first, don't reassign
  parameters (`const t = text.trim()`); but don't micro-optimize non-issues.
- **Formatting is Prettier's job.** Run `npx prettier --write` on every touched file, Markdown
  included (GFM tables and their `---` separators reflow to the widest cell, so a one-cell edit
  ripples the whole column). `arrowParens: "always"` is enforced — keep `(i) =>`.

## Testing conventions

Two Vitest environments (configured in `vite.config.ts`):

- **Node** (`*.test.ts`) — for pure tax-logic tests; fast, no DOM
- **jsdom** (`*.test.tsx`) — for component tests; setup file at `src/test/setup.ts`

Test files live alongside source files, not in a separate `__tests__/` directory.

## Implemented features

**`TaxInput` shape:**

```
{ filingStatus, taxYear, deduction, wages, retirementIncome, interest, nonQualifiedDividends,
  shortTermGains, qualifiedDividends, longTermGains }
```

`shortTermGains` and `longTermGains` may be negative (losses); all other income fields are ≥ 0.
`deduction` is `null` for the standard deduction or a number for a custom (itemized) amount.

- **Filing status**: single, MFJ, MFS, HoH (drives standard deduction, bracket widths, and surcharge thresholds)
- **Deduction**: take the standard deduction (varies by filing status and tax year) or enter a custom (itemized) amount
- **Capital-gains netting**: ST/LT net against each other first; residual net loss capped at $3k/year ($1.5k MFS) per §1211(b)
- **Preferential rates**: 0/15/20% LTCG/qualified-dividend ladder stacks on top of ordinary income
- **Capital-gains bump**: an extra ordinary dollar can push capital gains into a higher preferential bracket, raising the effective marginal rate; computed and displayed separately
- **Surcharges**: Social Security (6.2% on wages up to cap), Medicare (1.45% on wages), Additional Medicare Tax (0.9% on wages over threshold), NIIT (3.8% on NII over threshold)
- **Marginal rate display**: next-dollar cost broken down by income type
- **Named scenarios**: save/load/rename/delete via localStorage
- **Share links**: full input encoded in URL hash
- **PDF 1040 import**: drag-drop to extract income fields from a filed return
- **Tax years**: 2019–2026

## Out of scope (by design)

- State income tax
- Tax credits (EITC, child tax credit, etc.)
- Phase-outs and AMT
