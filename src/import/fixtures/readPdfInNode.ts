import { readFile } from 'node:fs/promises';
import { mapPageItems, type TextItem } from '../rows';
import type { PageSize } from './rebuildPdf';

export interface ReadPdfResult {
  items: TextItem[];
  /** One entry per page, in page order, in PDF points — what `rebuildPdf` needs to size its pages. */
  pageSizes: PageSize[];
}

/**
 * Parse a PDF to the importer's `TextItem[]` (plus each page's size) in a plain Node process — no
 * browser, no bundler. Used by the fixtures test (to read each committed sample through the real
 * pdf.js) and by the fixture builder (to read a real return's positioned text and page geometry).
 * Accepts a file path or raw bytes.
 *
 * Uses pdf.js's `legacy` build, which runs on the main thread in Node without a worker or the Vite
 * `?url` worker asset the browser path (`../pdfText.ts`) depends on. The raw-item→`TextItem` mapping
 * is shared with the browser path via `mapPageItems`, so both produce identical items.
 */
export async function readPdfInNode(source: string | Uint8Array): Promise<ReadPdfResult> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js detaches the buffer it's handed (it transfers ownership to its worker), so always give it a
  // fresh copy — otherwise a caller that reuses the bytes (e.g. read-to-verify then write) gets a
  // detached ArrayBuffer.
  const data = typeof source === 'string' ? new Uint8Array(await readFile(source)) : source.slice();
  // Hold the loading task so its resources are released whether extraction succeeds or throws.
  const loadingTask = getDocument({ data });
  try {
    const pdf = await loadingTask.promise;
    const items: TextItem[] = [];
    const pageSizes: PageSize[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      const pageProxy = await pdf.getPage(page);
      const viewport = pageProxy.getViewport({ scale: 1 });
      pageSizes.push({ width: viewport.width, height: viewport.height });
      const content = await pageProxy.getTextContent();
      items.push(...mapPageItems(content.items, page));
    }
    return { items, pageSizes };
  } finally {
    await loadingTask.destroy();
  }
}
