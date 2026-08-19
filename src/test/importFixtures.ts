import type { TextItem } from '../import/rows';

/**
 * Test fixtures for the 1040 import geometry: builders for the positioned `TextItem`s the parsing
 * subsystem consumes. Shared by the `src/import/*.test.ts` suites so the width/normalization convention
 * lives in one place.
 */

/** A single positioned text item, normalized as at ingestion (trimmed + lower-cased). */
export function item(text: string, x: number, y: number, page = 1): TextItem {
  return { text: text.trim().toLowerCase(), originalText: text, x, y, width: text.length * 6, page };
}

/** A row of text items at baseline `y` on `page` from `[text, x]` cells. */
export function line(page: number, y: number, cells: [string, number][]): TextItem[] {
  return cells.map(([text, x]) => item(text, x, y, page));
}
