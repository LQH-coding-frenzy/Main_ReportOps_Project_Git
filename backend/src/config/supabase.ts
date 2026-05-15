import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Supabase client with service role key.
 * Used for server-side operations: file uploads, downloads, admin queries.
 * This bypasses RLS — only use in backend/server context.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Initialize the storage bucket if it doesn't exist.
 * Called once on server startup.
 */
export async function initStorage(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketNames = new Set((buckets || []).map((bucket) => bucket.name));

  const syncBucket = async (
    name: string,
    options: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] }
  ): Promise<void> => {
    if (bucketNames.has(name)) {
      const { error } = await supabase.storage.updateBucket(name, options);
      if (error) {
        console.error(`❌ Failed to update storage bucket "${name}":`, error.message);
        return;
      }

      console.log(`✅ Storage bucket "${name}" exists and is synced`);
      return;
    }

    const { error } = await supabase.storage.createBucket(name, options);
    if (error) {
      console.error(`❌ Failed to create storage bucket "${name}":`, error.message);
      return;
    }

    bucketNames.add(name);
    console.log(`✅ Storage bucket "${name}" created`);
  };

  await syncBucket(env.SUPABASE_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'text/x-shellscript',
    ],
  });

  await syncBucket(env.SUPABASE_ARCHIVE_BUCKET, {
    public: false,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: [
      'text/html',
      'text/plain',
      'application/json',
      'application/xml',
      'text/xml',
      'image/png',
      'application/pdf',
      'application/octet-stream',
    ],
  });
}
