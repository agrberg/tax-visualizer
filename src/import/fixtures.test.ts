import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setImportLogging } from './importLog';
import { extract1040Fields } from './extract1040';
import { lineIdForYear } from './fieldLocations';
import { readPdfInNode } from './fixtures/readPdfInNode';
import { FIXTURE_PROFILES, fixtureFileName } from './fixtures/profiles';

beforeAll(() => setImportLogging(false));

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const pathFor = (year: number) => join(FIXTURES_DIR, fixtureFileName(year));

// A 3-2-4 grouping typical of a printed SSN. https://regexper.com/#%2F%5Cd%7B3%7D-%5Cd%7B2%7D-%5Cd%7B4%7D%2F
const SSN = /\d{3}-\d{2}-\d{4}/;

// The realistic per-year fixtures are built from real returns via `npm run build:fixtures` and are not
// checked in until then, so each year's assertions are skipped until its `1040-<year>.pdf` exists. The
// full anonymize→rebuild→read→extract chain is proven regardless in `fixtures/anonymize.test.ts`.
describe('per-year 1040 fixtures', () => {
  it('has a profile for every importer year 2019–2025', () => {
    expect(FIXTURE_PROFILES.map((p) => p.taxYear).sort((a, b) => a - b)).toEqual([
      2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
  });

  for (const profile of FIXTURE_PROFILES) {
    const { taxYear } = profile;
    const present = existsSync(pathFor(taxYear));
    const testFor = present ? it : it.skip;

    testFor(`extracts ${taxYear} to the expected fields, read from the real PDF`, async () => {
      const { items } = await readPdfInNode(pathFor(taxYear));
      const { fields, provenance, warnings } = extract1040Fields(items);

      // The exact income/status/deduction the importer should read.
      expect(fields).toEqual(profile.expected);

      // Provenance proves detection picked the right year and the map resolved the right line ids.
      expect(provenance.wages).toBe(`1040 line ${lineIdForYear('wages', taxYear)}`);
      expect(provenance.deduction).toBe(`1040 line ${lineIdForYear('deduction', taxYear)}`);

      // Year handling: a supported year is set on the fields; an older one is flagged unsupported.
      if (profile.expected.taxYear !== undefined) {
        expect(fields.taxYear).toBe(taxYear);
      } else {
        expect(warnings.some((w) => w.includes(String(taxYear)) && w.includes("isn't supported"))).toBe(true);
      }
    });

    testFor(`carries no SSN in the ${taxYear} fixture (anonymized)`, async () => {
      const { items } = await readPdfInNode(pathFor(taxYear));
      const text = items.map((i) => i.text).join(' ');
      expect(SSN.test(text)).toBe(false);
    });
  }
});
