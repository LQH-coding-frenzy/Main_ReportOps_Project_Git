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

/**
 * Sanitizes a DOCX file buffer by stripping problematic XML attributes like Revision IDs (rsid)
 * which often cause merge conflicts and corruption in Microsoft Word.
 */
function sanitizeDocx(buffer: Buffer): Buffer {
  try {
    const zip = new JSZip();
    zip.load(buffer);
    
    // 1. Sanitize document.xml (Main content)
    const docXmlPath = 'word/document.xml';
    const docXmlFile = zip.file(docXmlPath);
    
    if (docXmlFile) {
      let xml = docXmlFile.asText();
      
      // Remove all w:rsid attributes which cause most "unreadable content" errors in Word
      // Example: w:rsidR="005D4D54" w:rsidRDefault="005D4D54"
      xml = xml.replace(/w:rsid[R|P|RPr|Del|RDefault|Tr|S]="[^"]*"/g, '');
      
      zip.file(docXmlPath, xml);
    }
    
    // 2. Sanitize settings.xml (Remove proofing/checking states that might conflict)
    const settingsPath = 'word/settings.xml';
    if (zip.file(settingsPath)) {
      let settingsXml = zip.file(settingsPath).asText();
      settingsXml = settingsXml.replace(/<w:proofState [^>]*\/>/g, '');
      zip.file(settingsPath, settingsXml);
    }

    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (err) {
    console.error('Failed to sanitize section, proceeding with original:', err);
    return buffer;
  }
}

function validateZip(buffer: Buffer): boolean {
  try {
    const jszip = new JSZip();
    jszip.load(buffer);
    return true;
  } catch {
    return false;
  }
}

async function performMerge() {
  const { sections, fallbackBuffer } = workerData as WorkerInput;
  const recovered: string[] = [];

  try {
    const validatedSections: Buffer[] = [];

    console.log(`[Worker] Pre-processing ${sections.length} sections...`);

    for (const section of sections) {
      const { code, buffer } = section;
      const isValid = validateZip(buffer);

      if (isValid) {
        // Apply sanitization to heal formatting before merging
        const sanitized = sanitizeDocx(buffer);
        validatedSections.push(sanitized);
      } else {
        console.warn(`[Worker] Section ${code} is corrupt. Using fallback.`);
        validatedSections.push(fallbackBuffer);
        recovered.push(code);
      }
    }

    if (validatedSections.length === 0) {
      throw new Error('No valid documents to merge.');
    }

    console.log(`[Worker] Merging ${validatedSections.length} sections...`);

    const merger = new DocxMerger({}, validatedSections);
    
    merger.save('nodebuffer', (data: unknown) => {
      // Ensure the result is a Buffer before sending back
      const result = Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'binary');
      
      parentPort?.postMessage({ 
        status: 'success', 
        data: result, 
        recovered 
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

// Start execution
void performMerge();
