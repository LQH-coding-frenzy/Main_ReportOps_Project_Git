import type { PrismaClient } from '@prisma/client';
import { env } from '../../config/env';
import { supabase } from '../../config/supabase';

const evidenceBuckets = [env.SUPABASE_ARCHIVE_BUCKET, env.SUPABASE_STORAGE_BUCKET];

async function removeFromAllBuckets(storagePath: string): Promise<void> {
  await Promise.all(
    evidenceBuckets.map(async (bucket) => {
      try {
        await supabase.storage.from(bucket).remove([storagePath]);
      } catch {
        // Best-effort cleanup only.
      }
    })
  );
}

export async function purgeAuditJobArtifacts(prisma: PrismaClient, auditJobId: number): Promise<void> {
  const evidences = await prisma.auditEvidence.findMany({
    where: { auditJobId },
    select: { storagePath: true },
  });

  const storagePaths = new Set<string>([
    ...evidences.map((evidence) => evidence.storagePath),
    `archives/audits/${auditJobId}/audit-log.txt`,
  ]);

  await Promise.all(Array.from(storagePaths).map((storagePath) => removeFromAllBuckets(storagePath)));
  await prisma.auditJob.delete({ where: { id: auditJobId } });
}
