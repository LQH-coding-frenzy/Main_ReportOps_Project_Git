import { parentPort, workerData } from 'worker_threads';

/* eslint-disable @typescript-eslint/no-require-imports */
const DocxMerger: {
  new (options: Record<string, unknown>, files: unknown[]): {
    save: (type: 'nodebuffer', callback: (data: unknown) => void) => void;
  };
} = require('docx-merger');
/* eslint-enable @typescript-eslint/no-require-imports */

interface SectionData {
  code: string;
  buffer: Buffer;
}

/**
 * Validates if a buffer starts with the ZIP magic number (PK\x03\x04).
 */
function isZipBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;
  return (
    buffer[0] === 0x50 && // P
    buffer[1] === 0x4B && // K
    buffer[2] === 0x03 && // \x03
    buffer[3] === 0x04    // \x04
  );
}

/**
 * Perform heavy synchronous DOCX merging in a background thread.
 */
async function performMerge() {
  try {
    const { sections } = workerData as { sections: SectionData[] };

    if (!sections || sections.length === 0) {
      throw new Error('No documents provided to worker for merging');
    }

    // 1. Validate all buffers before passing to DocxMerger
    const binaryFiles: string[] = [];
    const invalidSections: string[] = [];

    for (const section of sections) {
      if (!isZipBuffer(section.buffer)) {
        invalidSections.push(
          `Section ${section.code} (Size: ${section.buffer.length} bytes, Magic: ${section.buffer.subarray(0, 4).toString('hex')})`
        );
      } else {
        binaryFiles.push(section.buffer.toString('binary'));
      }
    }

    if (invalidSections.length > 0) {
      throw new Error(`The following sections have invalid document formats (not valid .docx/zip):\n- ${invalidSections.join('\n- ')}`);
    }

    // 2. Perform the merge
    if (binaryFiles.length === 1) {
      const result = Buffer.from(binaryFiles[0], 'binary');
      parentPort?.postMessage({ status: 'success', data: result });
      return;
    }

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
