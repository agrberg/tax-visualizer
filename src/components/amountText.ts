/**
 * Pure text helpers for `MoneyInput`, split out so the signed-input contract can be tested
 * without rendering React (mirrors the tower.ts / tower.test.ts split).
 */

/** Parse a money field's text buffer to a number; '', a lone '-', and any non-finite value mean 0. */
export function parseAmountText(text: string): number {
  if (text === '' || text === '-') return 0;
  const n = Number(text);
  // A very long pasted digit string overflows to Infinity; the rest of the app treats
  // non-finite as invalid (storage/share-link normalize it to 0), so match that here.
  return Number.isFinite(n) ? n : 0;
}

/**
 * Reduce raw keyboard/paste input to digits with at most one leading '-', kept only when the
 * field allows a sign. Everything else is stripped, so the buffer can never hold a malformed
 * amount. A lone '-' is preserved (so a loss can be typed left-to-right); positive-only fields
 * drop the sign entirely.
 */
export function sanitizeAmountText(raw: string, allowNegative: boolean): string {
  const cleaned = raw.replace(/[^0-9-]/g, '');
  const negative = allowNegative && cleaned.startsWith('-');
  return (negative ? '-' : '') + cleaned.replace(/-/g, '');
}
