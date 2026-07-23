import { ALL_SOURCES, coerceDeduction, type IncomeSource } from '../tax/types';
import { isSupportedTaxYear, taxTablesFor } from '../tax/years';
import { formatCurrency } from '../tax/format';
import type { ParsedReturn } from './parsedReturn';
import { ilog, setImportStep } from './importLog';
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
 * single-purpose step. It's the same shape as `ParsedReturn` (which `ReturnExtractor.extract` returns
 * directly), aliased here to name the mutable accumulator the readers write into.
 */
type Draft = ParsedReturn;

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

/** A capital-loss warning: the caller's lead (which line, how much) plus the shared tail on how a net
 *  loss is treated — kept in one place so both the Schedule D and 1040-line reads word it identically. */
function netCapitalLossWarning(lead: string): string {
  return `${lead} It's shown below as a negative and netted against your gains; up to $3,000 of a net loss ($1,500 if married filing separately) offsets other income.`;
}

const ASSUMED_LONG_TERM_WARNING =
  'Capital gains from the 1040 were treated as long-term (no Schedule D found to split them). Adjust below if some were short-term.';

/** A field read: the value, a human-facing provenance line ref, and whether it came only from the
 *  label (id unavailable) — the low-confidence path some fields flag `assumed`. */
interface FieldRead {
  value: number;
  lineRef: string;
  fromLabelOnly: boolean;
}

/**
 * Maps a positioned-text-derived `Form1040` onto the app's income fields. Pure and best-effort: it
 * fills what it can find, records where each value came from, and warns about anything the user must
 * confirm or that the 1040 face can't express (short vs. long-term split, capital losses). Undetected
 * fields are simply omitted.
 *
 * Where each value is read comes from fieldLocations.ts: STABLE_FIELD_IDS for fields on a
 * never-drifting line id, and the per-year DRIFTING_FIELD_IDS map for the movers. Given a detected
 * year, a drifting field is read by that year's exact id; when the year is undetected or older than
 * the mapped window (or an id read is empty) it falls back to the stable printed label. Most fields
 * also cross-check the id read against that label (read in the same segment, so a shared row doesn't
 * cross-wire) and warn on disagreement — the exceptions are wages and IRA, whose label names a
 * different cell than the id (so the label is a last-resort fallback, not a second opinion). Composite
 * fields (dividends, retirement, capital gains) combine reads.
 */
export class ReturnExtractor {
  private readonly form: Form1040;
  private year: number | null;
  private readonly draft: Draft = { fields: {}, provenance: {}, assumed: {}, warnings: [] };

  private constructor(form: Form1040) {
    this.form = form;
    this.year = null; // set in detectHeader()
  }

  static extract(form: Form1040): ParsedReturn {
    const extractor = new ReturnExtractor(form);
    setImportStep('detect');
    extractor.detectHeader();
    setImportStep('match');
    extractor.readWages();
    extractor.readInterest();
    extractor.readDividends();
    extractor.readRetirement();
    extractor.readCapitalGains();
    extractor.readDeduction();
    return extractor.finalize();
  }

  /**
   * Read a scalar field by the drifting/stable id for the detected year, cross-checking the same-segment
   * label and warning on disagreement, then falling back to the label when the id is unavailable. Returns
   * null when neither yields a value. `name` labels the field both in mismatch warnings and as the
   * provenance line-ref fallback when only the label matched (the two never differ at a call site).
   */
  private readIdWithLabelCheck(id: string | null, label: string, name: string): FieldRead | null {
    const byLabel = this.form.amountAndIdForLabel(label, {
      boundaries: SHARED_LINE_IDS,
      ownId: id ?? undefined,
    });
    if (id) {
      const byId = this.form.amountForId(id, SHARED_LINE_IDS);
      if (byId !== null) {
        if (byLabel !== null) this.warnOnMismatch(name, id, byId, byLabel.value);
        return { value: byId, lineRef: `1040 line ${id}`, fromLabelOnly: false };
      }
    }
    if (byLabel === null) return null;
    return { value: byLabel.value, lineRef: `1040 line ${byLabel.lineId || name}`, fromLabelOnly: true };
  }

  private setField(field: IncomeSource, value: number, source: string): void {
    this.draft.fields[field] = value;
    this.draft.provenance[field] = source;
    ilog(`matched ${field} = ${value} (${source})`);
  }

  /** Warn when an id read and its label cross-check disagree (we keep the id value; ask the user to
   *  verify). Called for every field whose printed label names the same cell as its id — a stable
   *  second opinion — i.e. all but wages and IRA (whose label names a different cell). */
  private warnOnMismatch(description: string, id: string, idValue: number, labelValue: number): void {
    if (labelValue === idValue) return;
    this.draft.warnings.push(
      `The ${description} on line ${id} (${formatCurrency(idValue)}) doesn't match the labeled amount (${formatCurrency(labelValue)}). Using line ${id}; please verify.`,
    );
  }

  private readInterest(): void {
    const read = this.readIdWithLabelCheck(STABLE_FIELD_IDS.interest, 'taxable interest', 'interest');
    if (read && !read.fromLabelOnly) this.setField('interest', read.value, read.lineRef);
  }

  private readDividends(): void {
    const qualifiedId = STABLE_FIELD_IDS.qualifiedDividends;
    const qualified = this.form.amountForId(qualifiedId, SHARED_LINE_IDS);
    if (qualified !== null) {
      const byLabel = this.form.amountAndIdForLabel('qualified dividends', {
        boundaries: SHARED_LINE_IDS,
        ownId: qualifiedId,
      });
      if (byLabel !== null) this.warnOnMismatch('qualified dividends', qualifiedId, qualified, byLabel.value);
      this.setField('qualifiedDividends', qualified, `1040 line ${qualifiedId}`);
    }

    const ordinaryId = STABLE_FIELD_IDS.ordinaryDividends;
    const ordinary = this.form.amountForId(ordinaryId, SHARED_LINE_IDS);
    if (ordinary !== null) {
      const byLabel = this.form.amountAndIdForLabel('ordinary dividends', {
        boundaries: SHARED_LINE_IDS,
        ownId: ordinaryId,
      });
      if (byLabel !== null) this.warnOnMismatch('ordinary dividends', ordinaryId, ordinary, byLabel.value);
      const nonQual = ordinary - (qualified ?? 0);
      if (nonQual < 0) {
        this.draft.warnings.push('Qualified dividends exceeded ordinary dividends — non-qualified set to $0.');
      }
      this.setField('nonQualifiedDividends', Math.max(0, nonQual), '1040 line 3b − 3a');
    }
  }

  private readWages(): void {
    // The wages *total* (not the 1a W-2 subset), read by the year's mapped id.
    const id = lineIdFor('wages', this.year);
    if (id) {
      const byId = this.form.amountForId(id, SHARED_LINE_IDS);
      if (byId !== null) {
        this.setField('wages', byId, `1040 line ${id}`);
        return;
      }
    }
    // Id read empty or year unknown: recover the total on its modern (newest-mapped) line — its meaning
    // is stable across recent years — so a recent form whose year we missed still reads. Skip if that's
    // the id we already tried.
    const modernWagesLineId = currentLineId('wages');
    if (id !== modernWagesLineId) {
      const modernWagesTotal = this.form.amountForId(modernWagesLineId, SHARED_LINE_IDS);
      if (modernWagesTotal !== null) {
        this.setField('wages', modernWagesTotal, `1040 line ${modernWagesLineId}`);
        return;
      }
    }
    // Last resort: the stable single-line-1 label (2019–2021 forms). Not a cross-check — the "wages,
    // salaries, tips" label is line 1a (the W-2 subset) on 2022+ forms, not the 1z total — so it's a
    // lower-confidence read flagged `assumed`.
    const byLabel = this.form.amountAndIdForLabel('wages, salaries, tips');
    if (byLabel !== null) {
      this.setField('wages', byLabel.value, `1040 line ${byLabel.lineId || 1} (wages, salaries, tips)`);
      this.draft.assumed.wages = true;
    }
  }

  private readRetirement(): void {
    // Retirement = taxable IRA + taxable pensions. IRA is stable line 4b (id only — its "IRA
    // distributions" label names the gross 4a, not the taxable 4b). The pensions line drifts, and "5b"
    // is *Social Security* on the 2019 form — reading pensions by the year's id reads the right cell and
    // sidesteps that trap by construction.
    const ira = this.form.amountForId(STABLE_FIELD_IDS.iraDistributions, SHARED_LINE_IDS);
    const pensions = this.readPensions();
    if (ira !== null || pensions !== null) {
      this.setField(
        'retirementIncome',
        (ira ?? 0) + (pensions ?? 0),
        `1040 taxable IRA (${STABLE_FIELD_IDS.iraDistributions}) + pensions`,
      );
    }
  }

  /** Taxable pensions for the year. The gross ("Pensions and annuities") and taxable ("Taxable amount")
   *  sub-lines can split across two rows, so the label read is windowed to the pensions line and the one
   *  after it (see `amountForLabelNear`). Returns the amount or null. */
  private readPensions(): number | null {
    const byLabel = this.form.amountForLabelNear('pensions and annuities', 'taxable amount');
    const id = lineIdFor('pensions', this.year);
    if (id) {
      const byId = this.form.amountForId(id, SHARED_LINE_IDS);
      if (byId !== null) {
        if (byLabel !== null) this.warnOnMismatch('taxable pensions', id, byId, byLabel.value);
        return byId;
      }
    }
    return byLabel?.value ?? null;
  }

  private readCapitalGains(): void {
    // Capital gains: prefer Schedule D for a real short/long-term split; fall back to the single 1040
    // capital-gain line (assumed long-term) when it isn't attached. Losses keep their real sign; the
    // engine nets short- against long-term and applies up to $3,000 of a net loss against other income
    // (see nettedCapitalGains), so a loss is meaningful, not zeroed.
    const setCapitalGain = (
      field: 'shortTermGains' | 'longTermGains',
      value: number,
      source: string,
      label: string,
    ) => {
      if (value < 0) {
        this.draft.warnings.push(
          netCapitalLossWarning(
            `Schedule D shows a net ${label} capital loss of $${Math.abs(value).toLocaleString()}.`,
          ),
        );
      }
      this.setField(field, value, source);
    };

    const shortTerm = this.form.scheduleD?.amountForId('7', ['7', '15']) ?? null;
    const longTerm = this.form.scheduleD?.amountForId('15', ['7', '15']) ?? null;
    if (shortTerm !== null || longTerm !== null) {
      ilog(`Schedule D: line 7 short-term ${shortTerm}, line 15 long-term ${longTerm}`);
      if (shortTerm !== null)
        setCapitalGain('shortTermGains', shortTerm, 'Schedule D line 7 (net short-term)', 'short-term');
      if (longTerm !== null)
        setCapitalGain('longTermGains', longTerm, 'Schedule D line 15 (net long-term)', 'long-term');
      return;
    }

    // No Schedule D — read the single 1040 capital-gain line by the year's id (fallback: the "Capital
    // gain or (loss)" label). It can't be split short/long, so it's always an assumed long-term value
    // pending review.
    const id = lineIdFor('capitalGain', this.year);
    const read = this.readIdWithLabelCheck(id, 'capital gain or (loss)', 'capital gain');
    if (read === null) return;

    this.draft.assumed.longTermGains = true;
    if (read.value < 0) {
      this.setField('longTermGains', read.value, `${read.lineRef} (capital gain or loss)`);
      this.draft.warnings.push(
        netCapitalLossWarning(`The 1040 capital-gain line is a loss of $${Math.abs(read.value).toLocaleString()}.`),
      );
    } else {
      this.setField('longTermGains', read.value, `${read.lineRef} (assumed long-term)`);
      this.draft.warnings.push(ASSUMED_LONG_TERM_WARNING);
    }
  }

  private readDeduction(): void {
    // Deduction ("Standard deduction or itemized deductions"), read by the year's id. It can share a row
    // with its line-12 siblings, so the read is segment-bounded at those (SHARED_LINE_IDS) — a merged
    // 12a/12b/12c row stops at 12b rather than reading 12c's total — and the label cross-check is read in
    // the same segment, so the merged-row case reads 12a's amount, not 12c's. The label is distinct from
    // the left-margin "Standard Deduction for—" heading, so that won't false-match.
    const id = lineIdFor('deduction', this.year);
    const read = this.readIdWithLabelCheck(id, 'standard deduction or itemized deductions', 'deduction');
    if (read === null) return;

    // Validate the amount through the same predicate as every other input boundary (finite ≥ 0, else
    // null). If it matches the standard deduction for the detected year/status we stay in standard mode
    // (null); otherwise the filer itemized, so we import the number as custom. `provenance.deduction`
    // reports only *where* the value came from — whether it's an itemized amount is a property of the
    // value, derived fresh by the review UI from the live draft, not baked in here.
    const coerced = coerceDeduction(read.value);
    if (coerced === null) return;
    const detectedYear = this.draft.fields.taxYear;
    const detectedStatus = this.draft.fields.filingStatus;
    const tableStandard =
      detectedYear && isSupportedTaxYear(detectedYear) && detectedStatus
        ? taxTablesFor(detectedYear).standardDeduction[detectedStatus]
        : null;
    this.draft.fields.deduction = tableStandard !== null && coerced === tableStandard ? null : coerced;
    this.draft.provenance.deduction = read.lineRef;
    ilog(`deduction from ${read.lineRef}: ${coerced} -> ${String(this.draft.fields.deduction)}`);
  }

  /**
   * Detect the filing status and tax year from the face, recording provenance and any warnings, and
   * remember the raw detected year (a `20xx` on the form, whether or not the app has tax tables for it)
   * so the income readers can resolve per-year line ids; `fields.taxYear` is set only for a year the
   * app actually supports (`isSupportedTaxYear`).
   */
  private detectHeader(): void {
    // "Couldn't detect" for filing status / tax year is surfaced inline under those controls in the
    // review UI (from the absence of a provenance entry), so no warning for a plain miss here.
    const filingStatus = this.form.filingStatus;
    if (filingStatus) {
      this.draft.fields.filingStatus = filingStatus;
      this.draft.provenance.filingStatus = '1040 filing-status checkbox';
      ilog(`matched filingStatus = ${filingStatus}`);
    }

    const taxYear = this.form.taxYear;
    this.year = taxYear;
    if (taxYear === null) return;

    if (isSupportedTaxYear(taxYear)) {
      this.draft.fields.taxYear = taxYear;
      this.draft.provenance.taxYear = '1040 form header';
      ilog(`matched taxYear = ${taxYear}`);
    } else if (taxYear < EARLIEST_MAPPED_YEAR) {
      // Below EARLIEST_MAPPED_YEAR the per-year field-id map has nothing for this year either, so
      // one combined warning replaces what would otherwise be two near-duplicate ones ("not
      // supported" + "older than the layout").
      this.draft.warnings.push(
        `Detected tax year ${taxYear} — older than the ${EARLIEST_MAPPED_YEAR} layout this importer was built against, and not a year this app computes tax for. Double-check every value below, then pick a supported year to see these figures under its brackets.`,
      );
    } else {
      this.draft.warnings.push(
        `Detected tax year ${taxYear}, which this app doesn't compute tax for yet. Pick a supported year below to see these figures under its brackets.`,
      );
    }
  }

  private finalize(): ParsedReturn {
    const foundIncome = ALL_SOURCES.some((source) => this.draft.fields[source] !== undefined);
    if (!foundIncome) {
      this.draft.warnings.unshift(
        "Couldn't read any income values from this PDF. It may be a scanned image (not yet supported) or an unexpected layout.",
      );
    }

    setImportStep('result');
    ilog('final fields', this.draft.fields);
    ilog('warnings', this.draft.warnings);
    ilog('assumed', this.draft.assumed);
    setImportStep('');
    return this.draft;
  }
}
