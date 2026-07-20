import { ALL_SOURCES, coerceDeduction, type IncomeSource } from '../tax/types';
import { isTaxYear, taxTablesFor } from '../tax/years';
import type { ParsedReturn } from './parsedReturn';
import { ilog, setImportStep } from './importLog';
import { groupRows, type Row, type TextItem } from './rows';
import { amountForLabel, amountForId, pageContaining } from './lineLookup';
import { detectFilingStatus, detectTaxYear } from './detect';

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
 * Boundary ids for page-1 income segments, so one line's amount can't bleed into a sibling's
 * (see `lineSegment`). Only the fields read *by id* need boundaries — wages `1z`, the stable
 * `2b`/`3a`/`3b`, and IRA `4b` — so this is those ids plus the sibling ids that can abut them:
 * `5b`/`7a` (the lines just past `4b`) and `4c`/`4d` (the gross/taxable pension columns that merge
 * onto `4b`'s baseline on the 2019 form, which must end `4b`'s segment before the pension amounts).
 * The fully-drifting fields — older wages `1`, capital gain `6`/`7`/`7a`, pensions — are read by
 * their printed *label*, never by id, so their drifting ids need not appear here.
 */
const SEGMENT_BOUNDARY_IDS: string[] = ['1z', '2b', '3a', '3b', '4b', '4c', '4d', '5b', '7a'];

/** The amount for a page-1 income line id, using the shared segment-boundary ids (see
 * `SEGMENT_BOUNDARY_IDS`) so a sibling line's amount can't bleed into this one's. */
function incomeAmount(faceRows: Row[], id: string): number | null {
  const value = amountForId(faceRows, id, SEGMENT_BOUNDARY_IDS);
  ilog(`line ${id}: -> ${value}`);
  return value;
}

// ── Income readers ──────────────────────────────────────────────────────────────────────────
// `STABLE_ID_FIELDS` holds the plain reads: a field on a stable line id with nothing else to do.
// Everything else gets its own reader below, either because its id drifts year to year and must be
// found by printed label (wages fallback, pensions, the 1040 capital-gain fallback) or because it
// needs extra logic on top of a stable id (dividends derive non-qualified = 3b − 3a; retirement
// sums IRA 4b with pensions). Each reader mutates `draft`.

/** Fields whose line id is stable across the whole supported window — read directly by id. */
const STABLE_ID_FIELDS: { source: IncomeSource; id: string; provenance: string }[] = [
  { source: 'interest', id: '2b', provenance: '1040 line 2b' },
];

function readStableIdFields(faceRows: Row[], draft: Draft): void {
  for (const field of STABLE_ID_FIELDS) {
    const value = incomeAmount(faceRows, field.id);
    if (value !== null) setFieldAndSource(draft, field.source, value, field.provenance);
  }
}

function readWages(faceRows: Row[], draft: Draft): void {
  // Wages total: line 1z (2022+, "Add lines 1a through 1h"). Older forms (2019–2021) have no
  // 1z — the total is bare line 1 "Wages, salaries, tips, etc.", located by its stable label.
  const wages1z = incomeAmount(faceRows, '1z');
  if (wages1z !== null) {
    setFieldAndSource(draft, 'wages', wages1z, '1040 line 1z');
    return;
  }
  const wagesOld = amountForLabel(faceRows, 'wages, salaries, tips');
  if (wagesOld !== null) {
    setFieldAndSource(draft, 'wages', wagesOld.value, `1040 line ${wagesOld.lineId || 1} (wages, salaries, tips)`);
    draft.assumed.wages = true; // older single-line-1 layout — flag for verification
  }
}

function readDividends(faceRows: Row[], draft: Draft): void {
  const qualified = incomeAmount(faceRows, '3a');
  if (qualified !== null) setFieldAndSource(draft, 'qualifiedDividends', qualified, '1040 line 3a');

  const ordinaryDiv = incomeAmount(faceRows, '3b');
  if (ordinaryDiv !== null) {
    const nonQual = ordinaryDiv - (qualified ?? 0);
    if (nonQual < 0) {
      draft.warnings.push('Qualified dividends exceeded ordinary dividends — non-qualified set to $0.');
    }
    setFieldAndSource(draft, 'nonQualifiedDividends', Math.max(0, nonQual), '1040 line 3b − 3a');
  }
}

function readRetirement(faceRows: Row[], draft: Draft): void {
  // Retirement = taxable IRA + taxable pensions. IRA is line 4b every year, but the pensions
  // taxable line drifts (4d in 2019, 5b in 2020+) — and worse, "5b" is *Social Security* on the
  // 2019 form, so a fixed 4b+5b sum reads SS as pensions there. Locate pensions by its stable
  // "Pensions and annuities" label instead, and read its taxable (rightmost/b) cell.
  // 4b's segment already ends at 4c/4d/5b (they're in SEGMENT_BOUNDARY_IDS), so a 2019 merged 4b/4c/4d row
  // (gross vs. taxable columns on one baseline) can't bleed 4d's amount into 4b's read.
  const ira = incomeAmount(faceRows, '4b');
  // The gross sub-line ("c Pensions and annuities") and taxable sub-line ("d Taxable amount")
  // usually merge into one row, but may land on two adjacent ones instead. Prefer a "Taxable
  // amount" match in the row right after the gross line so a split layout can't read the untaxed
  // gross amount as taxable pension income; fall back to the gross line's own row otherwise.
  const pensionsIdx = faceRows.findIndex((r) => r.text.toLowerCase().includes('pensions and annuities'));
  const pensionsWindow = pensionsIdx === -1 ? [] : faceRows.slice(pensionsIdx, pensionsIdx + 2);
  const pensions =
    amountForLabel(pensionsWindow, 'taxable amount') ?? amountForLabel(pensionsWindow, 'pensions and annuities');
  if (ira !== null || pensions !== null) {
    setFieldAndSource(
      draft,
      'retirementIncome',
      (ira ?? 0) + (pensions?.value ?? 0),
      '1040 taxable IRA (4b) + pensions (Pensions and annuities)',
    );
  }
}

function readCapitalGains(rows: Row[], faceRows: Row[], draft: Draft): void {
  // Capital gains: prefer Schedule D for a real short/long-term split; fall back to the 1040
  // capital-gain line (assumed long-term) when it isn't attached. Losses keep their real sign;
  // the engine nets short- against long-term and applies up to $3,000 of a net loss against other
  // income (see nettedCapitalGains), so a loss is meaningful, not zeroed.
  const setCapitalGain = (field: 'shortTermGains' | 'longTermGains', value: number, source: string, label: string) => {
    if (value < 0) {
      draft.warnings.push(
        `Schedule D shows a net ${label} capital loss of $${Math.abs(value).toLocaleString()}. It's shown below as a negative and netted against your gains; up to $3,000 of a net loss ($1,500 if married filing separately) offsets other income.`,
      );
    }
    setFieldAndSource(draft, field, value, source);
  };

  const schedDPage = pageContaining(rows, 'capital gains and losses');
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

  // No Schedule D — fall back to the 1040 capital-gain line, located by its stable label
  // ("Capital gain or (loss)") since its number drifts (6 in 2019, 7 in 2020–2024, 7a in 2025).
  // It can't be split short/long, so it's always an assumed long-term value pending review.
  const capitalGain = amountForLabel(faceRows, 'capital gain or (loss)');
  if (capitalGain !== null && capitalGain.value < 0) {
    setFieldAndSource(
      draft,
      'longTermGains',
      capitalGain.value,
      `1040 line ${capitalGain.lineId || 'capital gain'} (capital gain or loss)`,
    );
    draft.assumed.longTermGains = true;
    draft.warnings.push(
      `The 1040 capital-gain line is a loss of $${Math.abs(capitalGain.value).toLocaleString()}. It's shown below as a negative and netted against your gains; up to $3,000 of a net loss ($1,500 if married filing separately) offsets other income.`,
    );
  } else if (capitalGain !== null) {
    setFieldAndSource(
      draft,
      'longTermGains',
      capitalGain.value,
      `1040 line ${capitalGain.lineId || 'capital gain'} (assumed long-term)`,
    );
    draft.assumed.longTermGains = true;
    draft.warnings.push(
      'Capital gains from the 1040 were treated as long-term (no Schedule D found to split them). Adjust below if some were short-term.',
    );
  }
}

function readDeduction(rows: Row[], facePage: number, draft: Draft): void {
  // Deduction: "Standard deduction or itemized deductions (from Schedule A)". Located by label,
  // not number, because both the id and the page drift — line 9 (2019), 12 (2020, 2022–2024),
  // 12a (2021), and 12e on page 2 of the 2025 redesign (the expanded income section pushed AGI to
  // 11a and the deduction onto page 2). The label finds it on either face page; it's distinct
  // from the left-margin "Standard Deduction for—" heading, so that won't false-match.
  const deductionRows = rows.filter((r) => r.page === facePage || r.page === facePage + 1);
  const deductionHit = amountForLabel(deductionRows, 'standard deduction or itemized deductions');
  if (deductionHit === null) return;

  // Validate the parsed amount through the same predicate as every other input boundary
  // (a finite number ≥ 0, else null). If it matches the standard deduction for the detected
  // year/status we stay in standard mode (null); otherwise the filer itemized, so we import
  // the number as custom. `provenance.deduction` reports only *where* the value came from —
  // whether it's an itemized amount is a property of the value, derived fresh by the review
  // UI from the live draft, not baked in here (a filer can still edit the amount afterward).
  const coercedDeduction = coerceDeduction(deductionHit.value);
  if (coercedDeduction === null) return;
  const lineRef = `1040 line ${deductionHit.lineId || 'deduction'}`;
  const detectedYear = draft.fields.taxYear;
  const detectedStatus = draft.fields.filingStatus;
  const tableStandard =
    detectedYear && isTaxYear(detectedYear) && detectedStatus
      ? taxTablesFor(detectedYear).standardDeduction[detectedStatus]
      : null;
  draft.fields.deduction = tableStandard !== null && coercedDeduction === tableStandard ? null : coercedDeduction;
  draft.provenance.deduction = lineRef;
  ilog(`deduction from ${lineRef}: ${coercedDeduction} -> ${String(draft.fields.deduction)}`);
}

/** Detect the filing status and tax year from the face, recording provenance and any warnings. */
function detectHeader(faceRows: Row[], draft: Draft): void {
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

  // The label-anchored reads were built against the 2019–2025 layouts. An older form may be
  // numbered/labeled differently enough that values land in the wrong field, so flag it.
  if (taxYear !== null && taxYear < 2019) {
    draft.warnings.push(
      `This looks like a ${taxYear} return — older than the 2019 layout this importer was built against. Double-check every value below.`,
    );
  }
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

  // Scope the face lines to the 1040's own page, so a stray "7" on Schedule 2 (or a
  // repeated line number deep in the return) can't be mistaken for a 1040 value.
  setImportStep('match');
  const facePage = pageContaining(rows, 'u.s. individual income tax return') ?? pageContaining(rows, 'form 1040') ?? 1;
  const faceRows = rows.filter((r) => r.page === facePage);
  ilog(`reading 1040 face on page ${facePage}`);

  readWages(faceRows, draft);
  readStableIdFields(faceRows, draft);
  readDividends(faceRows, draft);
  readRetirement(faceRows, draft);
  readCapitalGains(rows, faceRows, draft);

  setImportStep('detect');
  detectHeader(faceRows, draft);

  // Deduction runs after detection: whether the parsed amount reads as "standard" (null) depends
  // on the detected year + filing status.
  readDeduction(rows, facePage, draft);

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
