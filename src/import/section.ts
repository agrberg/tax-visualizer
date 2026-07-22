/**
 * A `Section` is a contiguous group of a form's reconstructed rows (the 1040 face, or Schedule D) that
 * answers dollar-amount lookups **without exposing its rows**: by *line id* (`amountForId`, for ids
 * stable across form years), by *printed label* (`amountForLabel` / `amountForLabelInSegment`, for
 * lines whose id drifts year to year), or by a windowed label read (`amountForLabelNear`). Pure over
 * row geometry (`./rows`) and the dev logger; unit-tested through its public interface (`section.test.ts`).
 */
import type { Row, TextItem } from './rows';
import { parseAmount } from './rows';
import { ilog } from './importLog';

/** Normalize a token for line-id / boundary comparison: trimmed and lower-cased. */
const normalizeToken = (text: string): string => text.trim().toLowerCase();

/** A token shaped like a 1040 line id — 1–2 digits with an optional trailing letter (e.g. "12e",
 * "5b", "7a", "9"). Used to skip a reprinted line id so it isn't read as a dollar amount. */
const LINE_ID = /^\d{1,2}[a-z]?$/i;

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
 * The `[start, end)` item range whose concatenated text first contains `labelLower` (a lower-cased
 * phrase), scanning left-to-right for the earliest, shortest contiguous run — or null. Used to locate
 * a printed label's position within a row so the amount can be read from the label's own segment
 * rather than anywhere on the row.
 */
function labelSpan(items: TextItem[], labelLower: string): { start: number; end: number } | null {
  for (let start = 0; start < items.length; start++) {
    let text = '';
    for (let end = start; end < items.length; end++) {
      text = (text ? `${text} ${items[end].text.trim()}` : items[end].text.trim()).replace(/\s+/g, ' ');
      if (text.toLowerCase().includes(labelLower)) return { start, end: end + 1 };
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
    const normalizedId = normalizeToken(id);
    const bounds = new Set(boundaries.map(normalizeToken).filter((b) => b !== normalizedId));
    for (const row of this.rows) {
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
   * The rightmost dollar amount on the first row whose text contains `label` (case-insensitive), plus
   * the id reprinted beside the amount box, for provenance. Locates a line by its *printed description*
   * rather than its line number — labels ("Standard deduction or itemized deductions", "Pensions and
   * annuities", "Capital gain or (loss)") are byte-stable across form years, while the numbers drift
   * and even get reused for different lines. Skips that reprinted id so it isn't mistaken for the
   * value; the real amount is the rightmost money token.
   *
   * The returned `lineId` is the row's leading id whenever one is present (the scan matches the leading
   * token itself, not only a reprint), and is `''` only when the matched row has no id-shaped token at
   * all — so callers that put it in user-visible provenance should supply a fallback label for that case.
   */
  amountForLabel(label: string): { value: number; lineId: string } | null {
    const labelLowercase = label.toLowerCase();
    for (const row of this.rows) {
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

  /**
   * Like `amountForLabel`, but bounds the read to the labeled line's own **segment** so a neighbor on a
   * shared row can't bleed in (see `lineSegment` for why 3a/3b and 4b/4c/4d need this). Finds the first
   * row containing `label`, locates the label's token span, then reads the rightmost parseable amount
   * from just after the span up to the next boundary id (`boundaries`, with `ownId` removed so a reprint
   * of the field's own id doesn't prematurely bound) or the row's end. Skips `ownId` and the row's
   * leading line-id reprints so a line number isn't read as a value. `lineId` is the row's leading
   * line-id token, or `''` when the row has none.
   */
  amountForLabelInSegment(
    label: string,
    boundaries: string[] = [],
    ownId?: string,
  ): { value: number; lineId: string } | null {
    const labelLower = label.toLowerCase();
    const normalizedOwn = ownId ? normalizeToken(ownId) : null;
    for (const row of this.rows) {
      if (!row.text.toLowerCase().includes(labelLower)) continue;
      const span = labelSpan(row.items, labelLower);
      if (!span) continue;
      const leadingToken = row.items.find((item) => LINE_ID.test(item.text.trim()));
      const leadingId = leadingToken ? normalizeToken(leadingToken.text) : null;
      // Without an explicit `ownId`, the row's own leading line id is the effective own id: its reprint
      // beside the amount must not bound the segment, or the scan stops at it before reaching the amount
      // (e.g. a merged `12a`/`12b`/`12c` deduction row read with no year detected).
      const effectiveOwn = normalizedOwn ?? leadingId;
      const bounds = new Set(boundaries.map(normalizeToken).filter((b) => b !== effectiveOwn));
      let end = span.end;
      while (end < row.items.length && !bounds.has(normalizeToken(row.items[end].text))) end++;
      for (let i = end - 1; i >= span.end; i--) {
        const token = normalizeToken(row.items[i].text);
        if (token === effectiveOwn || token === leadingId) continue;
        const value = parseAmount(row.items[i].text);
        if (value !== null) {
          ilog(`matched label "${label}" in segment on line "${leadingId ?? ''}" page ${row.page}: ${value}`);
          return { value, lineId: leadingId ?? '' };
        }
      }
    }
    return null;
  }

  /** The amount for `label` read in the row anchored by `anchorLabel` and the row after it — the pension
   *  gross/taxable sub-lines can split across two rows — falling back to `anchorLabel`'s own amount. */
  amountForLabelNear(anchorLabel: string, label: string): { value: number; lineId: string } | null {
    const anchor = this.rows.findIndex((row) => row.text.toLowerCase().includes(anchorLabel.toLowerCase()));
    if (anchor === -1) return null;
    const window = new Section(this.rows.slice(anchor, anchor + 2));
    return window.amountForLabel(label) ?? window.amountForLabel(anchorLabel);
  }
}
