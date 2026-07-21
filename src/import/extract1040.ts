import { ALL_SOURCES, coerceDeduction, type IncomeSource } from '../tax/types';
import { isTaxYear, taxTablesFor } from '../tax/years';
import { formatCurrency } from '../tax/format';
import type { ParsedReturn } from './parsedReturn';
import { ilog, setImportStep } from './importLog';
import { groupRows, type Row, type TextItem } from './rows';
import { amountForLabel, amountForId, pageContaining } from './lineLookup';
import { detectFilingStatus, detectTaxYear } from './detect';
import {
  STABLE_FIELD_IDS,
  lineIdForYear,
  currentLineId,
  EARLIEST_MAPPED_YEAR,
  type DriftingField,
} from './fieldLocations';

// Phrases that identify the pages the importer reads. The 1040 face is its own physical pages;
// Schedule D (when attached) always follows them.
//
// FACE_TITLE uniquely names the real face page. The looser "form 1040" also prints in every schedule's
// footer ("Schedule D (Form 1040)") and on tax-software cover pages, so it's only a *fallback* for
// locating the face page number — safe there because the face precedes every schedule, so its first
// occurrence still wins.
const FACE_TITLE = 'u.s. individual income tax return';
const FACE_MARKERS = [FACE_TITLE, 'form 1040'] as const;

// The extraction stop-guard matches only the unique title: the loose "form 1040" would let a cover
// page or a schedule footer set `faceSeen` and stop extraction before the real face is reached.
const pageIsFace = (pageRows: Row[]): boolean => pageContaining(pageRows, FACE_TITLE) !== null;

// A page that begins a 1040 schedule, e.g. "SCHEDULE D (Form 1040)". The trailing "(Form 1040)" is
// what distinguishes a real schedule header from the face's own line-label references to schedules
// (e.g. line 12's "… (from Schedule A)"), which never carry it on the same row. Used to mark the end
// of the 1040 face without assuming a fixed page count. https://regexper.com/#%2Fschedule%5Cs%2B%5Cw%2B%5Cs*%5C%28form%5Cs%2B1040%5C%29%2Fi
const SCHEDULE_HEADER = /schedule\s+\w+\s*\(form\s+1040\)/i;
const pageStartsSchedule = (pageRows: Row[]): boolean => pageRows.some((row) => SCHEDULE_HEADER.test(row.text));

// The Schedule D page header, "SCHEDULE D (Form 1040)". Keyed off the form-identity header rather than
// the loose "Capital Gains and Losses" title, which a brokerage 1099-B supplement or the Schedule D
// instructions page can also carry — matching the phrase could truncate extraction early or read the
// gains from the wrong page. https://regexper.com/#%2Fschedule%5Cs%2Bd%5Cs*%5C%28form%5Cs%2B1040%5C%29%2Fi
const SCHEDULE_D_HEADER = /schedule\s+d\s*\(form\s+1040\)/i;
const pageIsScheduleD = (pageRows: Row[]): boolean => pageRows.some((row) => SCHEDULE_D_HEADER.test(row.text));

// Conservative face span (the classic 1040 is two pages) used when no schedule header marks the
// face's end, so an unbounded face can't stretch across appended non-1040 pages.
const DEFAULT_FACE_PAGES = 2;

/**
 * The last page of the 1040 face: starting at `facePage`, the face runs up to (not including) the first
 * following page that begins a schedule (see `SCHEDULE_HEADER`) — the 1040 face is contiguous at the
 * front of the bundle and every schedule carries a "(Form 1040)" header, so this bounds the face
 * wherever it ends, robust to a face that grows past two pages, without pulling schedules into it.
 *
 * When no schedule header follows (e.g. a return with no Schedule D, then an appended state return or
 * worksheets — none of which carry a "(Form 1040)" header), fall back to the conservative two-page
 * span rather than extend to the document's end: `amountForId` keeps scanning past a blank/absent face
 * line, so an unbounded face would let a colliding line id on an appended page leak into a 1040 field.
 */
function faceEndPage(rows: Row[], facePage: number): number {
  // groupRows returns rows in page order, so the last row sits on the highest page.
  const maxPage = rows.length ? rows[rows.length - 1].page : facePage;
  for (let page = facePage + 1; page <= maxPage; page++) {
    if (pageStartsSchedule(rows.filter((row) => row.page === page))) return page - 1;
  }
  return Math.min(facePage + DEFAULT_FACE_PAGES - 1, maxPage);
}

/**
 * A stateful stop-condition for PDF text extraction (see `extractTextItems`): the importer should stop
 * pulling in pages the moment it has everything it needs, so the app parses and stores as little as
 * possible. Today "everything" is the 1040 face plus Schedule D (the only later page any value is read
 * from), and Schedule D always follows the face — so we return `true` once, having seen the face, we
 * reach Schedule D. Which page happens to be last is an implementation detail of what we currently
 * read; if that set grows, this predicate changes and callers don't.
 *
 * Returns `false` until the face appears and then the last-needed page does, so a return with no
 * Schedule D is simply read to the end (nothing signals "done" early — safe, just less economical).
 * Requiring the face first also guards the degenerate case of a pre-1040 worksheet that merely
 * mentions "Capital Gains and Losses": we keep reading until the real face is found.
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

/**
 * The accumulating result the readers below fill in, mutating it in place so each stays a small,
 * single-purpose step. It's the same shape as `ParsedReturn` (which `extract1040Fields` returns
 * directly), aliased here to name the mutable accumulator the readers write into.
 */
type Draft = ParsedReturn;

function setFieldAndSource(draft: Draft, field: IncomeSource, value: number, source: string): void {
  draft.fields[field] = value;
  draft.provenance[field] = source;
  ilog(`matched ${field} = ${value} (${source})`);
}

/**
 * The line ids that can print on a *shared row* with another income field, passed as segment
 * boundaries so one line's amount can't bleed into a neighbor's (see `lineSegment`). Two clusters
 * do this: the dividends pair `3a`/`3b` (which print two to a row) and the IRA/pension group
 * `4b`/`4c`/`4d` (the 2019 form merges `4b`'s gross/taxable columns onto one baseline). Every other
 * income line sits alone on its row, so it needs no boundary and isn't listed — a read id is dropped
 * from its own bounds by `amountForId` anyway, so an id earns a place here only by abutting a *different*
 * field.
 */
const SHARED_LINE_IDS: string[] = ['3a', '3b', '4b', '4c', '4d'];

/** The amount for a page-1 income line id, passing the ids that can share a row (see `SHARED_LINE_IDS`)
 * as boundaries so a neighbor's amount can't bleed into this one's. */
function incomeAmount(faceRows: Row[], id: string): number | null {
  const value = amountForId(faceRows, id, SHARED_LINE_IDS);
  ilog(`line ${id}: -> ${value}`);
  return value;
}

/** The line id a drifting field sits on for the detected year, or null if the year is unknown/pre-window. */
function lineIdFor(field: DriftingField, year: number | null): string | null {
  return year === null ? null : lineIdForYear(field, year);
}

/** Warn when an id read and its label cross-check disagree (we keep the id value; ask the user to
 *  verify). Called only for the drift-prone fields, where the printed label is a stable second opinion. */
function warnOnMismatch(draft: Draft, description: string, id: string, idValue: number, labelValue: number): void {
  if (labelValue === idValue) return;
  draft.warnings.push(
    `The ${description} on line ${id} (${formatCurrency(idValue)}) doesn't match the labeled amount (${formatCurrency(labelValue)}). Using line ${id}; please verify.`,
  );
}

// ── Income readers ──────────────────────────────────────────────────────────────────────────
// Where each value is read comes from fieldLocations.ts: STABLE_FIELD_IDS for fields on a
// never-drifting line id, and the per-year DRIFTING_FIELD_IDS map for the movers. Given a detected
// year, a drifting field is read by that year's exact id; when the year is undetected or older than
// the mapped window (or an id read is empty) it falls back to the stable printed label. For the
// drift-prone fields we also cross-check the id read against the label and warn on disagreement.
// Composite fields (dividends, retirement, capital gains) combine reads. Each reader mutates `draft`.

function readInterest(faceRows: Row[], draft: Draft): void {
  const id = STABLE_FIELD_IDS.interest;
  const value = incomeAmount(faceRows, id);
  if (value !== null) setFieldAndSource(draft, 'interest', value, `1040 line ${id}`);
}

function readDividends(faceRows: Row[], draft: Draft): void {
  const qualified = incomeAmount(faceRows, STABLE_FIELD_IDS.qualifiedDividends);
  if (qualified !== null) {
    setFieldAndSource(draft, 'qualifiedDividends', qualified, `1040 line ${STABLE_FIELD_IDS.qualifiedDividends}`);
  }

  const ordinary = incomeAmount(faceRows, STABLE_FIELD_IDS.ordinaryDividends);
  if (ordinary !== null) {
    const nonQual = ordinary - (qualified ?? 0);
    if (nonQual < 0) {
      draft.warnings.push('Qualified dividends exceeded ordinary dividends — non-qualified set to $0.');
    }
    setFieldAndSource(draft, 'nonQualifiedDividends', Math.max(0, nonQual), '1040 line 3b − 3a');
  }
}

function readWages(faceRows: Row[], draft: Draft, year: number | null): void {
  // Wages total: line 1z (2022+, "Add lines 1a through 1h") or bare line 1 (2019–2021), read by the
  // year's id when we know it.
  const id = lineIdFor('wages', year);
  if (id) {
    const byId = incomeAmount(faceRows, id);
    if (byId !== null) {
      setFieldAndSource(draft, 'wages', byId, `1040 line ${id}`);
      return;
    }
  }
  // The id read came up empty (or the year is unknown). Fall back to the wages total on its modern
  // (newest-mapped) line — its meaning is stable across recent years, so it's safe to try without a
  // year — unless that's the id we just tried. This still recovers wages on a recent form whose year
  // was missed or misdetected. The specific line (`1z` today) lives in the field map, not here.
  const modernWagesLineId = currentLineId('wages');
  if (id !== modernWagesLineId) {
    const modernWagesTotal = incomeAmount(faceRows, modernWagesLineId);
    if (modernWagesTotal !== null) {
      setFieldAndSource(draft, 'wages', modernWagesTotal, `1040 line ${modernWagesLineId}`);
      return;
    }
  }
  // Last resort: the stable single-line-1 label (2019–2021 forms), a lower-confidence read flagged
  // `assumed`.
  const byLabel = amountForLabel(faceRows, 'wages, salaries, tips');
  if (byLabel !== null) {
    setFieldAndSource(draft, 'wages', byLabel.value, `1040 line ${byLabel.lineId || 1} (wages, salaries, tips)`);
    draft.assumed.wages = true;
  }
}

function readRetirement(faceRows: Row[], draft: Draft, year: number | null): void {
  // Retirement = taxable IRA + taxable pensions. IRA is stable line 4b. The taxable-pensions line
  // drifts (4d in 2019, 5b in 2020+) — and "5b" is *Social Security* on the 2019 form — so reading
  // it by the year's id reads the right cell and sidesteps that trap by construction.
  const ira = incomeAmount(faceRows, STABLE_FIELD_IDS.iraDistributions);
  const pensions = readPensions(faceRows, draft, year);
  if (ira !== null || pensions !== null) {
    setFieldAndSource(
      draft,
      'retirementIncome',
      (ira ?? 0) + (pensions ?? 0),
      `1040 taxable IRA (${STABLE_FIELD_IDS.iraDistributions}) + pensions`,
    );
  }
}

/** Taxable pensions for the year: by the located id, cross-checked against (and falling back to) the
 *  "Pensions and annuities" / "Taxable amount" label. Returns the dollar amount or null. */
function readPensions(faceRows: Row[], draft: Draft, year: number | null): number | null {
  const byLabel = pensionsByLabel(faceRows);
  const id = lineIdFor('pensions', year);
  if (id) {
    const byId = incomeAmount(faceRows, id);
    if (byId !== null) {
      if (byLabel !== null) warnOnMismatch(draft, 'taxable pensions', id, byId, byLabel);
      return byId;
    }
  }
  return byLabel;
}

/** The taxable pensions amount located by label. The gross ("c Pensions and annuities") and taxable
 *  ("d Taxable amount") sub-lines usually merge into one row but may split across two adjacent ones;
 *  prefer a "Taxable amount" match in the row after the gross line, else the gross line's own row. */
function pensionsByLabel(faceRows: Row[]): number | null {
  const idx = faceRows.findIndex((r) => r.text.toLowerCase().includes('pensions and annuities'));
  const window = idx === -1 ? [] : faceRows.slice(idx, idx + 2);
  const hit = amountForLabel(window, 'taxable amount') ?? amountForLabel(window, 'pensions and annuities');
  return hit?.value ?? null;
}

function readCapitalGains(rows: Row[], faceRows: Row[], draft: Draft, year: number | null): void {
  // Capital gains: prefer Schedule D for a real short/long-term split; fall back to the single 1040
  // capital-gain line (assumed long-term) when it isn't attached. Losses keep their real sign; the
  // engine nets short- against long-term and applies up to $3,000 of a net loss against other income
  // (see nettedCapitalGains), so a loss is meaningful, not zeroed.
  const setCapitalGain = (field: 'shortTermGains' | 'longTermGains', value: number, source: string, label: string) => {
    if (value < 0) {
      draft.warnings.push(
        `Schedule D shows a net ${label} capital loss of $${Math.abs(value).toLocaleString()}. It's shown below as a negative and netted against your gains; up to $3,000 of a net loss ($1,500 if married filing separately) offsets other income.`,
      );
    }
    setFieldAndSource(draft, field, value, source);
  };

  // Locate Schedule D by its "SCHEDULE D (Form 1040)" header, anywhere in the return (the read is
  // position-independent — Schedule D need not physically follow the face), rather than the loose
  // "Capital Gains and Losses" title a supplement/instructions page could also carry.
  const schedDPage = rows.find((r) => SCHEDULE_D_HEADER.test(r.text))?.page ?? null;
  const schedDRows = schedDPage !== null ? rows.filter((r) => r.page === schedDPage) : [];
  const shortTerm = schedDPage !== null ? amountForId(schedDRows, '7', ['7', '15']) : null;
  const longTerm = schedDPage !== null ? amountForId(schedDRows, '15', ['7', '15']) : null;
  if (shortTerm !== null || longTerm !== null) {
    ilog(`Schedule D (page ${schedDPage}): line 7 short-term ${shortTerm}, line 15 long-term ${longTerm}`);
    if (shortTerm !== null)
      setCapitalGain('shortTermGains', shortTerm, 'Schedule D line 7 (net short-term)', 'short-term');
    if (longTerm !== null) setCapitalGain('longTermGains', longTerm, 'Schedule D line 15 (net long-term)', 'long-term');
    return;
  }

  // No Schedule D — the single 1040 capital-gain line (id drifts: 6 in 2019, 7 in 2020–2024, 7a in
  // 2025). Read by the year's id; cross-check against, and fall back to, the "Capital gain or (loss)"
  // label. It can't be split short/long, so it's always an assumed long-term value pending review.
  const byLabel = amountForLabel(faceRows, 'capital gain or (loss)');
  const id = lineIdFor('capitalGain', year);
  let value: number | null = null;
  let lineRef = '';
  if (id) {
    const byId = incomeAmount(faceRows, id);
    if (byId !== null) {
      if (byLabel !== null) warnOnMismatch(draft, 'capital gain', id, byId, byLabel.value);
      value = byId;
      lineRef = `1040 line ${id}`;
    }
  }
  if (value === null && byLabel !== null) {
    value = byLabel.value;
    lineRef = `1040 line ${byLabel.lineId || 'capital gain'}`;
  }
  if (value === null) return;

  draft.assumed.longTermGains = true;
  if (value < 0) {
    setFieldAndSource(draft, 'longTermGains', value, `${lineRef} (capital gain or loss)`);
    draft.warnings.push(
      `The 1040 capital-gain line is a loss of $${Math.abs(value).toLocaleString()}. It's shown below as a negative and netted against your gains; up to $3,000 of a net loss ($1,500 if married filing separately) offsets other income.`,
    );
  } else {
    setFieldAndSource(draft, 'longTermGains', value, `${lineRef} (assumed long-term)`);
    draft.warnings.push(
      'Capital gains from the 1040 were treated as long-term (no Schedule D found to split them). Adjust below if some were short-term.',
    );
  }
}

function readDeduction(faceRows: Row[], draft: Draft, year: number | null): void {
  // Deduction ("Standard deduction or itemized deductions"): the id drifts — line 9 (2019), 12 (2020,
  // 2022–2024), 12a (2021), and 12e on the 2025 redesign, which also moved it to page 2. `faceRows`
  // already spans the 1040's two pages, so the first occurrence of the year's id finds it wherever it
  // landed — no page bookkeeping needed. Cross-check against, and fall back to, the printed label
  // across the same rows. The label is distinct from the left-margin "Standard Deduction for—"
  // heading, so that won't false-match.
  const byLabel = amountForLabel(faceRows, 'standard deduction or itemized deductions');

  const id = lineIdFor('deduction', year);
  let value: number | null = null;
  let lineRef = '';
  if (id) {
    // The deduction line sits alone on its row, so it needs no sibling boundary ids.
    const byId = amountForId(faceRows, id);
    if (byId !== null) {
      if (byLabel !== null) warnOnMismatch(draft, 'deduction', id, byId, byLabel.value);
      value = byId;
      lineRef = `1040 line ${id}`;
    }
  }
  if (value === null && byLabel !== null) {
    value = byLabel.value;
    lineRef = `1040 line ${byLabel.lineId || 'deduction'}`;
  }
  if (value === null) return;

  // Validate the amount through the same predicate as every other input boundary (finite ≥ 0, else
  // null). If it matches the standard deduction for the detected year/status we stay in standard mode
  // (null); otherwise the filer itemized, so we import the number as custom. `provenance.deduction`
  // reports only *where* the value came from — whether it's an itemized amount is a property of the
  // value, derived fresh by the review UI from the live draft, not baked in here.
  const coerced = coerceDeduction(value);
  if (coerced === null) return;
  const detectedYear = draft.fields.taxYear;
  const detectedStatus = draft.fields.filingStatus;
  const tableStandard =
    detectedYear && isTaxYear(detectedYear) && detectedStatus
      ? taxTablesFor(detectedYear).standardDeduction[detectedStatus]
      : null;
  draft.fields.deduction = tableStandard !== null && coerced === tableStandard ? null : coerced;
  draft.provenance.deduction = lineRef;
  ilog(`deduction from ${lineRef}: ${coerced} -> ${String(draft.fields.deduction)}`);
}

/**
 * Detect the filing status and tax year from the face, recording provenance and any warnings.
 * Returns the raw detected year (a `20xx` on the form, whether or not the app has tax tables for it)
 * so the income readers can resolve per-year line ids; `fields.taxYear` is set only for a year the
 * app actually supports (`isTaxYear`).
 */
function detectHeader(faceRows: Row[], draft: Draft): number | null {
  // "Couldn't detect" for filing status / tax year is surfaced inline under those controls in the
  // review UI (from the absence of a provenance entry), so no warning for a plain miss here.
  const filingStatus = detectFilingStatus(faceRows);
  if (filingStatus) {
    draft.fields.filingStatus = filingStatus;
    draft.provenance.filingStatus = '1040 filing-status checkbox';
    ilog(`matched filingStatus = ${filingStatus}`);
  }

  const taxYear = detectTaxYear(faceRows);
  if (taxYear !== null && isTaxYear(taxYear)) {
    draft.fields.taxYear = taxYear;
    draft.provenance.taxYear = '1040 form header';
    ilog(`matched taxYear = ${taxYear}`);
  } else if (taxYear !== null) {
    draft.warnings.push(`Detected tax year ${taxYear} isn't supported yet — please choose it below.`);
  }

  // The per-year id map starts at EARLIEST_MAPPED_YEAR. An older form may be numbered/labeled
  // differently enough that values land in the wrong field, so flag it (reads fall back to
  // label-anchoring for it).
  if (taxYear !== null && taxYear < EARLIEST_MAPPED_YEAR) {
    draft.warnings.push(
      `This looks like a ${taxYear} return — older than the ${EARLIEST_MAPPED_YEAR} layout this importer was built against. Double-check every value below.`,
    );
  }
  return taxYear;
}

/**
 * Map a positioned-text dump of a Form 1040 onto the app's income fields. Pure and
 * best-effort: it fills what it can find, records where each value came from, and
 * warns about anything the user must confirm or that the 1040 face can't express
 * (short vs. long-term split, capital losses). Undetected fields are simply omitted.
 */
export function extract1040Fields(items: TextItem[]): ParsedReturn {
  const rows = groupRows(items);
  ilog(`grouped ${items.length} text items into ${rows.length} rows`);

  const draft: Draft = { fields: {}, provenance: {}, assumed: {}, warnings: [] };

  // Scope the face lines to the 1040 face's own pages — from the face page up to (not including) the
  // next schedule — so a stray "7" on Schedule 2 (or a repeated line number deep in the return) can't
  // be mistaken for a 1040 value. Spanning every face page (not a fixed count) lets a field found by
  // first occurrence land wherever its line drifted to — e.g. the 2025 deduction on page 2 — and stays
  // correct if the face ever grows past two pages, all without per-field page bookkeeping.
  const facePage = pageContaining(rows, FACE_MARKERS[0]) ?? pageContaining(rows, FACE_MARKERS[1]) ?? 1;
  const lastFacePage = faceEndPage(rows, facePage);
  const faceRows = rows.filter((r) => r.page >= facePage && r.page <= lastFacePage);
  ilog(`reading 1040 face on pages ${facePage}–${lastFacePage}`);

  // Detect the year first: it selects which line ids the income readers use.
  setImportStep('detect');
  const year = detectHeader(faceRows, draft);

  setImportStep('match');
  readWages(faceRows, draft, year);
  readInterest(faceRows, draft);
  readDividends(faceRows, draft);
  readRetirement(faceRows, draft, year);
  readCapitalGains(rows, faceRows, draft, year);
  readDeduction(faceRows, draft, year);

  const foundIncome = ALL_SOURCES.some((source) => draft.fields[source] !== undefined);
  if (!foundIncome) {
    draft.warnings.unshift(
      "Couldn't read any income values from this PDF. It may be a scanned image (not yet supported) or an unexpected layout.",
    );
  }

  setImportStep('result');
  ilog('final fields', draft.fields);
  ilog('warnings', draft.warnings);
  ilog('assumed', draft.assumed);
  setImportStep('');
  return draft;
}
