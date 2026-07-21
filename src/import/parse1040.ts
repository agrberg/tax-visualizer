import type { ParsedReturn } from './parsedReturn';
import { extract1040Fields, haveEverythingNeeded } from './extract1040';
import { ilog } from './importLog';

/**
 * Read income values out of a Form 1040 PDF, entirely in the browser.
 *
 * pdf.js is imported dynamically so its ~1 MB bundle only loads when a user
 * actually drops a file, rather than on initial page load. Text extraction is
 * isolated in ./pdfText; the mapping in ./extract1040 is pure and unit-tested.
 * Everything the reader sees and every match decision is logged (see ./importLog)
 * so we can tune the mapping against real returns.
 *
 * Extraction stops as soon as the importer has everything it needs (see `haveEverythingNeeded`):
 * nothing it reads lives past Schedule D, so the worksheets, state returns, and K-1s that pad a filed
 * bundle are never parsed.
 */
export async function parse1040(file: File): Promise<ParsedReturn> {
  ilog('parsing', file.name);
  const { extractTextItems } = await import('./pdfText');
  const items = await extractTextItems(file, haveEverythingNeeded());
  return extract1040Fields(items);
}
