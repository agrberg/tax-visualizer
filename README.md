# 2026 Federal Tax Bracket Visualizer

A frontend-only app that shows how income flows through US federal tax brackets:

- **Ordinary income** (wages, interest, non-qualified dividends, short-term gains)
  filling the 10–37% marginal brackets.
- **Qualified dividends & long-term capital gains** stacked on top of ordinary
  income, filling the 0/15/20% capital-gains ladder, with the room remaining at
  the 0% and 15% levels.
- **Light-bulb indicators** for the Net Investment Income Tax (3.8%) and the
  Additional Medicare Tax (0.9%) when income crosses their thresholds.
- A per-source breakdown with each piece's own effective rate and the overall
  weighted rate.
- Save, reload, rename, and delete named **scenarios** of your inputs, persisted
  in the browser.

Estimates for education, not tax advice. Federal only. 2026 figures per IRS
Rev. Proc. 2025-32; NIIT / Additional Medicare thresholds are statutory.

## Stack

Vite + React + TypeScript, Tailwind + shadcn/ui, Vitest. Static build — no
backend. Inputs and saved scenarios persist to `localStorage`.

## Getting started

Prerequisites: **Node.js 24** (pinned in `.tool-versions`; CI uses the same) and npm.

```bash
git clone <repo-url>
cd tax-visualizer
npm install
npm run dev
```

The dev server prints a URL. Note it includes the base path:
`http://localhost:5173/tax-visualizer/` (see the base-path note under Deploy).

## Scripts

```bash
npm run dev      # dev server with hot reload
npm run test     # tax-logic unit tests (Vitest)
npm run lint     # oxlint
npm run build    # type-check + production build to dist/
npm run preview  # serve the built dist/ locally — smoke-test before deploying
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds and deploys on push to `main`.

1. Push this repo to GitHub.
2. In repo Settings → Pages, set **Source: GitHub Actions**.
3. The site publishes at `https://<user>.github.io/tax-visualizer/`.

The Vite `base` in `vite.config.ts` is `/tax-visualizer/` for a project page.
Change it to `/` if you deploy to a custom domain or a `user.github.io` root.

## Where things live

- `src/tax/brackets.ts` — 2026 rate tables, keyed by `TAX_YEAR`.
- `src/tax/calculate.ts` — the top-level `calculateTax` orchestrator; the pure
  tax logic lives in focused modules alongside it: `income.ts` (classification),
  `deduction.ts`, `engine.ts` (bracket fills), `federal.ts` / `jurisdiction.ts`
  (the federal computation), `surcharges.ts` (NIIT / Additional Medicare),
  `marginal.ts` (next-dollar cost), and `attribution.ts` (per-source breakdown).
- `src/tax/*.test.ts` — unit tests for those modules (`calculate`, `deduction`,
  `engine`, `surcharges`).
- `src/components/` — the income form, the two towers, the marginal
  next-dollar view, the income/tax composition views, surcharge indicators,
  the overall breakdown, and the saved-scenarios panel.
- `src/scenarios.ts` + `src/storage.ts` — named input **scenarios** and their
  `localStorage` persistence.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the data flow and module map, with
diagrams.
