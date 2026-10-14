/**
 * A `Section` is a contiguous group of a form's reconstructed rows (the 1040 face, or Schedule D) that
 * answers dollar-amount lookups **without exposing its rows**: by *line id* (`amountForId`, for ids
 * stable across form years), by *printed label* (`amountAndIdForLabel`, whole-row or segment-bounded via
 * `opts`, for lines whose id drifts year to year), or by a windowed label read (`amountForLabelNear`).
 * Pure over row geometry (`./rows`) and the dev logger; unit-tested through its public interface
 * (`section.test.ts`).
 *
 * Both sides of every comparison are already normalized, so `Section` never re-normalizes: the
 * `id`/`label`/`boundaries`/`ownId` arguments are lower-case literals at every call site
 * (`fieldLocations.ts`, `extract1040.ts`), and `row.text`/`item.text` are trimmed and lower-cased at
 * ingestion (see `TextItem` in `./rows`). The raw printed text is preserved in `originalText` and used
 * only for user-facing provenance (the returned `lineId`) and debug tracing.
 */
import type { TextItem, Row } from './rows';
import { parseAmount } from './rows';
import { ilog } from './importLog';

/** A token shaped like a 1040 line id — 1–2 digits with an optional trailing letter (e.g. "12e",
 * "5b", "7a", "9"). Used to skip a reprinted line id so it isn't read as a dollar amount. Tested
 * against `text`, which is already lower-cased. */
const LINE_ID = /^\d{1,2}[a-z]?$/;

/** A dollar amount read by printed label, with the row's line-id token in its original casing (`''` if none). */
export type LabelRead = { value: number; lineId: string };

/** Bounds a label read to the labeled line's own segment of a shared row. */
export type LabelSegment = { boundaries: string[]; ownId?: string };

/** A row's leading line id: normalized for comparison, original-cased for provenance. */
type LeadingLineId = { id: string | null; original: string };

/**
 * Dump a matched line and its raw token pieces so we can eyeball how pdf.js split the
 * text — e.g. whether a "(2,500)" loss arrives as one box or three (`(`, `2,500`, `)`),
 * which decides whether parseAmount can see the sign. `seg` flags the pieces that fall
 * in this line id's own segment (the tokens the value is read from). JSON so the console
 * output pastes cleanly back into review notes.
 */
function logMatchedLine(id: string, row: Row, start: number, end: number): void {
  const pieces = row.items.map((item, i) => ({
    text: item.originalText,
    x: Math.round(item.x),
    seg: i >= start && i < end,
  }));
  ilog(`matched line "${id}" on page ${row.page}: "${row.originalText}"`);
  ilog(`  pieces: ${JSON.stringify(pieces)}`);
}

/**
 * The half-open index range `[start, end)` of a line id's *segment* within a row — from the
 * token matching `id` up to the next boundary id (or the row's end); null if the row has
 * no such token. Sibling lines often share a baseline (e.g. 3a and 3b print side by side, grouping
 * into one row `"3a … 3a 58,986 b … 3b 84,388"`), so the segment stops one line's amount from
 * bleeding into its neighbour's.
 */
function lineSegment(items: TextItem[], id: string, bounds: Set<string>): { start: number; end: number } | null {
  const start = items.findIndex((item) => item.text === id);
  if (start === -1) return null;
  let end = start + 1;
  while (end < items.length && !bounds.has(items[end].text)) end++;
  return { start, end };
}

/**
 * The rightmost parseable dollar amount in `items[start+1, end)`, or null. Skips any token equal
 * to `id`: a line number is often reprinted beside its own amount, and e.g. "7" must not
 * be read as $7.
 */
function rightmostAmount(items: TextItem[], start: number, end: number, id: string): number | null {
  for (let i = end - 1; i > start; i--) {
    if (items[i].text === id) continue;
    const value = parseAmount(items[i].text);
    if (value !== null) return value;
  }
  return null;
}

/**
 * The `[start, end)` item range whose concatenated text first contains `label` (a lower-cased
 * phrase), scanning left-to-right for the earliest, shortest contiguous run — or null. Used to locate
 * a printed label's position within a row so the amount can be read from the label's own segment
 * rather than anywhere on the row.
 */
function labelSpan(items: TextItem[], label: string): { start: number; end: number } | null {
  for (let start = 0; start < items.length; start++) {
    let text = '';
    for (let end = start; end < items.length; end++) {
      text = (text ? `${text} ${items[end].text}` : items[end].text).replace(/\s+/g, ' ');
      if (text.includes(label)) return { start, end: end + 1 };
    }
  }
  return null;
}

/**
 * The row's leading line-id token (leftmost token matching `LINE_ID`), searched left-to-right so a
 * merged left-margin heading sitting left of the id doesn't hide it. Returns the normalized id (for
 * comparison) and the original-cased text (for user-facing provenance). When the row has none, `id` is
 * null and `original` is `''`.
 */
function leadingLineId(items: TextItem[]): LeadingLineId {
  const token = items.find((item) => LINE_ID.test(item.text));
  return { id: token ? token.text : null, original: token ? token.originalText.trim() : '' };
}

/** Whole-row read: the rightmost amount on `row`, skipping the leading-id reprint, whose text is the `lineId`. */
function amountOnWholeRow(row: Row, label: string, leadingId: string | null): LabelRead | null {
  let value: number | null = null;
  let lineId = '';
  for (let i = row.items.length - 1; i >= 0; i--) {
    const item = row.items[i];
    if (leadingId !== null && item.text === leadingId) {
      lineId = item.originalText.trim();
      continue;
    }
    if (value === null) value = parseAmount(item.text);
    if (value !== null && lineId) break;
  }
  if (value === null) return null;
  ilog(`matched label "${label}" on line "${lineId}" page ${row.page}: ${value}`);
  return { value, lineId };
}

/** Segment read: the rightmost amount from just after the label span to the next boundary id (or row end). */
function amountInLabelSegment(row: Row, label: string, opts: LabelSegment, leading: LeadingLineId): LabelRead | null {
  const span = labelSpan(row.items, label);
  if (!span) return null;
  const effectiveOwn = opts.ownId || leading.id;
  const bounds = new Set(opts.boundaries.filter((b) => b !== effectiveOwn));
  let end = span.end;
  while (end < row.items.length && !bounds.has(row.items[end].text)) end++;
  for (let i = end - 1; i >= span.end; i--) {
    const token = row.items[i].text;
    if (token === effectiveOwn || token === leading.id) continue;
    const value = parseAmount(token);
    if (value !== null) {
      ilog(`matched label "${label}" in segment on line "${leading.original}" page ${row.page}: ${value}`);
      return { value, lineId: leading.original };
    }
  }
  return null;
}

export class Section {
  private readonly rows: Row[];

  constructor(rows: Row[]) {
    this.rows = rows;
  }

  /**
   * The dollar amount belonging to a line identifier (e.g. "3a", "7"): the rightmost amount within the
   * id's segment, scanning rows until one yields a value. `boundaries` are the sibling line ids that
   * delimit a segment (see `lineSegment` for why a segment is needed); omit them for a line that sits
   * alone on its row, where the segment simply runs to the row's end.
   */
  amountForId(id: string, boundaries: string[] = []): number | null {
    const bounds = new Set(boundaries.filter((b) => b !== id));
    for (const row of this.rows) {
      const segment = lineSegment(row.items, id, bounds);
      if (!segment) continue;
      logMatchedLine(id, row, segment.start, segment.end);
      const value = rightmostAmount(row.items, segment.start, segment.end, id);
      if (value !== null) return value;
      // Matched the id but found no amount in its segment; keep scanning later rows.
    }
    return null;
  }

  /**
   * The dollar amount and line id for the first row whose text contains `label` (already lower-case).
   * Locates a line by its byte-stable printed description rather than its drifting number.
   *
   * Omitting `opts` is a different read, not a looser one. It scans the whole row right-to-left for the
   * rightmost amount (skipping the row's own leading-id reprint) — the fallback used when a field's id is
   * unknown. With `opts`, the read is bounded to the labeled line's own segment (delimited by
   * `opts.boundaries`, minus `opts.ownId`) so a neighbor on a shared row (3a/3b, 4b/4c/4d, 12a/12b/12c)
   * can't bleed in. `boundaries` is required in `opts` so the segment mode is always fully specified —
   * `ownId` alone can't silently fall through to whole-row.
   *
   * `lineId` is the row's line-id text in original casing, or `''` when the row has none. The whole-row
   * path takes it from the rightmost token equal to the leading id (the reprint beside the amount) and the
   * segment path from the leading id itself. The two differ only if the reprint and the leading id are
   * printed in different casing.
   */
  amountAndIdForLabel(label: string, opts?: LabelSegment): LabelRead | null {
    for (const row of this.rows) {
      if (!row.text.includes(label)) continue;
      const leading = leadingLineId(row.items);
      const read = opts ? amountInLabelSegment(row, label, opts, leading) : amountOnWholeRow(row, label, leading.id);
      if (read) return read;
    }
    return null;
  }

  /** The amount for `label` read in the row anchored by `anchorLabel` and the row after it — the pension
   *  gross/taxable sub-lines can split across two rows — falling back to `anchorLabel`'s own amount. */
  amountForLabelNear(anchorLabel: string, label: string): number | null {
    const anchor = this.rows.findIndex((row) => row.text.includes(anchorLabel));
    if (anchor === -1) return null;
    const window = new Section(this.rows.slice(anchor, anchor + 2));
    return (window.amountAndIdForLabel(label) ?? window.amountAndIdForLabel(anchorLabel))?.value ?? null;
  }
}
