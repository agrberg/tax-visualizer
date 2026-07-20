# Adding a tax year

Each file here is one `TaxYearTables` (see `../types.ts`) — a complete, verified snapshot of
one year's federal figures. `index.ts` is the registry that wires them into the app. Adding a
year is a data drop plus a two-line registration; this guide makes it mechanical.

## When the figures are available

Most of a year's numbers are inflation-indexed and **published in the prior October**, so you
can't populate a year early:

- **IRS Revenue Procedure** (ordinary bracket boundaries, standard deduction, capital-gains
  breakpoints) — released ~October of the prior year, derived from CPI data through that
  August. E.g. 2026 came from Rev. Proc. 2025-32; 2027 will come from a Rev. Proc. released
  ~October 2026.
- **SSA Contribution and Benefit Base** (Social Security wage base) — announced mid-October
  of the prior year: <https://www.ssa.gov/oact/cola/cbb.html>.

Until both are out, only projections exist — **do not** commit projected figures; this repo
ships verified numbers only.

## Where each field comes from

| Field                                                               | Source                                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ordinaryBrackets` (min/max)                                        | that year's IRS Revenue Procedure (rate schedule)                                                         |
| `standardDeduction`                                                 | same Revenue Procedure — but watch for legislation: OBBBA (P.L. 119-21) overrode 2025's published amounts |
| `capitalGains.breakpoints`                                          | same Revenue Procedure (maximum-capital-gains-rate amounts)                                               |
| `socialSecurity.wageBase`                                           | SSA Contribution and Benefit Base                                                                         |
| all `rate` fields, `niit.threshold`, `additionalMedicare.threshold` | **statutory** — carry forward unchanged, but re-confirm no new law moved them for this year               |

Notes:

- `mfs` ordinary brackets mirror `single` except the **top** bracket, which starts at half of
  the `mfj` threshold. `mfs` cap-gains breakpoints are the IRS's published `mfs` figures —
  only _approximately_ half of `mfj` (e.g. 2025's 15% ceiling is $300,000, not $600,050 / 2).
- The `rate` fields (ordinary 10–37%, cap-gains 0/15/20%, SS 6.2%, Medicare 1.45%, Additional
  Medicare 0.9%, NIIT 3.8%) and the statutory NIIT / Additional-Medicare thresholds
  ($200k single·hoh / $250k mfj / $125k mfs) haven't changed in years — the template below
  pre-fills them. Still verify against the year's guidance in case of a statute change.

## Template

Copy this into `<year>.ts`, rename `TAX_YEAR_<year>`, set `year` / `source`, and replace every
`FILL` with the verified figure. The `rate`s and statutory thresholds are pre-filled — leave
them unless the year's guidance says otherwise. (This is a Markdown code block on purpose: no
half-filled `.ts` file exists to break the build or leak into the picker.)

```ts
import type { TaxYearTables } from '../types'

const INF = Number.POSITIVE_INFINITY

/**
 * <YEAR> federal tax tables.
 *
 * Sources (verify on entry):
 * - Ordinary brackets, standard deduction, LTCG breakpoints: IRS Rev. Proc. <FILL>.
 * - NIIT (§1411) and Additional Medicare Tax (§3101(b)(2)) thresholds are statutory.
 * - Social Security wage base per the SSA; SS/Medicare rates are statutory.
 * - mfs: ordinary brackets mirror single except the top (half of mfj); cap-gains are the
 *   IRS's published mfs figures (≈, not exactly, half of mfj).
 */
export const TAX_YEAR_<YEAR>: TaxYearTables = {
  year: FILL,
  source: 'IRS Rev. Proc. FILL', // + any overriding legislation, e.g. OBBBA
  ordinaryBrackets: {
    single: [
      { rate: 0.1, min: 0, max: FILL },
      { rate: 0.12, min: FILL, max: FILL },
      { rate: 0.22, min: FILL, max: FILL },
      { rate: 0.24, min: FILL, max: FILL },
      { rate: 0.32, min: FILL, max: FILL },
      { rate: 0.35, min: FILL, max: FILL },
      { rate: 0.37, min: FILL, max: INF },
    ],
    mfj: [
      { rate: 0.1, min: 0, max: FILL },
      { rate: 0.12, min: FILL, max: FILL },
      { rate: 0.22, min: FILL, max: FILL },
      { rate: 0.24, min: FILL, max: FILL },
      { rate: 0.32, min: FILL, max: FILL },
      { rate: 0.35, min: FILL, max: FILL },
      { rate: 0.37, min: FILL, max: INF },
    ],
    hoh: [
      { rate: 0.1, min: 0, max: FILL },
      { rate: 0.12, min: FILL, max: FILL },
      { rate: 0.22, min: FILL, max: FILL },
      { rate: 0.24, min: FILL, max: FILL },
      { rate: 0.32, min: FILL, max: FILL },
      { rate: 0.35, min: FILL, max: FILL },
      { rate: 0.37, min: FILL, max: INF },
    ],
    mfs: [
      { rate: 0.1, min: 0, max: FILL },
      { rate: 0.12, min: FILL, max: FILL },
      { rate: 0.22, min: FILL, max: FILL },
      { rate: 0.24, min: FILL, max: FILL },
      { rate: 0.32, min: FILL, max: FILL },
      { rate: 0.35, min: FILL, max: FILL }, // top starts at mfj's 37% threshold / 2
      { rate: 0.37, min: FILL, max: INF },
    ],
  },
  standardDeduction: {
    single: FILL,
    mfj: FILL,
    hoh: FILL,
    mfs: FILL,
  },
  capitalGains: {
    breakpoints: {
      single: { rate0Max: FILL, rate15Max: FILL },
      mfj: { rate0Max: FILL, rate15Max: FILL },
      hoh: { rate0Max: FILL, rate15Max: FILL },
      mfs: { rate0Max: FILL, rate15Max: FILL },
    },
    rates: { rate0: 0, rate15: 0.15, rate20: 0.2 },
  },
  niit: {
    rate: 0.038,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
  socialSecurity: { rate: 0.062, wageBase: FILL },
  medicare: { rate: 0.0145 },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
  },
}
```

## Checklist

1. **Create the file** — copy the template into `src/tax/years/<year>.ts`, fill every `FILL`
   from the sources above.
2. **Register it** in `index.ts`:
   - `import { TAX_YEAR_<year> } from './<year>'`
   - add `<year>: TAX_YEAR_<year>` to `TAX_YEARS`
   - prepend `<year>` to `AVAILABLE_YEARS` (newest first — this is what surfaces it in the picker)
3. **Default year** — decide whether to bump `DEFAULT_TAX_YEAR` to the new year (do this when
   it becomes the current filing-year context; it's a deliberate choice, not automatic).
4. **Tests** — in `../years.test.ts`, mirror the existing 2025 block for the new year: assert
   the standard deduction, the top of the 10% bracket, and the SS wage-base cap, plus a
   year-switch assertion against an adjacent year.
5. **Verify** — `npm test`, `npx tsc -b`, `npm run lint`; run `npm run dev` and confirm the
   new year appears in the picker and the figures move when you select it.
