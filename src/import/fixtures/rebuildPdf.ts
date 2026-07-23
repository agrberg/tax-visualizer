import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { TextItem } from '../rows';

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

/**
 * Draw each positioned text item at its (x, y) on a fresh page of the given size, producing a clean
 * PDF. Both pdf-lib and pdf.js use PDF user space (origin bottom-left, y up), so a token written at
 * (x, y) reads back at (x, y). Items whose `page` has no matching size are skipped. Widths are ignored
 * (extraction groups by x/y only). This is how the fixture builder rebuilds an anonymized 1040 from a
 * real form's positioned text — see `scripts/build-1040-fixtures.ts`.
 */
export async function rebuildPdf(items: TextItem[], pageSizes: PageSize[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = pageSizes.map((size) => doc.addPage([size.width, size.height]));
  for (const item of items) {
    const page = pages[item.page - 1];
    if (!page) continue;
    const text = toWinAnsiSafe(item.text);
    if (text === '') continue;
    page.drawText(text, { x: item.x, y: item.y, size: FONT_SIZE, font });
  }
  return doc.save();
}
