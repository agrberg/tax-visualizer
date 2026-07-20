/**
 * Best-effort detection of the two non-money header fields — filing status and tax year — from
 * the 1040 face. Both are heuristic (checkbox glyphs and layouts vary), so the caller always asks
 * the user to confirm what these return.
 */
import type { FilingStatus } from '../tax/types';
import type { Row } from './rows';
import { ilog } from './importLog';

const STATUS_KEYWORDS: { status: FilingStatus; labels: string[] }[] = [
  { status: 'mfj', labels: ['married filing jointly'] },
  { status: 'mfs', labels: ['married filing separately'] },
  { status: 'hoh', labels: ['head of household'] },
  { status: 'single', labels: ['single'] },
];

const CHECK_TOKENS = new Set(['x', '☒', '✗', '✓', '■']);

// An ordinary text token: only letters, digits, and whitespace. Used to single out the *un*ordinary
// short glyphs that might be an unrecognized checkbox mark. https://regexper.com/#%2F%5E%5Ba-z0-9%5Cs%5D%2B%24%2Fi
const PLAIN_TEXT_TOKEN = /^[a-z0-9\s]+$/i;

// A 20xx substring appearing anywhere in a token (loose — diagnostics only). https://regexper.com/#%2F20%5Cd%7B2%7D%2F
const YEAR_LIKE = /20\d{2}/;
// A token that is exactly a 20xx year, optionally wrapped in parens e.g. "(2025)".
// https://regexper.com/#%2F%5E%5C%28%3F%2820%5Cd%7B2%7D%29%5C%29%3F%24%2F
const YEAR_TOKEN = /^\(?(20\d{2})\)?$/;

/**
 * Best-effort: on a 1040 the checkbox mark sits just left of its status label, so
 * match the label that immediately follows a checkmark on the same row. Still
 * unreliable across layouts, so the caller always asks the user to confirm.
 */
export function detectFilingStatus(rows: Row[]): FilingStatus | null {
  ilog(`detectFilingStatus: scanning ${rows.length} rows`);
  for (const row of rows) {
    const itemIndex = row.items.findIndex((i) => CHECK_TOKENS.has(i.text.trim().toLowerCase()));
    if (itemIndex === -1) {
      // Surface items that look like they could be unrecognized checkbox glyphs so we
      // can identify what character the PDF is using (logged as Unicode code points).
      // Cheapest tests first; the regex (the costly part) only runs on short, non-empty tokens.
      const candidates = row.items.filter((i) => {
        const text = i.text.trim();
        return text !== '' && text.length <= 2 && !PLAIN_TEXT_TOKEN.test(text);
      });
      if (candidates.length > 0) {
        ilog(
          `detectFilingStatus: row "${row.text}" — no known CHECK_TOKEN but suspicious items: ${JSON.stringify(
            candidates.map((c) => ({
              text: c.text,
              codePoints: [...c.text].map((ch) => 'U+' + (ch.codePointAt(0) ?? 0).toString(16).padStart(4, '0')),
            })),
          )}`,
        );
      }
      continue;
    }
    const checkToken = row.items[itemIndex];
    ilog(
      `detectFilingStatus: check token "${checkToken.text}" (${[...checkToken.text].map((ch) => 'U+' + (ch.codePointAt(0) ?? 0).toString(16).padStart(4, '0')).join(' ')}) in row "${row.text}"`,
    );
    const after = row.items
      .slice(itemIndex + 1)
      .map((i) => i.text)
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    ilog(`detectFilingStatus: text after check token: "${after}"`);
    for (const { status, labels } of STATUS_KEYWORDS) {
      if (labels.some((label) => after.startsWith(label))) {
        ilog(`detectFilingStatus: matched status "${status}"`);
        return status;
      }
    }
    ilog(`detectFilingStatus: check token found but no status label matched`);
  }
  ilog('detectFilingStatus: no filing status found');
  return null;
}

/**
 * A plausible 4-digit tax year (a 20xx token) on the 1040 face. Whether it's one the
 * app actually supports is left to `isTaxYear` at the call site, so a newly filed year
 * still reaches the "unsupported year" warning rather than looking undetected.
 *
 * IRS PDFs often render the year as "(2025)" with surrounding parentheses, so the
 * regex strips those before matching.
 */
export function detectTaxYear(faceRows: Row[]): number | null {
  ilog(`detectTaxYear: scanning ${faceRows.length} rows`);
  for (const row of faceRows) {
    for (const item of row.items) {
      const t = item.text.trim();
      if (YEAR_LIKE.test(t)) {
        ilog(`detectTaxYear: year-like token "${t}" full-match=${YEAR_TOKEN.test(t)}`);
      }
      const yearMatch = t.match(YEAR_TOKEN);
      if (yearMatch) {
        ilog(`detectTaxYear: matched year ${yearMatch[1]} from "${t}"`);
        return Number(yearMatch[1]);
      }
    }
  }
  ilog('detectTaxYear: no year token found on face page');
  return null;
}
