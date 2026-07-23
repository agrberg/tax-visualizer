import type { FilingStatus, TaxInput } from '../../tax/types';
import { isSupportedTaxYear, taxTablesFor } from '../../tax/years';
import { STABLE_FIELD_IDS, lineIdForYear } from '../fieldLocations';

/**
 * Per-year expectations for the anonymized 1040 fixtures (2019–2025). One profile drives two things:
 * the fixture builder stamps each `line`'s synthetic amount onto the row that line's id locates in the
 * real form, and the fixtures test asserts `extract1040Fields` returns `expected`. Authoring both from
 * one source means an inconsistency between "what we print" and "what we expect to read" fails the test.
 *
 * Amounts are synthetic round numbers (no real financials in the repo) and deliberately distinct per
 * year, so a year-confusion bug in detection or the line-id map surfaces as a wrong value.
 */

/** A synthetic amount to stamp onto the row located by `id`, scoped to the face or to Schedule D. */
export interface FixtureLine {
  id: string;
  amount: number;
  where: 'face' | 'scheduleD';
  /** Sibling ids that delimit this line's segment on a shared row (see the extractor's SHARED_LINE_IDS). */
  boundaries?: string[];
}

export interface FixtureProfile {
  taxYear: number;
  filingStatus: FilingStatus;
  hasScheduleD: boolean;
  lines: FixtureLine[];
  /** Exactly the fields `extract1040Fields` should return for this fixture. */
  expected: Partial<TaxInput>;
}

// Ids that can share a baseline with a neighbor, mirrored from the extractor so a stamped amount lands
// in its own segment rather than a sibling's.
const DIVIDEND_BOUNDS = ['3a', '3b'];
const RETIREMENT_BOUNDS = ['4b', '4c', '4d'];
const DEDUCTION_BOUNDS = ['12a', '12b', '12c'];
const SCHEDULE_D_BOUNDS = ['7', '15'];

/** The deduction the extractor lands on: `null` (standard) when the printed amount equals the app's
 *  standard deduction for a supported year+status, else the custom number. These fixtures use
 *  deduction amounts that don't equal any year's standard, so they import as custom numbers. */
function expectedDeduction(year: number, status: FilingStatus, printed: number): number | null {
  if (!isSupportedTaxYear(year)) return printed;
  return taxTablesFor(year).standardDeduction[status] === printed ? null : printed;
}

interface ProfileInputs {
  year: number;
  filingStatus: FilingStatus;
  wages: number;
  interest: number;
  qualifiedDividends: number;
  ordinaryDividends: number;
  iraDistributions: number;
  pensions: number;
  deduction: number;
  /** Set for the face capital-gain line (imported as assumed long-term). Omit when a Schedule D is attached. */
  capitalGain?: number;
  /** Set to attach a Schedule D with a real short/long-term split; overrides `capitalGain`. */
  scheduleD?: { shortTerm: number; longTerm: number };
}

function makeProfile(inputs: ProfileInputs): FixtureProfile {
  const { year, filingStatus } = inputs;
  const lines: FixtureLine[] = [
    { id: lineIdForYear('wages', year)!, amount: inputs.wages, where: 'face' },
    { id: STABLE_FIELD_IDS.interest, amount: inputs.interest, where: 'face' },
    {
      id: STABLE_FIELD_IDS.qualifiedDividends,
      amount: inputs.qualifiedDividends,
      where: 'face',
      boundaries: DIVIDEND_BOUNDS,
    },
    {
      id: STABLE_FIELD_IDS.ordinaryDividends,
      amount: inputs.ordinaryDividends,
      where: 'face',
      boundaries: DIVIDEND_BOUNDS,
    },
    {
      id: STABLE_FIELD_IDS.iraDistributions,
      amount: inputs.iraDistributions,
      where: 'face',
      boundaries: RETIREMENT_BOUNDS,
    },
    { id: lineIdForYear('pensions', year)!, amount: inputs.pensions, where: 'face' },
    { id: lineIdForYear('deduction', year)!, amount: inputs.deduction, where: 'face', boundaries: DEDUCTION_BOUNDS },
  ];

  const expected: Partial<TaxInput> = {
    filingStatus,
    wages: inputs.wages,
    interest: inputs.interest,
    qualifiedDividends: inputs.qualifiedDividends,
    nonQualifiedDividends: Math.max(0, inputs.ordinaryDividends - inputs.qualifiedDividends),
    retirementIncome: inputs.iraDistributions + inputs.pensions,
    deduction: expectedDeduction(year, filingStatus, inputs.deduction),
  };
  if (isSupportedTaxYear(year)) expected.taxYear = year;

  if (inputs.scheduleD) {
    lines.push(
      { id: '7', amount: inputs.scheduleD.shortTerm, where: 'scheduleD', boundaries: SCHEDULE_D_BOUNDS },
      { id: '15', amount: inputs.scheduleD.longTerm, where: 'scheduleD', boundaries: SCHEDULE_D_BOUNDS },
    );
    expected.shortTermGains = inputs.scheduleD.shortTerm;
    expected.longTermGains = inputs.scheduleD.longTerm;
  } else if (inputs.capitalGain !== undefined) {
    lines.push({ id: lineIdForYear('capitalGain', year)!, amount: inputs.capitalGain, where: 'face' });
    expected.longTermGains = inputs.capitalGain; // face capital-gain line is imported as assumed long-term
  }

  return { taxYear: year, filingStatus, hasScheduleD: Boolean(inputs.scheduleD), lines, expected };
}

// Distinct amounts per year so a value read from the wrong year is caught. 2025 carries a Schedule D
// (real short/long-term split) and a standard-deduction amount (imports as `deduction: null`); the
// pre-2025 years exercise the face capital-gain line (assumed long-term) and import their deduction as
// a custom number (their amounts differ from the standard deduction).
export const FIXTURE_PROFILES: FixtureProfile[] = [2019, 2020, 2021, 2022, 2023, 2024].map((year) => {
  const i = year - 2019;
  return makeProfile({
    year,
    filingStatus: 'single',
    wages: 120000 + i * 1000,
    interest: 2000 + i * 10,
    qualifiedDividends: 8000,
    ordinaryDividends: 10000,
    iraDistributions: 5000,
    pensions: 3000,
    capitalGain: 15000 + i * 100,
    deduction: 13850 + i * 100,
  });
});

FIXTURE_PROFILES.push(
  makeProfile({
    year: 2025,
    filingStatus: 'single',
    wages: 130000,
    interest: 2500,
    qualifiedDividends: 9000,
    ordinaryDividends: 12000,
    iraDistributions: 6000,
    pensions: 4000,
    deduction: 15750, // 2025 single standard deduction → imports as `deduction: null`
    scheduleD: { shortTerm: 4000, longTerm: 11000 },
  }),
);

/** The committed fixture file name for a profile's year. */
export function fixtureFileName(year: number): string {
  return `1040-${year}.pdf`;
}
