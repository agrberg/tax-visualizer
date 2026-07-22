/**
 * A Form 1040 bundle, encapsulated. A dropped PDF is a pile of positioned text; `Form1040.from` groups
 * it into rows once, splits it into the regions the importer reads — the *face* (its own physical
 * pages, wherever a line drifted to) and *Schedule D* (when attached) — and detects the header (filing
 * status, tax year). The rows are **private**: callers don't pass `Row[]` around, they ask the form for
 * a line's amount by id or by printed label. How a page is classified and where the face ends stay
 * private here too. `extract1040` uses this to read fields and owns the tax logic over them.
 */
import { groupRows, type Row, type TextItem } from './rows';
import { Section } from './section';
import { detectFilingStatus, detectTaxYear } from './detect';
import type { FilingStatus } from '../tax/types';
import { ilog } from './importLog';

/** The page of the first row whose text contains `phrase` (case-insensitive), or null. */
function pageContaining(rows: Row[], phrase: string): number | null {
  const phraseLowercase = phrase.toLowerCase();
  for (const row of rows) {
    if (row.text.toLowerCase().includes(phraseLowercase)) return row.page;
  }
  return null;
}

// The 1040 face is its own physical pages; Schedule D (when attached) always follows them.
//
// FACE_TITLE uniquely names the real face page and is preferred. The looser "form 1040" also prints in
// every schedule's footer ("Schedule D (Form 1040)") and on tax-software cover pages, so it's only a
// last-resort fallback for locating the face when the title is absent — and an imperfect one: a cover
// page carrying "form 1040" ahead of the face would mislocate it. In practice the title prints on every
// real 1040 face, so the fallback rarely fires.
const FACE_TITLE = 'u.s. individual income tax return';
const FACE_MARKERS = [FACE_TITLE, 'form 1040'] as const;

// A page that begins a 1040 schedule, e.g. "SCHEDULE D (Form 1040)". The trailing "(Form 1040)" is what
// distinguishes a real schedule header from the face's own line-label references to schedules (e.g.
// line 12's "… (from Schedule A)"), which never carry it on the same row. Marks the end of the face
// without assuming a fixed page count. https://regexper.com/#%2Fschedule%5Cs%2B%5Cw%2B%5Cs*%5C%28form%5Cs%2B1040%5C%29%2Fi
const SCHEDULE_HEADER = /schedule\s+\w+\s*\(form\s+1040\)/i;

// The Schedule D page header, "SCHEDULE D (Form 1040)". Keyed off the form-identity header rather than
// the loose "Capital Gains and Losses" title, which a brokerage 1099-B supplement or the Schedule D
// instructions page can also carry — matching the phrase could truncate extraction early or read the
// gains from the wrong page. https://regexper.com/#%2Fschedule%5Cs%2Bd%5Cs*%5C%28form%5Cs%2B1040%5C%29%2Fi
const SCHEDULE_D_HEADER = /schedule\s+d\s*\(form\s+1040\)/i;

const pageIsFace = (pageRows: Row[]): boolean => pageContaining(pageRows, FACE_TITLE) !== null;
const pageStartsSchedule = (pageRows: Row[]): boolean => pageRows.some((row) => SCHEDULE_HEADER.test(row.text));
const pageIsScheduleD = (pageRows: Row[]): boolean => pageRows.some((row) => SCHEDULE_D_HEADER.test(row.text));

// Conservative face span (the classic 1040 is two pages) used when no schedule header marks the face's
// end, so an unbounded face can't stretch across appended non-1040 pages.
const DEFAULT_FACE_PAGES = 2;

/**
 * The last page of the 1040 face: starting at `facePage`, the face runs up to (not including) the first
 * following page that begins a schedule (see `SCHEDULE_HEADER`) — the face is contiguous at the front
 * of the bundle and every schedule carries a "(Form 1040)" header, so this bounds the face wherever it
 * ends, robust to a face that grows past two pages, without pulling schedules into it.
 *
 * When no schedule header follows (e.g. a return with no Schedule D, then an appended state return or
 * worksheets — none of which carry a "(Form 1040)" header), fall back to the conservative two-page span
 * rather than extend to the document's end: `amountForId` keeps scanning past a blank/absent face line,
 * so an unbounded face would let a colliding line id on an appended page leak into a 1040 field.
 */
function faceEndPage(byPage: Map<number, Row[]>, facePage: number): number {
  const maxPage = Math.max(facePage, ...byPage.keys());
  for (let page = facePage + 1; page <= maxPage; page++) {
    const pageRows = byPage.get(page);
    if (pageRows && pageStartsSchedule(pageRows)) return page - 1;
  }
  return Math.min(facePage + DEFAULT_FACE_PAGES - 1, maxPage);
}

/** The face and Schedule D regions of a parsed 1040, plus its detected header, resolved once. */
export class Form1040 {
  private readonly faceSection: Section;
  /** The Schedule D region, or null when the return has none (capital gains then read off the face). */
  readonly scheduleD: Section | null;
  /** The filing status and tax year detected from the face header (heuristic; the caller confirms). */
  readonly filingStatus: FilingStatus | null;
  readonly taxYear: number | null;

  private constructor(
    faceSection: Section,
    scheduleD: Section | null,
    filingStatus: FilingStatus | null,
    taxYear: number | null,
  ) {
    this.faceSection = faceSection;
    this.scheduleD = scheduleD;
    this.filingStatus = filingStatus;
    this.taxYear = taxYear;
  }

  static from(items: TextItem[]): Form1040 {
    const rows = groupRows(items);
    ilog(`grouped ${items.length} text items into ${rows.length} rows`);
    const byPage = Map.groupBy(rows, (row) => row.page);

    // Scope the face to its own pages — from the face page up to (not including) the next schedule — so
    // a stray "7" on Schedule 2 (or a reused line number deep in the return) can't be read as a 1040
    // value. Spanning every face page (not a fixed count) lets a field found by first occurrence land
    // wherever its line drifted to (e.g. the 2025 deduction on page 2) without per-field page bookkeeping.
    const facePage = pageContaining(rows, FACE_MARKERS[0]) ?? pageContaining(rows, FACE_MARKERS[1]) ?? 1;
    const lastFacePage = faceEndPage(byPage, facePage);
    const faceRows = rows.filter((row) => row.page >= facePage && row.page <= lastFacePage);
    ilog(`reading 1040 face on pages ${facePage}–${lastFacePage}`);

    // Schedule D can sit anywhere after the face; locate it by its own header, not by position.
    const scheduleDPage = rows.find((row) => SCHEDULE_D_HEADER.test(row.text))?.page ?? null;
    const scheduleDRows = scheduleDPage !== null ? (byPage.get(scheduleDPage) ?? null) : null;

    return new Form1040(
      new Section(faceRows),
      scheduleDRows ? new Section(scheduleDRows) : null,
      detectFilingStatus(faceRows),
      detectTaxYear(faceRows),
    );
  }

  // ── Face queries (delegated to the private face section) ──
  amountForId(id: string, boundaries?: string[]): number | null {
    return this.faceSection.amountForId(id, boundaries);
  }
  amountForLabel(label: string): { value: number; lineId: string } | null {
    return this.faceSection.amountForLabel(label);
  }
  amountForLabelInSegment(
    label: string,
    boundaries?: string[],
    ownId?: string,
  ): { value: number; lineId: string } | null {
    return this.faceSection.amountForLabelInSegment(label, boundaries, ownId);
  }
  amountForLabelNear(anchorLabel: string, label: string): { value: number; lineId: string } | null {
    return this.faceSection.amountForLabelNear(anchorLabel, label);
  }
}

/**
 * A stateful stop-condition for PDF text extraction (see `extractTextItems`): the importer should stop
 * pulling in pages the moment it has everything it needs, so the app parses and stores as little as
 * possible. Today "everything" is the 1040 face plus Schedule D (the only later page any value is read
 * from), and Schedule D always follows the face — so return `true` once, having seen the face, we reach
 * Schedule D. If that set grows, this predicate changes and callers don't.
 *
 * Returns `false` until the face appears and then the last-needed page does, so a return with no
 * Schedule D is simply read to the end (nothing signals "done" early — safe, just less economical).
 * Requiring the face first also guards the degenerate case of a pre-1040 worksheet that merely mentions
 * "Capital Gains and Losses": we keep reading until the real face is found.
 */
export function haveEverythingNeeded(): (pageItems: TextItem[]) => boolean {
  let faceSeen = false;
  return (pageItems) => {
    const pageRows = groupRows(pageItems);
    if (!faceSeen) {
      faceSeen = pageIsFace(pageRows);
      return false;
    }
    return pageIsScheduleD(pageRows);
  };
}
