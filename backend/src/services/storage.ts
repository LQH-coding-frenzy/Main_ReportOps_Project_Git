import { supabase } from '../config/supabase';
import { env } from '../config/env';

/* eslint-disable @typescript-eslint/no-require-imports */
const JSZip: {
  new (): {
    file: (path: string, content: string | Uint8Array | Buffer) => void;
    generate: (options: { type: 'nodebuffer' }) => Buffer;
  };
} = require('jszip');
/* eslint-enable @typescript-eslint/no-require-imports */

const bucket = env.SUPABASE_STORAGE_BUCKET;

/**
 * Upload a file to Supabase Storage.
 * @returns The storage key (path) of the uploaded file.
 */
export async function uploadFile(
  storageKey: string,
  fileBuffer: Buffer,
  contentType: string = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(storageKey, fileBuffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return storageKey;
}

/**
 * Download a file from Supabase Storage.
 * @returns The file as a Buffer.
 */
export async function downloadFile(storageKey: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(storageKey);

  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message || 'No data'}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get a signed URL for a file (time-limited access).
 * Used to provide ONLYOFFICE Document Server with a URL to fetch the document.
 *
 * @param storageKey The path in storage
 * @param expiresIn Seconds until the URL expires (default: 1 hour)
 * @returns Signed URL string
 */
export async function getSignedUrl(storageKey: string, expiresIn: number = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storageKey, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message || 'No URL'}`);
  }

  return data.signedUrl;
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(storageKey: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([storageKey]);

  if (error) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}

/**
 * List files in a storage directory.
 */
export async function listFiles(
  prefix: string
): Promise<Array<{ name: string; size: number; createdAt: string }>> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) {
    throw new Error(`Storage list failed: ${error.message}`);
  }

  return (data || []).map((file) => ({
    name: file.name,
    size: file.metadata?.size || 0,
    createdAt: file.created_at || '',
  }));
}

/**
 * Check if a file exists in storage.
 */
export async function fileExists(storageKey: string): Promise<boolean> {
  try {
    const parts = storageKey.split('/');
    const fileName = parts.pop()!;
    const prefix = parts.join('/');

    const { data } = await supabase.storage.from(bucket).list(prefix);
    return data?.some((f) => f.name === fileName) || false;
  } catch {
    return false;
  }
}

/**
 * Download a file from an external URL and return as Buffer.
 * Used to fetch the saved document from ONLYOFFICE callback URL.
 */
export async function downloadFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from URL: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Create an initial empty .docx file for a section.
 * This is a minimal valid .docx (just enough to open in ONLYOFFICE).
 */
let cachedEmptyDocx: Buffer | null = null;

export function createEmptyDocx(): Buffer {
  if (cachedEmptyDocx) {
    return Buffer.from(cachedEmptyDocx);
  }

  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '</Types>'
  );

  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  );

  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      '<w:p><w:r><w:t></w:t></w:r></w:p>' +
      '<w:sectPr>' +
      '<w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
      '<w:cols w:space="708"/>' +
      '<w:docGrid w:linePitch="360"/>' +
      '</w:sectPr>' +
      '</w:body>' +
      '</w:document>'
  );

  zip.file(
    'word/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
      '<w:name w:val="Normal"/>' +
      '<w:qFormat/>' +
      '</w:style>' +
      '</w:styles>'
  );

  zip.file(
    'word/numbering.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:abstractNum w:abstractNumId="0">' +
      '<w:nsid w:val="00000001"/>' +
      '<w:multiLevelType w:val="singleLevel"/>' +
      '<w:tmpl w:val="00000001"/>' +
      '<w:lvl w:ilvl="0">' +
      '<w:start w:val="1"/>' +
      '<w:numFmt w:val="decimal"/>' +
      '<w:lvlText w:val="%1."/>' +
      '<w:lvlJc w:val="left"/>' +
      '<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>' +
      '</w:lvl>' +
      '</w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
      '</w:numbering>'
  );

  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  );

  cachedEmptyDocx = zip.generate({ type: 'nodebuffer' });
  return Buffer.from(cachedEmptyDocx);
}
