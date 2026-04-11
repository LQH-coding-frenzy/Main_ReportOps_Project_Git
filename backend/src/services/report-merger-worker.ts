import { parentPort, workerData } from 'worker_threads';

/* eslint-disable @typescript-eslint/no-require-imports */
const DocxMerger: {
  new (options: Record<string, unknown>, files: unknown[]): {
    save: (type: 'nodebuffer', callback: (data: unknown) => void) => void;
  };
} = require('docx-merger');
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Perform heavy synchronous DOCX merging in a background thread.
 */
async function performMerge() {
  try {
    const { buffers } = workerData as { buffers: Buffer[] };

    if (!buffers || buffers.length === 0) {
      throw new Error('No buffers provided to worker');
    }

    if (buffers.length === 1) {
      parentPort?.postMessage({ status: 'success', data: buffers[0] });
      return;
    }

    // Convert buffers to binary strings for docx-merger compatibility
    // In a worker thread, this CPU-intensive conversion won't block the main API
    const binaryFiles = buffers.map((buffer) => buffer.toString('binary'));
    const merger = new DocxMerger({}, binaryFiles);

    merger.save('nodebuffer', (data: unknown) => {
      const result = Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'binary');
      parentPort?.postMessage({ status: 'success', data: result });
    });
  } catch (error) {
    parentPort?.postMessage({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown worker error',
    });
  }
}

void performMerge();
