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

// A token that is exactly a 20xx year, optionally wrapped in parens e.g. "(2025)".
// https://regexper.com/#%2F%5E%5C%28%3F%2820%5Cd%7B2%7D%29%5C%29%3F%24%2F
const YEAR_TOKEN = /^\(?(20\d{2})\)?$/;

// The IRS reprints its own catalog line, "Form 1040 (2025)", as boilerplate on every face page in
// every year back to 2019 — the most reliable anchor for the tax year. The optional "-sr" also
// matches the "Form 1040-SR" seniors variant, which is line-for-line identical to the 1040 (same
// line numbers, schedules, and labels — only the title, font, and a deduction chart differ), so
// its footer should anchor the same way. The stylized year box in the masthead is a weaker signal:
// PDFs often render it as two separate text runs ("20" / "25" in different weights), so it doesn't
// reliably land in a single token. https://regexper.com/#%2Fform%201040%28%3F%3A-sr%29%3F%5Cs*%5C%28%3F%2820%5Cd%7B2%7D%29%5C%29%3F%2F
const FORM_1040_FOOTER_YEAR = /form 1040(?:-sr)?\s*\(?(20\d{2})\)?/;

/**
 * Best-effort: on a 1040 the checkbox mark sits just left of its status label, so
 * match the label that immediately follows a checkmark on the same row. Still
 * unreliable across layouts, so the caller always asks the user to confirm.
 */
export function detectFilingStatus(rows: Row[]): FilingStatus | null {
  ilog(`detectFilingStatus: scanning ${rows.length} rows`);
  for (const row of rows) {
    const itemIndex = row.items.findIndex((i) => CHECK_TOKENS.has(i.text));
    if (itemIndex === -1) {
      // Surface items that look like they could be unrecognized checkbox glyphs so we
      // can identify what character the PDF is using (logged as Unicode code points).
      // Cheapest tests first; the regex (the costly part) only runs on short, non-empty tokens.
      const candidates = row.items.filter((i) => i.text !== '' && i.text.length <= 2 && !PLAIN_TEXT_TOKEN.test(i.text));
      if (candidates.length > 0) {
        ilog(
          `detectFilingStatus: row "${row.originalText}" — no known CHECK_TOKEN but suspicious items: ${JSON.stringify(
            candidates.map((c) => ({
              text: c.originalText,
              codePoints: [...c.originalText].map(
                (ch) => 'U+' + (ch.codePointAt(0) ?? 0).toString(16).padStart(4, '0'),
              ),
            })),
          )}`,
        );
      }
      continue;
    }
    const checkToken = row.items[itemIndex];
    ilog(
      `detectFilingStatus: check token "${checkToken.originalText}" (${[...checkToken.originalText].map((ch) => 'U+' + (ch.codePointAt(0) ?? 0).toString(16).padStart(4, '0')).join(' ')}) in row "${row.originalText}"`,
    );
    const after = row.items
      .slice(itemIndex + 1)
      .map((i) => i.text)
      .join(' ')
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
 * A plausible 4-digit tax year on the 1040 face. Whether it's one the app actually supports is
 * left to `isTaxYear` at the call site, so a newly filed year still reaches the "unsupported
 * year" warning rather than looking undetected.
 *
 * Anchors on the "Form 1040 (YYYY)" catalog-line boilerplate first (see `FORM_1040_FOOTER_YEAR`):
 * unlike a bare 20xx token, it can't be confused with an unrelated year elsewhere on the face
 * (an estimated-tax carryover, a "for the year … 2025" instruction line, etc). Falls back to the
 * older loose scan — the first standalone 20xx token, optionally parenthesized — for layouts where
 * that boilerplate isn't present.
 */
export function detectTaxYear(faceRows: Row[]): number | null {
  ilog(`detectTaxYear: scanning ${faceRows.length} rows`);
  for (const row of faceRows) {
    const footerMatch = row.text.match(FORM_1040_FOOTER_YEAR);
    if (footerMatch) {
      ilog(`detectTaxYear: matched year ${footerMatch[1]} from "Form 1040 (YYYY)" row "${row.text}"`);
      return Number(footerMatch[1]);
    }
  }
  ilog('detectTaxYear: no "Form 1040 (YYYY)" anchor found; falling back to loose year-token scan');
  for (const row of faceRows) {
    for (const item of row.items) {
      const yearMatch = item.text.match(YEAR_TOKEN);
      if (yearMatch) {
        ilog(`detectTaxYear: fallback matched year ${yearMatch[1]} from "${item.text}"`);
        return Number(yearMatch[1]);
      }
    }
  }
  ilog('detectTaxYear: no year token found on face page');
  return null;
}
