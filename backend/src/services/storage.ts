import { supabase } from '../config/supabase';
import { env } from '../config/env';

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
export function createEmptyDocx(): Buffer {
  // Minimal valid OOXML .docx — this is a base64-encoded empty document
  // In production, you would use a template .docx file
  const base64 =
    'UEsDBBQAAAAIAAAAAACHTuJAXQAAAGEAAAARAAAAd29yZC9kb2N1bWVudC54bWytkE0KwjAQhe+C' +
    'dwjZ29QiiEjdjXoAL5CmYxtsJmQS9fimVhBx4Wp+vvfNMJP5xTfihJE8hwKmaQYCQ8W1D00Bd5' +
    'v1JAdBSYeKHEcoIJ4ymlN7YZRB0hI3F8KJCCmhgNaYOANrnB/bWmIaF+0WJf2e/i4g5xJ28B0S' +
    'PuDgNY8n2jf0FPBQrkb0y6+y+h8Ud9JvvPvTT70BAAA//8DAFBLAwQUAAAACAAAAAAAdGhiEIcA' +
    'AADiAAAAEQAAAHdvcmQvX3JlbHMvLnJlbHONzrEKwjAQBuC94DuE26etg4ikdnAVOkrxAdL02oam' +
    'F+5S9e2NgoMgOP78H/+VzexXN6kbJfaBDWyzAhRxEWzPrYHL+bRagoqC7HBKTAbulGBuuqvS5KSp' +
    'pLTjmNSz0oJGKQ5aIxddH3S6EFjUO7Q6kfxRl4X+alJbmj/A1AMAAAD//wMAUEsDBBQAAAAIAAAA' +
    'AABZ3a+7bwAAALwAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbE2OywrCMBBF94L/EGZv04UPROxu' +
    'VPyA2ExtsJmQTNW/N1VBXM69cE7d7F4+qwfFxIENbMoKFLELlnlw0F7PKzCJkC3OwYGBLyXY9Ydz' +
    'vFHOUppJHZOaJXIw8ChJQ4jcEqm4eYpSxJV8pCH9SvfY0NfhtRW+rwI+pn/jOh8AAP//AwBQSwME' +
    'FAAAAAgAAAAAAISAqU9/AAAA5wAAAAsAAABfcmVscy8ucmVsc42QzQrCMBCE74LvEPYebRVEpO1h' +
    'EPQq9QGWZNsG25dkK/r2RhQExeP8fMMwU7W3eYoXSskFNrAvClBENljm3sDtuF8tQSVBtjgFJgN3' +
    'SrCJV/VV5pW0o3qUvEqzSt6ArTGxBkYX3a8gYO9aHEoyHqfvwftWeoXe8bLthGf/z46qZwAAAP//' +
    'AwBQSwECLQAUAAAACAAAAACHTuJAXQAAAGEAAAARAAAAAAAAAAAAAAAAAAAAAAB3b3JkL2RvY3Vt' +
    'ZW50LnhtbFBLAQItABQAAAAIAAAAAAB0aGIQhwAAAOIAAAARAAAAAAAAAAAAAAAAwJYAAAB3b3Jk' +
    'L19yZWxzLy5yZWxzUEsBAi0AFAAAAAgAAAAAAFndr7tvAAAAvAAAABMAAAAAAAAAAAAAAAAAdBcB' +
    'AFtDb250ZW50X1R5cGVzXS54bWxQSwECLQAUAAAACAAAAACEgKlPfwAAAOcAAAALAAAAAAAAAAAA' +
    'AAAAFJgBAF9yZWxzLy5yZWxzUEsFBgAAAAAEAAQA7gAAAMwYAQAAAA==';

  return Buffer.from(base64, 'base64');
}
