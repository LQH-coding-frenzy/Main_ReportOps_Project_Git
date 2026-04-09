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
  const bucketExists = buckets?.some((b) => b.name === env.SUPABASE_STORAGE_BUCKET);

  if (!bucketExists) {
    const { error } = await supabase.storage.createBucket(env.SUPABASE_STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/pdf',
      ],
    });

    if (error) {
      console.error('❌ Failed to create storage bucket:', error.message);
    } else {
      console.log(`✅ Storage bucket "${env.SUPABASE_STORAGE_BUCKET}" created`);
    }
  } else {
    console.log(`✅ Storage bucket "${env.SUPABASE_STORAGE_BUCKET}" exists`);
  }
}
