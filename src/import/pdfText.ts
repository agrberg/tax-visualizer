import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem } from './rows';
import { ilog } from './importLog';

// pdf.js runs its parser in a web worker; point it at the bundled worker asset.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** A pdf.js text item carries the string and a 6-number transform (x = [4], y = [5]). */
interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

/**
 * Pull every positioned text item out of a (text-layer) PDF, flattened across
 * pages into the layout-agnostic `TextItem` shape the extractor consumes. Marked-
 * content items (no `str`) are skipped. Runs entirely in the browser.
 */
export async function extractTextItems(file: File): Promise<TextItem[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  // Hold the loading task so its worker/document resources are released whether
  // extraction succeeds or throws — otherwise importing several PDFs in one
  // session leaks them.
  const loadingTask = pdfjs.getDocument({ data });
  try {
    const pdf = await loadingTask.promise;
    ilog(`opened "${file.name}" (${(file.size / 1024).toFixed(0)} KB), ${pdf.numPages} page(s)`);

    const items: TextItem[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      for (const raw of content.items) {
        if (!('str' in raw)) continue;
        const item = raw as PdfTextItem;
        if (item.str.trim() === '') continue;
        items.push({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          page,
        });
      }
    }
    ilog(`extracted ${items.length} text items`);
    return items;
  } finally {
    await loadingTask.destroy();
  }
}
