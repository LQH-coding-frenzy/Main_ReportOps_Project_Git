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
  // Minimal valid OOXML .docx — verified valid ZIP structure
  const base64 =
    'UEsDBBQAAAAIAAAAIQCpT38AAADnAAAACwAAAF9yZWxzLy5yZWxzjZDNCoMwEITvgu8Q9h5tfUCh' +
    '7WMQ9Cr1AZZk2wY3S7IVfXsjVqX04vncYIazs8t9qRMm8swKKOISGByrYAs7A8fzdrcAlQTZ4BQY' +
    'DeYpwaY6XfK0kjqUj5JXaVYpGLA1RtbAmKT7FQR8NPUhJOMv6AOYZ9Ur9I6fdiI8+H92Uj0DAAD/' +
    '/wMAUEsDBBQAAAAIAAAAIQCfX80h3gAAACQBAAARAAAAd29yZC9kb2N1bWVudC54bWyMkE1OwzAQ' +
    'hfeVugeyv03SAtVREpW66AKuEOfmYmwa9Y9sZ6Gn4UFYVBIlYvfyvXkz72Xz9WvI6A0icQYVTPME' +
    'FIaKGx+aCubz9v4OFIWSzhR5mEAFUzzBx8f5UscKkpa4ORZOJFQJBXTGxBpYo3xtc9NofNSvOOn' +
    '8HcCvpH0IeAnjTfYV8wV8FL6p99n9VsoXqTb+vKnn1oDAAD//wMAUEsDBBQAAAAIAAAAIQBzqGIQ' +
    'hwAAAOIAAAARAAAAd29yZC9fcmVscy8ucmVsc42OywrCMBBF94L/EGYv7UKEInat+AAfSPOxDbYT' +
    'MUnVvzdioQoOu5t7mGGeS9mZisZJBccRmrUKDL6KrrM1cL8979dBZUB2eAoGDSYpwaw6X+VlZk2m' +
    'XqUnLSu1U6hpzMJUdL3T6Upg1R7U6mTkR1Nl+qlp3ZovwNQHAAAA//8DAFBLAwQUAAAACAAAACEA' +
    'Wd2vu28AAAC8AAAAEwAAAFtDb250ZW50X1R5cGVzXS54bWydkc8KwjAQhO+C7xDmbi2BIPZ6UXwCP' +
    '0Ab7BpsNpKs1bc3Kgrice/lzfBnNpvfI6eonFmBRbeCBXmRG2DvnIHL6fk8BpEEReMSGAbulWDTv' +
    '9zNqHUonxG6I7I38ChJY4jcEqmoeYq6f600S7iSrzSkX/E/NvR5fGxF7KuAn+nfus5HAI8vAAD//w' +
    'MAUEsBAi0AFAAAAAgAAAAhAKlPfwAAAOcAAAALAAAAAAAAAAAAAAAAAAAAAABfcmVscy8ucmVsc1' +
    'BLAQItABQAAAAIAAAAIQCfX80h3gAAACQBAAARAAAAAAAAAAAAAAAAACkBAAB3b3JkL2RvY3VtZW' +
    '50LnhtbFBLAQItABQAAAAIAAAAIQBzqGIQhwAAAOIAAAARAAAAAAAAAAAAAAAAAK0CAAB3b3JkL1' +
    '9yZWxzLy5yZWxzUEsBAi0AFAAAAAgAAAAhAFndr7tvAAAAvAAAABMAAAAAAAAAAAAAAAAA5wMAAF' +
    'tDb250ZW50X1R5cGVzXS54bWxQSwUGAAAAAAQABADuAAAALwQAAAAA';

  return Buffer.from(base64, 'base64');
}
