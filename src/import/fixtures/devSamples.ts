/**
 * Dev-only registry of the committed sample fixtures, each resolved to a lazily-imported asset URL.
 * This module is imported dynamically and only under `import.meta.env.DEV` (see `ImportReturn`), so
 * Rollup drops it — and the fixture PDFs it references — from production builds. The list is empty
 * until fixtures are built (`npm run build:fixtures`).
 * https://regexper.com/#%2F1040-%28%5Cd%7B4%7D%29%5C.pdf%24%2F
 */
const MODULES = import.meta.glob<string>('./1040-*.pdf', { query: '?url', import: 'default' });

export interface SampleReturn {
  year: string;
  load: () => Promise<string>;
}

export const SAMPLE_RETURNS: SampleReturn[] = Object.entries(MODULES)
  .map(([path, load]) => ({ year: path.match(/1040-(\d{4})\.pdf$/)?.[1] ?? path, load }))
  .sort((a, b) => a.year.localeCompare(b.year));
