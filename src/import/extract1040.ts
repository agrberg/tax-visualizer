import { ALL_SOURCES, coerceDeduction, type IncomeSource } from '../tax/types';
import { isTaxYear, taxTablesFor } from '../tax/years';
import { formatCurrency } from '../tax/format';
import type { ParsedReturn } from './parsedReturn';
import { ilog, setImportStep } from './importLog';
import type { TextItem } from './rows';
import { Form1040 } from './form1040';
import {
  STABLE_FIELD_IDS,
  lineIdForYear,
  currentLineId,
  EARLIEST_MAPPED_YEAR,
  type DriftingField,
} from './fieldLocations';

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
 * The line ids that can print on a *shared row* with a neighbor, passed as segment boundaries so one
 * line's amount can't bleed into another's (see `lineSegment`). Three clusters do this: the dividends
 * pair `3a`/`3b` (two to a row), the IRA/pension group `4b`/`4c`/`4d` (the 2019 form merges `4b`'s
 * gross/taxable columns onto one baseline), and the line-12 deduction family `12a`/`12b`/`12c` (2021:
 * deduction / charitable / add — verified against the IRS 2021 Form 1040). Every other line sits alone
 * on its row, so it needs no boundary and isn't listed — a read id is dropped from its own bounds by
 * `amountForId` anyway, so an id earns a place here only by abutting a *different* line.
 */
const SHARED_LINE_IDS: string[] = ['3a', '3b', '4b', '4c', '4d', '12a', '12b', '12c'];

/** The line id a drifting field sits on for the detected year, or null if the year is unknown/pre-window. */
function lineIdFor(field: DriftingField, year: number | null): string | null {
  return year === null ? null : lineIdForYear(field, year);
}

/** Warn when an id read and its label cross-check disagree (we keep the id value; ask the user to
 *  verify). Called for every field whose printed label names the same cell as its id — a stable
 *  second opinion — i.e. all but wages and IRA (whose label names a different cell). */
function warnOnMismatch(draft: Draft, description: string, id: string, idValue: number, labelValue: number): void {
  if (labelValue === idValue) return;
  draft.warnings.push(
    `The ${description} on line ${id} (${formatCurrency(idValue)}) doesn't match the labeled amount (${formatCurrency(labelValue)}). Using line ${id}; please verify.`,
  );
}

/** A capital-loss warning: the caller's lead (which line, how much) plus the shared tail on how a net
 *  loss is treated — kept in one place so both the Schedule D and 1040-line reads word it identically. */
function netCapitalLossWarning(lead: string): string {
  return `${lead} It's shown below as a negative and netted against your gains; up to $3,000 of a net loss ($1,500 if married filing separately) offsets other income.`;
}

const ASSUMED_LONG_TERM_WARNING =
  'Capital gains from the 1040 were treated as long-term (no Schedule D found to split them). Adjust below if some were short-term.';

// ── Income readers ──────────────────────────────────────────────────────────────────────────
// Where each value is read comes from fieldLocations.ts: STABLE_FIELD_IDS for fields on a
// never-drifting line id, and the per-year DRIFTING_FIELD_IDS map for the movers. Given a detected
// year, a drifting field is read by that year's exact id; when the year is undetected or older than
// the mapped window (or an id read is empty) it falls back to the stable printed label. Most fields
// also cross-check the id read against that label (read in the same segment, so a shared row doesn't
// cross-wire) and warn on disagreement — the exceptions are wages and IRA, whose label names a
// different cell than the id (so the label is a last-resort fallback, not a second opinion). Composite
// fields (dividends, retirement, capital gains) combine reads. Each reader asks the `Form1040` for
// amounts and mutates `draft`.

function readInterest(form: Form1040, draft: Draft): void {
  const id = STABLE_FIELD_IDS.interest;
  const byId = form.amountForId(id, SHARED_LINE_IDS);
  if (byId === null) return;
  const byLabel = form.amountAndIdForLabelInSegment('taxable interest', SHARED_LINE_IDS, id);
  if (byLabel !== null) warnOnMismatch(draft, 'interest', id, byId, byLabel.value);
  setFieldAndSource(draft, 'interest', byId, `1040 line ${id}`);
}

function readDividends(form: Form1040, draft: Draft): void {
  const qualifiedId = STABLE_FIELD_IDS.qualifiedDividends;
  const qualified = form.amountForId(qualifiedId, SHARED_LINE_IDS);
  if (qualified !== null) {
    const byLabel = form.amountAndIdForLabelInSegment('qualified dividends', SHARED_LINE_IDS, qualifiedId);
    if (byLabel !== null) warnOnMismatch(draft, 'qualified dividends', qualifiedId, qualified, byLabel.value);
    setFieldAndSource(draft, 'qualifiedDividends', qualified, `1040 line ${qualifiedId}`);
  }

  const ordinaryId = STABLE_FIELD_IDS.ordinaryDividends;
  const ordinary = form.amountForId(ordinaryId, SHARED_LINE_IDS);
  if (ordinary !== null) {
    const byLabel = form.amountAndIdForLabelInSegment('ordinary dividends', SHARED_LINE_IDS, ordinaryId);
    if (byLabel !== null) warnOnMismatch(draft, 'ordinary dividends', ordinaryId, ordinary, byLabel.value);
    const nonQual = ordinary - (qualified ?? 0);
    if (nonQual < 0) {
      draft.warnings.push('Qualified dividends exceeded ordinary dividends — non-qualified set to $0.');
    }
    setFieldAndSource(draft, 'nonQualifiedDividends', Math.max(0, nonQual), '1040 line 3b − 3a');
  }
}

function readWages(form: Form1040, draft: Draft, year: number | null): void {
  // The wages *total* (not the 1a W-2 subset), read by the year's mapped id.
  const id = lineIdFor('wages', year);
  if (id) {
    const byId = form.amountForId(id, SHARED_LINE_IDS);
    if (byId !== null) {
      setFieldAndSource(draft, 'wages', byId, `1040 line ${id}`);
      return;
    }
  }
  // Id read empty or year unknown: recover the total on its modern (newest-mapped) line — its meaning
  // is stable across recent years — so a recent form whose year we missed still reads. Skip if that's
  // the id we already tried.
  const modernWagesLineId = currentLineId('wages');
  if (id !== modernWagesLineId) {
    const modernWagesTotal = form.amountForId(modernWagesLineId, SHARED_LINE_IDS);
    if (modernWagesTotal !== null) {
      setFieldAndSource(draft, 'wages', modernWagesTotal, `1040 line ${modernWagesLineId}`);
      return;
    }
  }
  // Last resort: the stable single-line-1 label (2019–2021 forms). Not a cross-check — the "wages,
  // salaries, tips" label is line 1a (the W-2 subset) on 2022+ forms, not the 1z total — so it's a
  // lower-confidence read flagged `assumed`.
  const byLabel = form.amountAndIdForLabel('wages, salaries, tips');
  if (byLabel !== null) {
    setFieldAndSource(draft, 'wages', byLabel.value, `1040 line ${byLabel.lineId || 1} (wages, salaries, tips)`);
    draft.assumed.wages = true;
  }
}

function readRetirement(form: Form1040, draft: Draft, year: number | null): void {
  // Retirement = taxable IRA + taxable pensions. IRA is stable line 4b (id only — its "IRA
  // distributions" label names the gross 4a, not the taxable 4b). The pensions line drifts, and "5b"
  // is *Social Security* on the 2019 form — reading pensions by the year's id reads the right cell and
  // sidesteps that trap by construction.
  const ira = form.amountForId(STABLE_FIELD_IDS.iraDistributions, SHARED_LINE_IDS);
  const pensions = readPensions(form, draft, year);
  if (ira !== null || pensions !== null) {
    setFieldAndSource(
      draft,
      'retirementIncome',
      (ira ?? 0) + (pensions ?? 0),
      `1040 taxable IRA (${STABLE_FIELD_IDS.iraDistributions}) + pensions`,
    );
  }
}

/** Taxable pensions for the year. The gross ("Pensions and annuities") and taxable ("Taxable amount")
 *  sub-lines can split across two rows, so the label read is windowed to the pensions line and the one
 *  after it (see `amountAndIdForLabelNear`). Returns the amount or null. */
function readPensions(form: Form1040, draft: Draft, year: number | null): number | null {
  const byLabel = form.amountAndIdForLabelNear('pensions and annuities', 'taxable amount');
  const id = lineIdFor('pensions', year);
  if (id) {
    const byId = form.amountForId(id, SHARED_LINE_IDS);
    if (byId !== null) {
      if (byLabel !== null) warnOnMismatch(draft, 'taxable pensions', id, byId, byLabel.value);
      return byId;
    }
  }
  return byLabel?.value ?? null;
}

function readCapitalGains(form: Form1040, draft: Draft, year: number | null): void {
  // Capital gains: prefer Schedule D for a real short/long-term split; fall back to the single 1040
  // capital-gain line (assumed long-term) when it isn't attached. Losses keep their real sign; the
  // engine nets short- against long-term and applies up to $3,000 of a net loss against other income
  // (see nettedCapitalGains), so a loss is meaningful, not zeroed.
  const setCapitalGain = (field: 'shortTermGains' | 'longTermGains', value: number, source: string, label: string) => {
    if (value < 0) {
      draft.warnings.push(
        netCapitalLossWarning(`Schedule D shows a net ${label} capital loss of $${Math.abs(value).toLocaleString()}.`),
      );
    }
    setFieldAndSource(draft, field, value, source);
  };

  const shortTerm = form.scheduleD?.amountForId('7', ['7', '15']) ?? null;
  const longTerm = form.scheduleD?.amountForId('15', ['7', '15']) ?? null;
  if (shortTerm !== null || longTerm !== null) {
    ilog(`Schedule D: line 7 short-term ${shortTerm}, line 15 long-term ${longTerm}`);
    if (shortTerm !== null)
      setCapitalGain('shortTermGains', shortTerm, 'Schedule D line 7 (net short-term)', 'short-term');
    if (longTerm !== null) setCapitalGain('longTermGains', longTerm, 'Schedule D line 15 (net long-term)', 'long-term');
    return;
  }

  // No Schedule D — read the single 1040 capital-gain line by the year's id (fallback: the "Capital
  // gain or (loss)" label). It can't be split short/long, so it's always an assumed long-term value
  // pending review.
  const id = lineIdFor('capitalGain', year);
  const byLabel = form.amountAndIdForLabelInSegment('capital gain or (loss)', SHARED_LINE_IDS, id ?? undefined);
  let value: number | null = null;
  let lineRef = '';
  if (id) {
    const byId = form.amountForId(id, SHARED_LINE_IDS);
    if (byId !== null) {
      if (byLabel !== null) warnOnMismatch(draft, 'capital gain', id, byId, byLabel.value);
      value = byId;
      lineRef = `1040 line ${id}`;
    }
  }
  if (value === null) {
    if (byLabel === null) return;
    value = byLabel.value;
    lineRef = `1040 line ${byLabel.lineId || 'capital gain'}`;
  }

  draft.assumed.longTermGains = true;
  if (value < 0) {
    setFieldAndSource(draft, 'longTermGains', value, `${lineRef} (capital gain or loss)`);
    draft.warnings.push(
      netCapitalLossWarning(`The 1040 capital-gain line is a loss of $${Math.abs(value).toLocaleString()}.`),
    );
  } else {
    setFieldAndSource(draft, 'longTermGains', value, `${lineRef} (assumed long-term)`);
    draft.warnings.push(ASSUMED_LONG_TERM_WARNING);
  }
}

function readDeduction(form: Form1040, draft: Draft, year: number | null): void {
  // Deduction ("Standard deduction or itemized deductions"), read by the year's id. It can share a row
  // with its line-12 siblings, so the read is segment-bounded at those (SHARED_LINE_IDS) — a merged
  // 12a/12b/12c row stops at 12b rather than reading 12c's total — and the label cross-check is read in
  // the same segment, so the merged-row case reads 12a's amount, not 12c's. The label is distinct from
  // the left-margin "Standard Deduction for—" heading, so that won't false-match.
  const id = lineIdFor('deduction', year);
  const byLabel = form.amountAndIdForLabelInSegment(
    'standard deduction or itemized deductions',
    SHARED_LINE_IDS,
    id ?? undefined,
  );
  let value: number | null = null;
  let lineRef = '';
  if (id) {
    const byId = form.amountForId(id, SHARED_LINE_IDS);
    if (byId !== null) {
      if (byLabel !== null) warnOnMismatch(draft, 'deduction', id, byId, byLabel.value);
      value = byId;
      lineRef = `1040 line ${id}`;
    }
  }
  if (value === null) {
    if (byLabel === null) return;
    value = byLabel.value;
    lineRef = `1040 line ${byLabel.lineId || 'deduction'}`;
  }

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
function detectHeader(form: Form1040, draft: Draft): number | null {
  // "Couldn't detect" for filing status / tax year is surfaced inline under those controls in the
  // review UI (from the absence of a provenance entry), so no warning for a plain miss here.
  const filingStatus = form.filingStatus;
  if (filingStatus) {
    draft.fields.filingStatus = filingStatus;
    draft.provenance.filingStatus = '1040 filing-status checkbox';
    ilog(`matched filingStatus = ${filingStatus}`);
  }

  const taxYear = form.taxYear;
  if (taxYear === null) return null;

  if (isTaxYear(taxYear)) {
    draft.fields.taxYear = taxYear;
    draft.provenance.taxYear = '1040 form header';
    ilog(`matched taxYear = ${taxYear}`);
  } else if (taxYear < EARLIEST_MAPPED_YEAR) {
    // Below EARLIEST_MAPPED_YEAR the per-year field-id map has nothing for this year either, so
    // one combined warning replaces what would otherwise be two near-duplicate ones ("not
    // supported" + "older than the layout").
    draft.warnings.push(
      `Detected tax year ${taxYear} — older than the ${EARLIEST_MAPPED_YEAR} layout this importer was built against, and not a year this app computes tax for. Double-check every value below, then pick a supported year to see these figures under its brackets.`,
    );
  } else {
    draft.warnings.push(
      `Detected tax year ${taxYear}, which this app doesn't compute tax for yet. Pick a supported year below to see these figures under its brackets.`,
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
  const form = Form1040.from(items);

  const draft: Draft = { fields: {}, provenance: {}, assumed: {}, warnings: [] };

  // Detect the year first: it selects which line ids the income readers use.
  setImportStep('detect');
  const year = detectHeader(form, draft);

  setImportStep('match');
  readWages(form, draft, year);
  readInterest(form, draft);
  readDividends(form, draft);
  readRetirement(form, draft, year);
  readCapitalGains(form, draft, year);
  readDeduction(form, draft, year);

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
