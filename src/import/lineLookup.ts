/**
 * The lookup engine: given the reconstructed rows of a 1040, find the dollar amount that
 * belongs to a line — located either by its *line id* (`amountForId`, for ids that are
 * stable across form years) or by its *printed label* (`amountForLabel`, for lines whose id
 * drifts year to year). Pure; depends only on row geometry (`./rows`) and the dev logger.
 */
import type { Row, TextItem } from './rows';
import { parseAmount } from './rows';
import { ilog } from './importLog';

/** Normalize a token for line-id / boundary comparison: trimmed and lower-cased. */
const normalizeToken = (text: string): string => text.trim().toLowerCase();

/** A token shaped like a 1040 line id — 1–2 digits with an optional trailing letter (e.g. "12e",
 * "5b", "7a", "9"). Used to skip a reprinted line id so it isn't read as a dollar amount. */
const LINE_ID = /^\d{1,2}[a-z]?$/i;

/** The page of the first row whose text contains `phrase` (case-insensitive), or null. */
export function pageContaining(rows: Row[], phrase: string): number | null {
  const phraseLowercase = phrase.toLowerCase();
  for (const row of rows) {
    if (row.text.toLowerCase().includes(phraseLowercase)) return row.page;
  }
  return null;
}

/**
 * Dump a matched line and its raw token pieces so we can eyeball how pdf.js split the
 * text — e.g. whether a "(2,500)" loss arrives as one box or three (`(`, `2,500`, `)`),
 * which decides whether parseAmount can see the sign. `seg` flags the pieces that fall
 * in this line id's own segment (the tokens the value is read from). JSON so the console
 * output pastes cleanly back into review notes.
 */
function logMatchedLine(id: string, row: Row, start: number, end: number): void {
  const pieces = row.items.map((item, i) => ({
    text: item.text,
    x: Math.round(item.x),
    seg: i >= start && i < end,
  }));
  ilog(`matched line "${id}" on page ${row.page}: "${row.text}"`);
  ilog(`  pieces: ${JSON.stringify(pieces)}`);
}

/**
 * The half-open index range `[start, end)` of a line id's *segment* within a row — from the
 * token matching `normalizedId` up to the next boundary id (or the row's end); null if the row has
 * no such token. Sibling lines often share a baseline (e.g. 3a and 3b print side by side, grouping
 * into one row `"3a … 3a 58,986 b … 3b 84,388"`), so the segment stops one line's amount from
 * bleeding into its neighbour's.
 */
function lineSegment(
  items: TextItem[],
  normalizedId: string,
  bounds: Set<string>,
): { start: number; end: number } | null {
  const start = items.findIndex((item) => normalizeToken(item.text) === normalizedId);
  if (start === -1) return null;
  let end = start + 1;
  while (end < items.length && !bounds.has(normalizeToken(items[end].text))) end++;
  return { start, end };
}

/**
 * The rightmost parseable dollar amount in `items[start+1, end)`, or null. Skips any token equal
 * to `normalizedId`: a line number is often reprinted beside its own amount, and e.g. "7" must not
 * be read as $7.
 */
function rightmostAmount(items: TextItem[], start: number, end: number, normalizedId: string): number | null {
  for (let i = end - 1; i > start; i--) {
    if (normalizeToken(items[i].text) === normalizedId) continue;
    const value = parseAmount(items[i].text);
    if (value !== null) return value;
  }
  return null;
}

/**
 * The dollar amount belonging to a line identifier (e.g. "3a", "7"): the rightmost amount within
 * the id's segment, scanning rows until one yields a value. `boundaryIds` are the sibling line
 * ids that delimit a segment (see `lineSegment` for why a segment is needed).
 */
export function amountForId(rows: Row[], id: string, boundaryIds: string[]): number | null {
  const normalizedId = normalizeToken(id);
  const bounds = new Set(boundaryIds.map(normalizeToken).filter((b) => b !== normalizedId));
  for (const row of rows) {
    const segment = lineSegment(row.items, normalizedId, bounds);
    if (!segment) continue;
    logMatchedLine(id, row, segment.start, segment.end);
    const value = rightmostAmount(row.items, segment.start, segment.end, normalizedId);
    if (value !== null) return value;
    // Matched the id but found no amount in its segment; keep scanning later rows.
  }
  return null;
}

/**
 * The rightmost dollar amount on the first row whose text contains `label` (case-insensitive),
 * plus the id reprinted beside the amount box, for provenance. Locates a line by its *printed
 * description* rather than its line number — labels ("Standard deduction or itemized deductions",
 * "Pensions and annuities", "Capital gain or (loss)") are byte-stable across form years, while the
 * numbers drift and even get reused for different lines. Skips that reprinted id so it isn't
 * mistaken for the value; the real amount is the rightmost money token.
 *
 * The returned `lineId` is the row's leading id whenever one is present (the scan matches the
 * leading token itself, not only a reprint), and is `''` only when the matched row has no
 * id-shaped token at all — so callers that put it in user-visible provenance should supply a
 * fallback label for that case.
 */
export function amountForLabel(rows: Row[], label: string): { value: number; lineId: string } | null {
  const labelLowercase = label.toLowerCase();
  for (const row of rows) {
    if (!row.text.toLowerCase().includes(labelLowercase)) continue;
    // The row's own line id always leads it (leftmost token) and may be reprinted again just
    // left of the amount box. Skip only tokens matching that specific id — not any id-shaped
    // token — so a 1-2 digit amount (e.g. "$7"), which is shaped just like a line id, is still
    // read as the value rather than mistaken for the reprint. The left-margin instruction column
    // (its text, and on the deduction line its "Standard Deduction for—" heading) sits at much
    // lower x on merged rows, so it is never the rightmost money token on a filled line; a blank
    // line yields no money token and is correctly skipped. (Verified against IRS PDFs 2019–2025.)
    // Search left-to-right, not just row.items[0]: a merged left-margin heading (e.g. the
    // deduction line's "Standard Deduction for—" text) can sit left of the id itself.
    const leadingToken = row.items.find((item) => LINE_ID.test(item.text.trim()));
    const leadingId = leadingToken ? normalizeToken(leadingToken.text) : null;
    let value: number | null = null;
    let lineId = '';
    for (let i = row.items.length - 1; i >= 0; i--) {
      const token = row.items[i].text.trim();
      if (leadingId !== null && normalizeToken(token) === leadingId) {
        lineId = token;
        continue;
      }
      if (value === null) value = parseAmount(token);
      if (value !== null && lineId) break;
    }
    if (value !== null) {
      ilog(`matched label "${label}" on line "${lineId}" page ${row.page}: ${value}`);
      return { value, lineId };
    }
  }
  return null;
}
