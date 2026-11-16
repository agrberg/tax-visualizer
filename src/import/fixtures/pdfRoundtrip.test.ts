import { describe, it, expect } from 'vitest';
import type { TextItem } from '../rows';
import { rebuildPdf } from './rebuildPdf';
import { readPdfInNode } from './readPdfInNode';

// A tiny two-row layout on one Letter-size page. Both the writer (pdf-lib) and the reader (pdf.js)
// use PDF user space (origin bottom-left, y up), so a token drawn at (x, y) should read back at
// approximately (x, y). Widths are irrelevant to extraction (grouping uses only x/y), so we don't
// assert on them.
const LETTER = { width: 612, height: 792 };
// rebuildPdf draws `originalText`; readPdfInNode reads it back with `text` trimmed and lower-cased at
// ingestion (see mapPageItems). These synthetic tokens are already lower-case, so `originalText` mirrors
// `text`.
const item = (text: string, x: number, y: number, width: number, page: number): TextItem => ({
  text,
  originalText: text,
  x,
  y,
  width,
  page,
});
const layout: TextItem[] = [
  item('1z', 40, 600, 12, 1),
  item('wages', 70, 600, 30, 1),
  item('118,000', 520, 600, 40, 1),
  item('2b', 40, 560, 12, 1),
  item('taxable interest', 70, 560, 70, 1),
  item('2,100', 520, 560, 30, 1),
];

const byPosition = (a: TextItem, b: TextItem) => a.y - b.y || a.x - b.x;

describe('rebuildPdf + readPdfInNode round-trip', () => {
  it('reads back every drawn token at approximately its original coordinates', async () => {
    const bytes = await rebuildPdf(layout, [LETTER]);
    const { items: read, pageSizes } = await readPdfInNode(bytes);

    expect(pageSizes).toEqual([LETTER]);
    expect(read.map((i) => i.text).sort()).toEqual(layout.map((i) => i.text).sort());

    const expected = [...layout].sort(byPosition);
    const actual = [...read].sort(byPosition);
    expect(actual).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(actual[i].text).toBe(expected[i].text);
      expect(actual[i].x).toBeCloseTo(expected[i].x, 0);
      expect(actual[i].y).toBeCloseTo(expected[i].y, 0);
      expect(actual[i].page).toBe(expected[i].page);
    }
  });

  it('preserves page assignment across multiple pages', async () => {
    const twoPage: TextItem[] = [item('page-one', 50, 700, 40, 1), item('page-two', 50, 700, 40, 2)];
    const { items: read } = await readPdfInNode(await rebuildPdf(twoPage, [LETTER, LETTER]));
    expect(read.find((i) => i.text === 'page-one')?.page).toBe(1);
    expect(read.find((i) => i.text === 'page-two')?.page).toBe(2);
  });

  it('draws the printed casing (originalText), which reads back lower-cased in text', async () => {
    const mixed: TextItem[] = [{ text: 'form 1040', originalText: 'Form 1040', x: 50, y: 700, width: 40, page: 1 }];
    const { items: read } = await readPdfInNode(await rebuildPdf(mixed, [LETTER]));
    expect(read[0].originalText).toBe('Form 1040');
    expect(read[0].text).toBe('form 1040');
  });
});
