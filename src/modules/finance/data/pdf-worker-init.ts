/* eslint-disable @typescript-eslint/no-explicit-any */
//
// pdf.js worker bootstrap for Node.js / Next.js server runtime.
//
// pdfjs-dist v5+ requires a workerSrc even on the server (no
// synchronous fallback). Next.js's bundler can't track the dynamic
// `import.meta.url`-based resolution that pdf-parse → pdfjs-dist
// uses, so on prod we hit:
//
//   Setting up fake worker failed: "Cannot find module
//     '/root/projects/.../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'"
//
// Fix: resolve the worker file via Node's `createRequire` (works in
// both ESM and CJS contexts) and feed the absolute path through
// `PDFParse.setWorker` BEFORE any getText() call.
//

import { createRequire } from 'module';
import { PDFParse } from 'pdf-parse';

let initialised = false;

export function ensurePdfWorker(): void {
  if (initialised) return;
  try {
    // createRequire(import.meta.url) is the canonical way to call
    // require.resolve from an ESM file at Node runtime. In Next.js
    // server bundles `import.meta.url` is available too.
    const requireFn = createRequire(import.meta.url);
    const workerPath = requireFn.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    PDFParse.setWorker(workerPath);
    initialised = true;
  } catch (e: any) {
    // Last-ditch: if resolve fails, try the well-known path layout.
    try {
      const fallback = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
      PDFParse.setWorker(fallback);
      initialised = true;
    } catch {
      console.log('[pdf-worker-init] failed to resolve pdf.worker.mjs:', e.message);
    }
  }
}
