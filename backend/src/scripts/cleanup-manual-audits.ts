import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { env } from '../config/env';
import { MANUAL_M1_CONTROL_IDS } from '../services/audit/m1-manual-controls';
import { purgeAuditJobArtifacts } from '../services/audit/archive-cleanup';
import { supabase } from '../config/supabase';

dotenv.config();

const prisma = new PrismaClient();

async function cleanupManualAudits() {
  console.log('🧹 Cleaning manual audits from the system...');

  const scripts = await prisma.auditScript.findMany({
    where: {
      OR: [
        { controlId: { in: [...MANUAL_M1_CONTROL_IDS] } },
        { assessmentType: 'Manual' },
      ],
    },
    select: { id: true, controlId: true, scriptStoragePath: true },
  });

  const referencedRuns = scripts.length > 0
    ? await prisma.auditScriptRun.findMany({
        where: { scriptId: { in: scripts.map((script) => script.id) } },
        select: { auditJobId: true },
      })
    : [];

  const manualJobs = await prisma.auditJob.findMany({
    where: { manualCount: { gt: 0 } },
    select: { id: true },
  });

  const affectedJobIds = new Set<number>([
    ...manualJobs.map((job) => job.id),
    ...referencedRuns.map((run) => run.auditJobId),
  ]);

  for (const jobId of affectedJobIds) {
    await purgeAuditJobArtifacts(prisma, jobId);
  }

  for (const script of scripts) {
    try {
      await supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).remove([script.scriptStoragePath]);
    } catch {
      // Best-effort only.
    }
  }

  if (scripts.length > 0) {
    await prisma.auditScript.deleteMany({
      where: { id: { in: scripts.map((script) => script.id) } },
    });
  }

  console.log(`✅ Removed ${scripts.length} manual script records`);
  console.log(`✅ Removed ${affectedJobIds.size} audit jobs containing manual controls/results`);
}

cleanupManualAudits()
  .catch((error) => console.error(error))
  .finally(() => prisma.$disconnect());
