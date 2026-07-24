import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { groupRows, type TextItem } from '../rows';

/** Size of a rebuilt page, in PDF points (user space). */
export interface PageSize {
  width: number;
  height: number;
}

// pdf-lib's standard Helvetica encodes WinAnsi only. Real preparer PDFs carry the odd glyph outside
// printable ASCII (curly quotes, bullets, an em dash in "Standard Deduction for—"); none are part of
// any text the importer matches on, so map the common ones to plain ASCII and drop the rest rather
// than let embedding throw. https://regexper.com/#%2F%5B%5E%5Cx20-%5Cx7E%5D%2Fg
const OUTSIDE_PRINTABLE_ASCII = /[^\x20-\x7E]/g;
const GLYPH_REPLACEMENTS: Record<string, string> = {
  '–': '-', // en dash
  '—': '-', // em dash
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '•': '*', // bullet
  '…': '...',
  // Filing-status check glyphs → ASCII 'X' so detect.ts still sees a check token after the rebuild
  // (Helvetica can't encode these; without this they'd be dropped and the status would read as blank).
  '☒': 'X',
  '✗': 'X',
  '✓': 'X',
  '■': 'X',
};

function toWinAnsiSafe(text: string): string {
  return text.replace(OUTSIDE_PRINTABLE_ASCII, (ch) => GLYPH_REPLACEMENTS[ch] ?? '');
}

// Small enough that adjacent form rows (their baselines differ by well over the extractor's
// ROW_TOLERANCE) never merge; the exact size is irrelevant to extraction, which reads only x/y/text.
const FONT_SIZE = 8;

// Minimum visual gap (in PDF points) to leave between an item and the next item on its row. A real
// form's items sit at whatever x the *original* (usually narrower or proportionally-kerned) font left
// them; redrawing at a fixed Helvetica size can overrun into the next item's x, so pdf.js's own
// item-combining logic (used by both the browser and Node read paths, `combineTextItems` on by default)
// glues them into one token with no separating space when it re-parses the rebuilt PDF — e.g. a real
// "Taxable interest. Attach Sch. B if required" / "2b" pair (46pt apart in the source) can come back as
// one merged "…required2b" token, breaking the extractor's id lookup for "2b". Shrinking the item's font
// just enough to clear this gap keeps every item legible while guaranteeing it reads back as its own token.
const MIN_ROW_GAP = 2;

/** The largest font size (capped at `FONT_SIZE`) at which `text` fits before `nextX`, leaving
 *  `MIN_ROW_GAP` of clearance — or `FONT_SIZE` unshrunk when there's no next item on the row to crowd. */
function fittingFontSize(font: PDFFont, text: string, x: number, nextX: number | undefined): number {
  if (nextX === undefined) return FONT_SIZE;
  const available = nextX - x - MIN_ROW_GAP;
  if (available <= 0) return FONT_SIZE; // overlapping source coordinates; nothing sane to shrink to
  const widthAtDefault = font.widthOfTextAtSize(text, FONT_SIZE);
  return widthAtDefault <= available ? FONT_SIZE : Math.max(FONT_SIZE * (available / widthAtDefault), 1);
}

/**
 * Draw each positioned text item at its (x, y) on a fresh page of the given size, producing a clean
 * PDF. Both pdf-lib and pdf.js use PDF user space (origin bottom-left, y up), so a token written at
 * (x, y) reads back at (x, y). Items whose `page` has no matching size are skipped. This is how the
 * fixture builder rebuilds an anonymized 1040 from a real form's positioned text — see
 * `scripts/build-1040-fixtures.ts`.
 */
export async function rebuildPdf(items: TextItem[], pageSizes: PageSize[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = pageSizes.map((size) => doc.addPage([size.width, size.height]));
  for (const row of groupRows(items)) {
    row.items.forEach((item, i) => {
      const page = pages[item.page - 1];
      if (!page) return;
      const text = toWinAnsiSafe(item.text);
      if (text === '') return;
      const size = fittingFontSize(font, text, item.x, row.items[i + 1]?.x);
      page.drawText(text, { x: item.x, y: item.y, size, font });
    });
  }
  return doc.save();
}
