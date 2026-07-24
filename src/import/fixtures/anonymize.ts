import type { FilingStatus } from '../../tax/types';
import { groupRows, parseAmount, type Row, type TextItem } from '../rows';
import { lineSegment, indexOfRightmostAmount, LINE_ID } from '../section';
import { FACE_MARKERS, SCHEDULE_D_HEADER, faceEndPage } from '../form1040';
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
  // Mirrors form1040.ts's own fallback order: prefer the precise FACE_TITLE, and only fall back to the
  // loose "form 1040" (which a cover letter or filing-instructions page ahead of the real face can also
  // carry) if the title is nowhere in the document.
  const facePage =
    firstPageMatching(rows, (r) => r.text.toLowerCase().includes(FACE_MARKERS[0])) ??
    firstPageMatching(rows, (r) => r.text.toLowerCase().includes(FACE_MARKERS[1])) ??
    1;
  const scheduleDPage = firstPageMatching(rows, (r) => SCHEDULE_D_HEADER.test(r.text));
  // Reuses the real parser's own face-bounding logic rather than a local approximation: the face ends
  // at the first *any* schedule header, not just Schedule D, so an attached Schedule 1/2/3/B/C/etc.
  // whose own line numbering happens to collide with a face id can't be scanned as part of the face.
  const lastFacePage = faceEndPage(
    Map.groupBy(rows, (row) => row.page),
    facePage,
  );

  const keep = new Set<Row>();
  const stamped = new Set<Row>();
  const written = new Set<TextItem>();

  for (const line of profile.lines) {
    const scope =
      line.where === 'scheduleD'
        ? rows.filter((r) => scheduleDPage !== null && r.page === scheduleDPage)
        : rows.filter((r) => r.page >= facePage && r.page <= lastFacePage);
    stampLine(scope, line, keep, stamped, written);
  }

  const structuralItems = new Set<TextItem>();
  for (const row of rows) {
    for (const marker of FACE_MARKERS) {
      itemsSatisfying(row, marker.length + 20, (joined) => joined.toLowerCase().includes(marker))?.forEach((i) =>
        structuralItems.add(i),
      );
    }
    itemsSatisfying(row, 40, (joined) => SCHEDULE_D_HEADER.test(joined))?.forEach((i) => structuralItems.add(i));
  }

  keep.add(syntheticFilingStatusRow(rows, facePage, profile.filingStatus));
  ensureYearToken(rows, facePage, keep);

  // Belt-and-suspenders: on the income rows we stamped, strip any *other* money token — a real leftover
  // (a prior-year carryover, a second column) — so no real figure rides along. Structural rows (the
  // header's form number, the year) are left alone; they carry no dollar amounts to leak.
  for (const row of stamped) {
    row.items = row.items.filter((item) => written.has(item) || !isMoney(item.text) || LINE_ID.test(item.text.trim()));
  }

  return [...keep].flatMap((row) => row.items).concat([...structuralItems]);
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

/**
 * The shortest contiguous run of `row`'s items whose joined text satisfies `matches`, or null if none
 * does. Used to keep a structural marker (the form header, the Schedule D header) without keeping the
 * *whole* row it sits on: some preparer software stamps a running footer as one baseline — "Form 1040
 * (2020) <Name> <SSN> Page 2" — so keeping the row wholesale would leak the name and SSN glued onto it.
 * `maxJoinedLength` bounds the search (a couple of matcher-lengths' slack for whitespace) so it doesn't
 * keep growing the run past where the phrase could still be forming.
 */
function itemsSatisfying(row: Row, maxJoinedLength: number, matches: (joined: string) => boolean): TextItem[] | null {
  for (let start = 0; start < row.items.length; start++) {
    let joined = '';
    for (let end = start; end < row.items.length; end++) {
      joined = joined ? `${joined} ${row.items[end].text}` : row.items[end].text;
      if (matches(joined)) return row.items.slice(start, end + 1);
      if (joined.length > maxJoinedLength) break;
    }
  }
  return null;
}

/**
 * Build a fresh filing-status checkbox row — a check mark immediately followed by the profile's
 * status label, on its own baseline — rather than carrying over the real form's checkbox. Real
 * preparer software renders it inconsistently: some draw an unchecked box as pure vector art with no
 * extractable text at all (so a real return can show *no* check token anywhere), others place a
 * checked mark on a baseline that doesn't line up with any label's row within `ROW_TOLERANCE`. Either
 * way there's no reliable real row to reuse, and reusing one would leak the real filer's actual status
 * on returns where it differs from the profile's synthetic one. `detectFilingStatus` only needs a
 * check-token item followed by the label text on the same row, so this row is exactly that.
 */
function syntheticFilingStatusRow(rows: Row[], facePage: number, filingStatus: FilingStatus): Row {
  const anchor = rows.find((r) => r.page === facePage && r.text.includes('filing status'));
  const y = anchor?.y ?? 700;
  const x = anchor ? Math.min(...anchor.items.map((i) => i.x)) : 50;
  const mark: TextItem = { text: 'x', originalText: 'X', x, y, width: 6, page: facePage };
  const label = STATUS_LABELS[filingStatus];
  // originalText mirrors how the IRS actually prints the label (first letter capitalized) — detection
  // itself is case-insensitive, but this keeps a rebuilt fixture visually indistinguishable from a real
  // one, and matches what `originalText` means everywhere else (the raw, as-printed text).
  const printedLabel = label[0].toUpperCase() + label.slice(1);
  const labelItem: TextItem = {
    text: label,
    originalText: printedLabel,
    x: x + 10,
    y,
    width: label.length * 5,
    page: facePage,
  };
  return { page: facePage, y, items: [mark, labelItem], text: `x ${label}`, originalText: `X ${printedLabel}` };
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
