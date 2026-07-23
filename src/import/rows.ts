/**
 * Text geometry: reconstructing form "rows" from loose positioned text, and parsing the
 * dollar figures printed in them. Pure and independent of pdf.js and of any 1040 knowledge,
 * so it can be unit-tested with synthetic layouts.
 */

/**
 * A single positioned piece of text from the PDF, in PDF user-space coordinates
 * (origin bottom-left, y increases upward).
 */
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  page: number;
}

/** A reconstructed line of the form: items sharing a baseline, left-to-right. */
export interface Row {
  page: number;
  y: number;
  items: TextItem[];
  text: string;
}

// Items whose baselines fall within this many units are treated as one row.
const ROW_TOLERANCE = 4;

/** Group loose text items into rows (top-to-bottom, then left-to-right within a row). */
export function groupRows(items: TextItem[]): Row[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const item of sorted) {
    if (item.text.trim() === '') continue;
    const row = rows[rows.length - 1];
    if (row && row.page === item.page && Math.abs(row.y - item.y) <= ROW_TOLERANCE) {
      row.items.push(item);
    } else {
      rows.push({ page: item.page, y: item.y, items: [item], text: '' });
    }
  }
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    row.text = row.items
      .map((i) => i.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
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
