import { parentPort, workerData } from 'worker_threads';

/* eslint-disable @typescript-eslint/no-require-imports */
const DocxMerger: {
  new (options: Record<string, unknown>, files: unknown[]): {
    save: (type: 'nodebuffer', callback: (data: unknown) => void) => void;
  };
} = require('docx-merger');
const JSZip = require('jszip');
/* eslint-enable @typescript-eslint/no-require-imports */

interface SectionData {
  code: string;
  buffer: Buffer;
}

interface WorkerInput {
  sections: SectionData[];
  fallbackBuffer: Buffer;
}

async function performMerge() {
  try {
    const { sections, fallbackBuffer } = workerData as WorkerInput;
    const mergeInput: Buffer[] = [];
    const recoveredSections: string[] = [];

    console.log(`[Worker] Starting deep validation for ${sections.length} sections...`);

    for (const section of sections) {
      try {
        const jszip = new JSZip();
        // JSZip v2.7.0 uses the synchronous .load() method
        jszip.load(section.buffer);
        mergeInput.push(section.buffer);
      } catch (error) {
        console.warn(`[Worker] Corrupt section detected: ${section.code}. Replacing with blank page. Error: ${error instanceof Error ? error.message : String(error)}`);
        recoveredSections.push(section.code);
        mergeInput.push(fallbackBuffer);
      }
    }

    if (mergeInput.length === 0) {
      throw new Error('No valid documents to merge.');
    }

    // 2. Perform the merge using raw Buffers if docx-merger supports it, 
    // or binary strings as a last resort but processed carefully.
    // NOTE: docx-merger 1.2.2 usually expects binary strings or buffers. 
    // Let's try passing the buffers directly first as it's safer.
    
    console.log(`[Worker] Merging ${mergeInput.length} sections...`);

    const merger = new DocxMerger({}, mergeInput);
    merger.save('nodebuffer', (data: unknown) => {
      const result = Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'binary');
      parentPort?.postMessage({ 
        status: 'success', 
        data: result, 
        recovered: recoveredSections 
      });
    });

  } catch (error) {
    console.error('[Worker Fatal Error]', error);
    parentPort?.postMessage({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

void performMerge();
