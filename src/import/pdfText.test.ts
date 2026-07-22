import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { setImportLogging } from './importLog';

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker-url' }));

import { extractTextItems } from './pdfText';

beforeAll(() => setImportLogging(false));
beforeEach(() => getDocument.mockReset());

function pdfFile(): File {
  return {
    name: 'return.pdf',
    size: 1024,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as File;
}

/** A pdf.js document proxy with a single page carrying the given text items. */
function fakePdf(items: unknown[]) {
  return {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      getTextContent: vi.fn().mockResolvedValue({ items }),
    }),
  };
}

/** A pdf.js document proxy with one page per entry, each carrying its own text items. */
function fakeMultiPagePdf(pagesOfItems: unknown[][]) {
  return {
    numPages: pagesOfItems.length,
    getPage: vi.fn((page: number) =>
      Promise.resolve({ getTextContent: vi.fn().mockResolvedValue({ items: pagesOfItems[page - 1] }) }),
    ),
  };
}

/** A single positioned text item at a fixed spot, carrying `str`. */
function item(str: string) {
  return { str, transform: [0, 0, 0, 0, 10, 20], width: 5 };
}

describe('extractTextItems', () => {
  it('flattens positioned text items and destroys the loading task', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({
      promise: Promise.resolve(fakePdf([{ str: 'hi', transform: [0, 0, 0, 0, 10, 20], width: 5 }])),
      destroy,
    });

    const items = await extractTextItems(pdfFile());

    expect(items).toEqual([{ text: 'hi', x: 10, y: 20, width: 5, page: 1 }]);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('stops extracting after the first page the predicate flags, leaving later pages unread', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const pdf = fakeMultiPagePdf([[item('page one')], [item('STOP')], [item('page three')]]);
    getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy });

    const items = await extractTextItems(pdfFile(), (pageItems) => pageItems.some((i) => i.text === 'STOP'));

    expect(items.map((i) => i.text)).toEqual(['page one', 'STOP']);
    expect(pdf.getPage).toHaveBeenCalledTimes(2); // page three is never fetched
  });

  it('reads every page when no stop predicate is given', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const pdf = fakeMultiPagePdf([[item('one')], [item('two')], [item('three')]]);
    getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy });

    const items = await extractTextItems(pdfFile());

    expect(items.map((i) => i.text)).toEqual(['one', 'two', 'three']);
  });

  it('destroys the loading task even when parsing fails', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({
      promise: Promise.reject(new Error('corrupt PDF')),
      destroy,
    });

    await expect(extractTextItems(pdfFile())).rejects.toThrow('corrupt PDF');
    expect(destroy).toHaveBeenCalledOnce();
  });
});
