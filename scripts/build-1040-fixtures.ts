/**
 * Build the anonymized per-year 1040 fixtures from real returns.
 *
 * Drop real filed 1040 PDFs into the gitignored inbox (default `fixtures-src/`), named `1040-<year>.pdf`
 * (e.g. `fixtures-src/1040-2024.pdf`). For each year with both a profile (`src/import/fixtures/profiles.ts`)
 * and an inbox file, this reads the real form's positioned text, strips it to PII-free structure with
 * synthetic amounts (`anonymize`), redraws a clean PDF at the real coordinates (`rebuildPdf`), writes
 * it to `src/import/fixtures/1040-<year>.pdf`, and re-parses the result to verify the importer extracts
 * exactly the profile's expected fields. Raw returns never leave the inbox; only the rebuilt fixtures
 * are written under `src/`.
 *
 * Run: `npm run build:fixtures` (vite-node). Local dev tool — not part of the app build or CI.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPdfInNode } from '../src/import/fixtures/readPdfInNode';
import { rebuildPdf, type PageSize } from '../src/import/fixtures/rebuildPdf';
import { anonymize } from '../src/import/fixtures/anonymize';
import { extract1040Fields } from '../src/import/extract1040';
import { FIXTURE_PROFILES, fixtureFileName, type FixtureProfile } from '../src/import/fixtures/profiles';
import { setImportLogging } from '../src/import/importLog';
import type { TextItem } from '../src/import/rows';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const INBOX = join(repoRoot, 'fixtures-src');
const OUT_DIR = join(repoRoot, 'src/import/fixtures');

/** Drop pages with no kept items and renumber the survivors 1..N, so a rebuilt fixture is just the
 *  face pages plus Schedule D — not the empty shells of dropped schedules/worksheets in between.
 *  Extraction depends on page order and the Schedule D header, not absolute page numbers. */
function compactPages(items: TextItem[], pageSizes: PageSize[]): { items: TextItem[]; pageSizes: PageSize[] } {
  const usedPages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  const renumber = new Map(usedPages.map((page, index) => [page, index + 1]));
  return {
    items: items.map((item) => ({ ...item, page: renumber.get(item.page)! })),
    pageSizes: usedPages.map((page) => pageSizes[page - 1]),
  };
}

/** Compare a built fixture's extracted fields against the profile's expectation; return mismatches. */
function verify(profile: FixtureProfile, fields: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [key, want] of Object.entries(profile.expected)) {
    const got = fields[key];
    if (got !== want) problems.push(`  ${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
  return problems;
}

async function build(): Promise<void> {
  setImportLogging(false);
  let inboxFiles: string[] = [];
  try {
    inboxFiles = await readdir(INBOX);
  } catch {
    console.error(`No inbox at ${INBOX}. Create it and drop real 1040 PDFs named 1040-<year>.pdf inside.`);
    process.exitCode = 1;
    return;
  }

  let built = 0;
  let failed = 0;
  for (const profile of FIXTURE_PROFILES) {
    const inName = `1040-${profile.taxYear}.pdf`;
    if (!inboxFiles.includes(inName)) {
      console.log(`- ${profile.taxYear}: no ${inName} in inbox — skipped`);
      continue;
    }
    const { items, pageSizes } = await readPdfInNode(join(INBOX, inName));
    const cleaned = anonymize(items, profile);
    const compacted = compactPages(cleaned, pageSizes);
    const bytes = await rebuildPdf(compacted.items, compacted.pageSizes);

    const { items: readBack } = await readPdfInNode(bytes);
    const { fields } = extract1040Fields(readBack);
    const problems = verify(profile, fields);
    if (problems.length > 0) {
      failed++;
      console.error(`✗ ${profile.taxYear}: rebuilt fixture does not extract as expected:\n${problems.join('\n')}`);
      continue;
    }
    await writeFile(join(OUT_DIR, fixtureFileName(profile.taxYear)), bytes);
    built++;
    console.log(
      `✓ ${profile.taxYear}: wrote ${fixtureFileName(profile.taxYear)} (${compacted.pageSizes.length} page(s))`,
    );
  }

  console.log(`\nBuilt ${built} fixture(s)${failed ? `, ${failed} failed verification` : ''}.`);
  if (failed) process.exitCode = 1;
}

void build();
