# Per-year 1040 test fixtures

Realistic, **anonymized** Form 1040 PDFs (one per importer year, 2019–2025) used two ways:

1. **`../fixtures.test.ts`** parses each committed `1040-<year>.pdf` through the real pdf.js (in Node,
   via `readPdfInNode`) and asserts `extract1040Fields` returns that year's `profiles.ts` expectation —
   validating the line-id map (`../fieldLocations.ts`) against a real form layout, not the recollection
   the map itself encodes.
2. **`ImportReturn`** shows a dev-only "Dev samples" row (gated on `import.meta.env.DEV`) that drops each
   canned PDF through the real import UI locally.

The `1040-<year>.pdf` files are **not checked in until you build them** from real returns. Until then the
per-year test assertions skip; the full anonymize→rebuild→read→extract chain is proven regardless by
`anonymize.test.ts` and `pdfRoundtrip.test.ts`.

## How the fixtures are made (anonymize by rebuild)

We do **not** commit real returns or redact them in place (drawing boxes over a text layer leaves the
text extractable). Instead the builder reads a real form's positioned text, keeps only the structure
the importer and its detection need — form header, tax year, the checked filing-status row, each mapped
line's id + label, and the Schedule D header — **drops every other row wholesale** (name, SSN, address,
dependents, employer, bank details), and **overwrites the amounts** on the mapped lines with synthetic
round numbers, positioned exactly where the real amounts sat. That cleaned text is redrawn into a fresh
PDF (`rebuildPdf`, pdf-lib). The result is PII-free and layout-faithful for everything the importer reads.

Pipeline: `readPdfInNode` → `anonymize` (whitelist + synthetic amounts) → `rebuildPdf` → verify by
re-parsing → write. See `../../scripts/build-1040-fixtures.ts`.

## Regenerating

1. Put real filed 1040 PDFs in the gitignored inbox `fixtures-src/` at the repo root, named
   `1040-<year>.pdf` (e.g. `fixtures-src/1040-2024.pdf`). At least one year should include a Schedule D.
2. Run `npm run build:fixtures`. For each year with both a profile and an inbox file it writes
   `1040-<year>.pdf` here, after verifying the rebuilt PDF extracts to the expected fields.
3. Commit the generated `1040-<year>.pdf` files. **Never commit `fixtures-src/`** — it holds real PII and
   is gitignored.

To change the synthetic amounts, filing status, or which year carries a Schedule D, edit `profiles.ts`
(one profile drives both what the builder stamps and what the test asserts) and rebuild.

## Files

| File               | Role                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| `profiles.ts`      | Per-year synthetic amounts + expected extracted fields (built from the map)   |
| `anonymize.ts`     | Whitelist scrub + synthetic-amount stamping of a real form's positioned text  |
| `rebuildPdf.ts`    | Redraw positioned text into a clean PDF at the same coordinates (pdf-lib)     |
| `readPdfInNode.ts` | Parse a PDF to `TextItem[]` + page sizes in Node (pdf.js legacy build)        |
| `devSamples.ts`    | Dev-only registry of the committed fixtures for the `ImportReturn` sample row |
| `1040-<year>.pdf`  | The committed, anonymized fixtures (built, not hand-authored)                 |
