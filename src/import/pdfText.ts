import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { mapPageItems, type TextItem } from './rows';
import { ilog } from './importLog';

// pdf.js runs its parser in a web worker; point it at the bundled worker asset.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Pull positioned text items out of a (text-layer) PDF, page by page, flattened into the
 * layout-agnostic `TextItem` shape the extractor consumes (normalization and item mapping live in
 * `mapPageItems`, shared with the Node fixture read path). Runs entirely in the browser.
 *
 * `shouldStopAfterPage`, if given, is called with each page's items right after they're collected;
 * returning `true` stops extraction after that page, leaving the rest of the document unread. The
 * 1040 importer uses this to stop once it has everything it needs (see `haveEverythingNeeded`), so the
 * state returns, worksheets, and K-1s padding a filed bundle are never parsed. This module stays
 * layout-agnostic — it only knows "a predicate decides when we've read enough."
 */
export async function extractTextItems(
  file: File,
  shouldStopAfterPage?: (pageItems: TextItem[]) => boolean,
): Promise<TextItem[]> {
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
      const pageItems = mapPageItems(content.items, page);
      items.push(...pageItems);
      if (shouldStopAfterPage?.(pageItems)) {
        ilog(`stopping after page ${page} — the stop predicate is satisfied`);
        break;
      }
    }
    ilog(`extracted ${items.length} text items`);
    return items;
  } finally {
    await loadingTask.destroy();
  }
}
