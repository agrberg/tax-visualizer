/**
 * Text geometry: reconstructing form "rows" from loose positioned text, and parsing the
 * dollar figures printed in them. Pure and independent of pdf.js and of any 1040 knowledge,
 * so it can be unit-tested with synthetic layouts.
 */

/**
 * A single positioned piece of text from the PDF, in PDF user-space coordinates
 * (origin bottom-left, y increases upward).
 *
 * `text` is normalized — trimmed and lower-cased at ingestion (see `pdfText.ts`) — because almost
 * every consumer matches case/whitespace-insensitively. `originalText` preserves the raw extracted
 * text for the few spots that need it back (debug tracing, unrecognized-glyph diagnostics), so it's
 * the explicit, less-common choice.
 */
export interface TextItem {
  text: string;
  originalText: string;
  x: number;
  y: number;
  width: number;
  page: number;
}

/** A pdf.js text item: the string plus a 6-number transform (x = [4], y = [5]). Typed structurally so
 *  the raw `content.items` from either pdf.js build (browser or Node `legacy`) can be mapped without
 *  importing pdf.js here — this module stays pdf.js-free. */
export interface RawPositionedItem {
  str: string;
  transform: number[];
  width: number;
}

/**
 * Map one page's raw pdf.js text items to the normalized `TextItem` shape the extractor consumes:
 * `text` trimmed and lower-cased, the raw string kept in `originalText`. Marked-content items (no
 * `str`) and empty items are skipped. Shared by the browser read path (`pdfText.ts`) and the Node
 * fixture read path (`fixtures/readPdfInNode.ts`) so both produce identical items — the fixtures a
 * build emits are then read back exactly as a dropped file would be.
 */
export function mapPageItems(rawItems: Iterable<unknown>, page: number): TextItem[] {
  const items: TextItem[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object' || !('str' in raw)) continue;
    const item = raw as RawPositionedItem;
    const trimmed = item.str.trim();
    if (trimmed === '') continue;
    items.push({
      text: trimmed.toLowerCase(),
      originalText: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      page,
    });
  }
  return items;
}

/** A reconstructed line of the form: items sharing a baseline, left-to-right. `text`/`originalText`
 *  carry the same normalized/raw split as the items they're joined from. */
export interface Row {
  page: number;
  y: number;
  items: TextItem[];
  text: string;
  originalText: string;
}

// Items whose baselines fall within this many units are treated as one row.
const ROW_TOLERANCE = 4;

const joinItemText = (items: TextItem[], key: 'text' | 'originalText'): string =>
  items
    .map((i) => i[key])
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Group loose text items into rows (top-to-bottom, then left-to-right within a row). Items arrive
 *  already normalized (see `TextItem`); this only groups by baseline and joins each row's text. */
export function groupRows(items: TextItem[]): Row[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const item of sorted) {
    if (item.text === '') continue;
    const row = rows[rows.length - 1];
    if (row && row.page === item.page && Math.abs(row.y - item.y) <= ROW_TOLERANCE) {
      row.items.push(item);
    } else {
      rows.push({ page: item.page, y: item.y, items: [item], text: '', originalText: '' });
    }
  }
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    row.originalText = joinItemText(row.items, 'originalText');
    row.text = joinItemText(row.items, 'text');
  }
  return rows;
}

/**
 * Parse a whole-dollar figure. Handles thousands commas, a `$`, a leading minus or
 * parentheses for negatives, and a trailing cents decimal, e.g. "$1,234" → 1234,
 * "(500)" → -500, "-4,000" → -4000, "2,100.00" → 2100. The app models whole dollars,
 * so any cents are dropped. Returns null for anything without digits in its integer
 * part (so a stray label token isn't mistaken for an amount).
 */
export function parseAmount(text: string): number | null {
  const t = text.trim();
  if (!/\d/.test(t)) return null;
  if (/[a-zA-Z]/.test(t)) return null;
  const negative = /^\(.*\)$/.test(t) || /^-/.test(t);
  // Strip to digits and dots, then take the whole-dollar part before any decimal point. What's left
  // is already digits-only (the replace removed everything else, and the split dropped the dot), so
  // it's ready for Number without a further scrub.
  const integerPart = t.replace(/[^0-9.]/g, '').split('.')[0];
  if (integerPart === '') return null;
  return negative ? -Number(integerPart) : Number(integerPart);
}
