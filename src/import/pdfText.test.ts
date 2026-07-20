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
