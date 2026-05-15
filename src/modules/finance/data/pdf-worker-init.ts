/* eslint-disable @typescript-eslint/no-explicit-any */
//
// pdf.js worker bootstrap for Node.js / Next.js server runtime.
//
// pdfjs-dist v5+ uses ESM `import()` to lazy-load the worker, which
// requires a `file://` URL (NOT a raw absolute path). Without this:
//   Setting up fake worker failed: "Only URLs with a scheme in:
//   file, data, and node are supported by the default ESM loader.
//   On Windows, absolute paths must be valid file:// URLs.
//   Received protocol 'd:'."  (Windows dev)
//   ...or silently fails on Linux prod with "Cannot find module".
//
// We resolve the .mjs path via createRequire (so it works in both
// ESM and CJS contexts), then convert to a file:// URL via
// pathToFileURL before handing it to PDFParse.setWorker.
//

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { PDFParse } from 'pdf-parse';

let initialised = false;

export function ensurePdfWorker(): void {
  if (initialised) return;
  try {
    const requireFn = createRequire(import.meta.url);
    const workerPath = requireFn.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    // Convert OS path → file:// URL — required by Node's ESM import()
    const workerUrl = pathToFileURL(workerPath).href;
    PDFParse.setWorker(workerUrl);
    initialised = true;
    console.log('[pdf-worker-init] worker:', workerUrl);
  } catch (e: any) {
    console.log('[pdf-worker-init] failed to resolve pdf.worker.mjs:', e.message);
  }
}
