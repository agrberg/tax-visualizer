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

| File                             | Role                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `types.ts`                       | `TaxInput`, `TaxResult`, `JurisdictionResult` — the public contract                   |
| `calculate.ts`                   | Orchestrator entry point                                                              |
| `income.ts`                      | Capital-gains netting (`nettedCapitalGains`); classify ordinary vs preferential pools |
| `federal.ts`                     | Assembles federal `Jurisdiction` from a year's tables                                 |
| `jurisdiction.ts`                | Core computation: deductions, bracket fills, per-source attribution, surcharges       |
| `engine.ts`                      | Band math: `fillBands`, `taxOverRange`, `marginalRateAt`                              |
| `deduction.ts`                   | Splits the deduction across income pools                                              |
| `surcharges.ts`                  | NIIT (3.8%) and Additional Medicare Tax (0.9%) rules                                  |
| `attribution.ts`                 | Per-source layers (tower data) + combined breakdown table                             |
| `marginal.ts`                    | Next-dollar marginal cost by income type                                              |
| `years/2025.ts`, `years/2026.ts` | Per-year tax tables (brackets, deductions, rates)                                     |
| `years/index.ts`                 | Year registry: `AVAILABLE_YEARS`, `DEFAULT_TAX_YEAR`, `taxTablesFor()`                |
| `filingStatus.ts`                | Filing status labels and validity guard                                               |
| `format.ts`                      | Currency/percent formatting + composition segments                                    |

Adding a new tax year: see `src/tax/years/README.md` for the step-by-step guide and source citation conventions.

### Persistence and sharing

- `storage.ts` — `localStorage` load/save for `TaxInput` + named scenarios
- `scenarios.ts` — Scenario CRUD (save, rename, remove, list)
- `shareLink.ts` — URL-hash codec for encoding input into a shareable link (`#v=1&...`)

### PDF 1040 import (`src/import/`)

Uses the bundled `pdfjs-dist` package (worker asset bundled too — no CDN or network fetch), lazily code-split via a dynamic `import()` so the ~1 MB parser only loads when a PDF is dropped. Extracts the text layer and maps fields to `TaxInput`. Pure client-side; no upload. Entry point: `parse1040.ts`.

The pipeline is split into focused modules:

| File              | Role                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `parse1040.ts`    | Entry point — dynamically loads `pdfText.ts`, then `extract1040Fields`                                                  |
| `pdfText.ts`      | Pulls positioned text items out of a PDF via `pdfjs-dist` (the only external dep)                                       |
| `rows.ts`         | Reconstructs form "rows" from positioned text (`groupRows`) + `parseAmount`                                             |
| `lineLookup.ts`   | Finds a line's amount by stable id (`amountForId`) or drifting label (`amountForLabel`)                                 |
| `detect.ts`       | Best-effort filing-status + tax-year detection from the face                                                            |
| `extract1040.ts`  | Thin orchestrator: small per-field readers assemble a `ParsedReturn`; owns page-1 boundary ids (`SEGMENT_BOUNDARY_IDS`) |
| `parsedReturn.ts` | `ParsedReturn` type + `mergeParsedInput`                                                                                |
| `importLog.ts`    | Dev-only console tracing                                                                                                |

`extract1040.ts` reads the 1040 face across a **7-year window (2019–2025)**. Line numbers drift year to year and even get reused with different meanings (e.g. `9` = deduction in 2019 but total income later; the deduction moved to page-2 `12e` in 2025), so fields whose id drifts (deduction, pensions, the 1040 capital-gain fallback) are located by their **stable printed label** via `amountForLabel`, not by line number; only genuinely stable ids (`2b`/`3a`/`3b`/`4b`, wages `1z`, Schedule D `7`/`15`) are read by id. Reads stay label-anchored and year-agnostic, so an untabled future year or a pre-2019 form still degrades gracefully. Lower-confidence reads (older-form wages fallback, capital gain taken from the 1040 with no Schedule D) are flagged `assumed` and shown as "assumed — verify" in the review modal.

## Keeping docs in sync

README.md's "Where things live" and ARCHITECTURE.md's module map describe the current
file/module structure. Before finishing a feature, check whether they still describe it
accurately — and update them if not — when you: add a new file/module under `src/`, change
what an existing module is responsible for, or add/remove a user-facing feature. Routine logic
changes, bug fixes, and refactors that don't change a module's shape don't need this check.

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
- **Tax years**: 2025, 2026

## Out of scope (by design)

- State income tax
- Tax credits (EITC, child tax credit, etc.)
- Phase-outs and AMT
