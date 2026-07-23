import type { FilingStatus } from '../../tax/types';
import { groupRows, parseAmount, type Row, type TextItem } from '../rows';
import { lineSegment, indexOfRightmostAmount, LINE_ID } from '../section';
import { FACE_MARKERS, SCHEDULE_D_HEADER } from '../form1040';
import type { FixtureLine, FixtureProfile } from './profiles';

/**
 * Turn a real return's positioned text into a PII-free, layout-faithful fixture. Whitelist, not
 * blacklist: only the text the importer and its detection depend on is carried forward — the form
 * header, tax year, the checked filing-status row, each mapped line's id + label, and (when attached)
 * the Schedule D header. Every other row — name, SSN, address, dependents, employer, bank details — is
 * dropped wholesale, so there is no PII to miss. On the lines the profile names, the real amount is
 * overwritten with the profile's synthetic value (positioned exactly where the real amount sat, so the
 * extractor reads it the same way); any other stray money token on a kept row is scrubbed too.
 *
 * The result feeds `rebuildPdf`, which redraws these items into a clean PDF (see
 * `scripts/build-1040-fixtures.ts`). Pure: the input items are not mutated.
 */
export function anonymize(items: TextItem[], profile: FixtureProfile): TextItem[] {
  const rows = groupRows(items);
  const maxPage = rows.length ? rows[rows.length - 1].page : 1;
  const facePage = firstPageMatching(rows, (r) => FACE_MARKERS.some((m) => r.text.toLowerCase().includes(m))) ?? 1;
  const scheduleDPage = firstPageMatching(rows, (r) => SCHEDULE_D_HEADER.test(r.text));
  const faceLastPage = scheduleDPage ?? maxPage + 1; // faces run up to (not including) Schedule D

  const keep = new Set<Row>();
  const stamped = new Set<Row>();
  const written = new Set<TextItem>();

  for (const line of profile.lines) {
    const scope =
      line.where === 'scheduleD'
        ? rows.filter((r) => scheduleDPage !== null && r.page === scheduleDPage)
        : rows.filter((r) => r.page >= facePage && r.page < faceLastPage);
    stampLine(scope, line, keep, stamped, written);
  }

  for (const row of rows) {
    if (isStructural(row, profile.filingStatus)) keep.add(row);
  }

  ensureYearToken(rows, facePage, keep);

  // Belt-and-suspenders: on the income rows we stamped, strip any *other* money token — a real leftover
  // (a prior-year carryover, a second column) — so no real figure rides along. Structural rows (the
  // header's form number, the year) are left alone; they carry no dollar amounts to leak.
  for (const row of stamped) {
    row.items = row.items.filter((item) => written.has(item) || !isMoney(item.text) || LINE_ID.test(item.text.trim()));
  }

  return [...keep].flatMap((row) => row.items);
}

const STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'single',
  mfj: 'married filing jointly',
  mfs: 'married filing separately',
  hoh: 'head of household',
};

// A token that is exactly a 20xx year, optionally wrapped in parens — mirrors detect.ts's YEAR_TOKEN.
// https://regexper.com/#%2F%5E%5C%28%3F20%5Cd%7B2%7D%5C%29%3F%24%2F
const YEAR_TOKEN = /^\(?20\d{2}\)?$/;
const isYearToken = (text: string): boolean => YEAR_TOKEN.test(text.trim());
const isMoney = (text: string): boolean => parseAmount(text) !== null;

// Match how the extractor compares tokens: its `text` is trimmed and lower-cased at ingestion (see
// `TextItem`), so a profile's authored line id / boundary is normalized the same way before lookup.
const normalizeToken = (text: string): string => text.trim().toLowerCase();

/** Render a whole-dollar amount the way a 1040 prints it: thousands commas, negatives in parentheses. */
function formatAmount(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US');
  return n < 0 ? `(${abs})` : abs;
}

function firstPageMatching(rows: Row[], predicate: (r: Row) => boolean): number | null {
  const row = rows.find(predicate);
  return row ? row.page : null;
}

/** A row worth keeping for its structure alone (no amounts read from it): the form header, the checked
 *  filing-status row, or the Schedule D header. */
function isStructural(row: Row, filingStatus: FilingStatus): boolean {
  const text = row.text.toLowerCase();
  if (FACE_MARKERS.some((marker) => text.includes(marker))) return true;
  if (SCHEDULE_D_HEADER.test(row.text)) return true;
  return text.includes(STATUS_LABELS[filingStatus]);
}

/**
 * Overwrite (or, on a blank line, append) the synthetic amount for one profile line. Scans `scope` for
 * the first row carrying the line's id, replaces the rightmost amount in that id's segment with the
 * synthetic value, and marks the row kept. Throws if the id is nowhere in scope — a wrong profile or a
 * form the fixture wasn't built for should fail the build loudly rather than emit a silent gap.
 */
function stampLine(scope: Row[], line: FixtureLine, keep: Set<Row>, stamped: Set<Row>, written: Set<TextItem>): void {
  const normalizedId = normalizeToken(line.id);
  const bounds = new Set((line.boundaries ?? []).map(normalizeToken).filter((b) => b !== normalizedId));
  let matchedRow: Row | null = null;
  for (const row of scope) {
    const segment = lineSegment(row.items, normalizedId, bounds);
    if (!segment) continue;
    matchedRow ??= row;
    const idx = indexOfRightmostAmount(row.items, segment.start, segment.end, normalizedId);
    if (idx !== -1) {
      // Overwrite both text and originalText so the real amount doesn't ride along in the raw field.
      const synthetic = formatAmount(line.amount);
      const replacement = { ...row.items[idx], text: synthetic, originalText: synthetic };
      row.items[idx] = replacement;
      written.add(replacement);
      keep.add(row);
      stamped.add(row);
      return;
    }
  }
  if (matchedRow) {
    const rightmostX = Math.max(...matchedRow.items.map((i) => i.x));
    const synthetic = formatAmount(line.amount);
    const appended: TextItem = {
      text: synthetic,
      originalText: synthetic,
      x: rightmostX + 30,
      y: matchedRow.y,
      width: 40,
      page: matchedRow.page,
    };
    matchedRow.items.push(appended);
    written.add(appended);
    keep.add(matchedRow);
    stamped.add(matchedRow);
    return;
  }
  throw new Error(`anonymize: could not find line id "${line.id}" (${line.where}) to stamp its amount`);
}

/** The form's tax year must survive for detection. If no kept row already carries a year token, pull
 *  the first one on the face page into a single-token keep row so the year lands without dragging any
 *  neighboring identity text along. */
function ensureYearToken(rows: Row[], facePage: number, keep: Set<Row>): void {
  for (const row of keep) {
    if (row.items.some((i) => isYearToken(i.text))) return;
  }
  for (const row of rows) {
    if (row.page !== facePage) continue;
    const yearItem = row.items.find((i) => isYearToken(i.text));
    if (yearItem) {
      keep.add({
        page: row.page,
        y: row.y,
        items: [yearItem],
        text: yearItem.text,
        originalText: yearItem.originalText,
      });
      return;
    }
  }
}
