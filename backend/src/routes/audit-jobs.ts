import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { requireAuth } from '../middleware/auth';
import { requireCapabilityAccess } from '../middleware/rbac';
import { AuditJobExecutor } from '../services/audit/job-executor';
import { purgeAuditJobArtifacts } from '../services/audit/archive-cleanup';
import { MANUAL_M1_CONTROL_IDS } from '../services/audit/m1-manual-controls';
import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { buildPackMetadata, syncSectionPacks } from '../services/audit/pack-registry';
import { ensureSectionRuntimeScripts } from '../services/audit/runtime-script-registry';

const router = Router();
const prisma = new PrismaClient();

const evidenceBuckets = [env.SUPABASE_ARCHIVE_BUCKET, env.SUPABASE_STORAGE_BUCKET];

async function downloadFromAnyBucket(storagePath: string): Promise<Blob | null> {
  for (const bucket of evidenceBuckets) {
    const { data, error } = await supabase.storage.from(bucket).download(storagePath);

    if (!error && data) {
      return data;
    }
  }

  return null;
}

async function restoreDashboardArtifactIfMissing(evidence: {
  id: number;
  auditJobId: number;
  artifactType: string;
  storagePath: string;
  mimeType: string | null;
}): Promise<boolean> {
  if (evidence.artifactType !== 'DASHBOARD_PDF' && evidence.artifactType !== 'DASHBOARD_SCREENSHOT') {
    return false;
  }

  const htmlEvidence = await prisma.auditEvidence.findFirst({
    where: {
      auditJobId: evidence.auditJobId,
      artifactType: 'DASHBOARD_HTML',
    },
  });

  if (!htmlEvidence) {
    return false;
  }

  const htmlBlob = await downloadFromAnyBucket(htmlEvidence.storagePath);
  if (!htmlBlob) {
    return false;
  }

  const tempHtmlPath = path.join(os.tmpdir(), `dashboard-restore-${evidence.auditJobId}-${Date.now()}.html`);
  fs.writeFileSync(tempHtmlPath, await htmlBlob.text(), 'utf-8');

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const buffer = evidence.artifactType === 'DASHBOARD_PDF'
      ? await page.pdf({ format: 'A4', printBackground: true })
      : await page.screenshot({ fullPage: true });

    const contentType = evidence.artifactType === 'DASHBOARD_PDF' ? 'application/pdf' : 'image/png';
    const { error } = await supabase.storage.from(env.SUPABASE_ARCHIVE_BUCKET).upload(evidence.storagePath, buffer, {
      contentType,
      upsert: true,
    });

    if (error) {
      console.error('Restore dashboard artifact upload error:', error);
      return false;
    }

    await prisma.auditEvidence.update({
      where: { id: evidence.id },
      data: {
        mimeType: evidence.mimeType || contentType,
        sizeBytes: buffer.length,
      },
    });

    return true;
  } catch (error) {
    console.error('Restore dashboard artifact render error:', error);
    return false;
  } finally {
    await browser.close();
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
}

function automatedScriptFilter(ownerSection: string) {
  return {
    enabled: true,
    assessmentType: { not: 'Manual' },
    controlId: { notIn: [...MANUAL_M1_CONTROL_IDS] },
    pack: { ownerSection, enabled: true },
  };
}

type VmOpsOperationType = 'REMEDIATION' | 'NOT_APPLICABLE_FIX' | 'REVERSE_REMEDIATE';

const VM_OPS_OPERATION_TYPES: VmOpsOperationType[] = ['REMEDIATION', 'NOT_APPLICABLE_FIX', 'REVERSE_REMEDIATE'];

function isVmOpsOperationType(value: string): value is VmOpsOperationType {
  return VM_OPS_OPERATION_TYPES.includes(value as VmOpsOperationType);
}

function getEligibleStatuses(operationType: VmOpsOperationType): string[] {
  switch (operationType) {
    case 'REMEDIATION':
      return ['FAIL'];
    case 'NOT_APPLICABLE_FIX':
      return ['NOT_APPLICABLE'];
    case 'REVERSE_REMEDIATE':
      return ['PASS'];
    default:
      return [];
  }
}

function getOperationAction(operationType: VmOpsOperationType): string {
  switch (operationType) {
    case 'REMEDIATION':
      return 'create_remediation_job';
    case 'NOT_APPLICABLE_FIX':
      return 'create_not_applicable_fix_job';
    case 'REVERSE_REMEDIATE':
      return 'create_reverse_remediate_job';
    default:
      return 'create_vm_ops_job';
  }
}

async function createVmOpsOperationJob(input: {
  sourceJobId: number;
  userId: number;
  ipAddress: string | undefined;
  operationType: VmOpsOperationType;
  selectedControlIds?: string[];
}) {
  const sourceJob = await prisma.auditJob.findUnique({
    where: { id: input.sourceJobId },
    include: {
      scriptRuns: {
        orderBy: { controlId: 'asc' },
      },
    },
  });

  if (!sourceJob) {
    return { error: 'Audit job not found', status: 404 as const };
  }

  if (sourceJob.jobType !== 'AUDIT') {
    return { error: 'Only audit jobs can trigger VM Ops operations', status: 400 as const };
  }

  if (sourceJob.status !== 'COMPLETED') {
    return { error: 'Wait for the source audit job to complete before running VM Ops operations', status: 400 as const };
  }

  const allowedSectionsForVmOps = ['M1', 'M2', 'M3', 'M4'];
  if (!allowedSectionsForVmOps.includes(sourceJob.ownerSection)) {
    return { error: `VM Ops runtime is not available for section ${sourceJob.ownerSection}`, status: 400 as const };
  }

  const vm = await prisma.labVm.findUnique({ where: { id: sourceJob.vmId } });
  if (!vm || vm.status !== 'RUNNING') {
    return { error: 'Lab VM is not running', status: 400 as const };
  }

  const eligibleStatuses = getEligibleStatuses(input.operationType);
  const eligibleControlIds = sourceJob.scriptRuns
    .filter((run) => eligibleStatuses.includes(run.status))
    .map((run) => run.controlId);

  if (eligibleControlIds.length === 0) {
    return {
      error: `Source audit job does not contain any controls eligible for ${input.operationType}`,
      status: 400 as const,
    };
  }

  const requestedControlIds = (input.selectedControlIds || []).filter((value, index, list) => value && list.indexOf(value) === index);
  const selectedControlIds = requestedControlIds.length > 0 ? requestedControlIds : eligibleControlIds;
  const invalidControlIds = selectedControlIds.filter((controlId) => !eligibleControlIds.includes(controlId));

  if (invalidControlIds.length > 0) {
    return {
      error: `Selected controls are not eligible for ${input.operationType}: ${invalidControlIds.join(', ')}`,
      status: 400 as const,
    };
  }

  const operationJob = await prisma.auditJob.create({
    data: {
      vmId: sourceJob.vmId,
      jobType: input.operationType,
      mode: 'SCRIPTS_ONLY',
      ownerSection: sourceJob.ownerSection,
      totalControls: selectedControlIds.length,
      triggeredById: input.userId,
      status: 'PENDING',
      summaryJson: {
        operationContext: {
          sourceJobId: sourceJob.id,
          operationType: input.operationType,
          selectedControlIds,
          requestedById: input.userId,
          requestedAt: new Date().toISOString(),
        },
      },
    },
    include: {
      vm: { select: { id: true, name: true, publicIp: true } },
      triggeredBy: { select: { id: true, displayName: true, githubUsername: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: getOperationAction(input.operationType),
      details: {
        sourceJobId: sourceJob.id,
        vmOpsJobId: operationJob.id,
        ownerSection: sourceJob.ownerSection,
        operationType: input.operationType,
        selectedControlIds,
      },
      ipAddress: input.ipAddress,
    },
  });

  const executor = new AuditJobExecutor(operationJob.id);
  executor.execute().catch((err) => {
    console.error(`Background VM Ops executor failed for Job ${operationJob.id}:`, err);
  });

  return { job: operationJob, status: 201 as const };
}

/**
 * GET /api/audit-jobs
 * List audit jobs with pagination.
 */
router.get('/', requireAuth, requireCapabilityAccess('view_archive'), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.auditJob.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          vm: { select: { id: true, name: true, publicIp: true, status: true } },
          triggeredBy: {
            select: { id: true, displayName: true, githubUsername: true, avatarUrl: true },
          },
          _count: { select: { scriptRuns: true, evidences: true } },
        },
      }),
      prisma.auditJob.count(),
    ]);

    res.json({
      data: { jobs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      status: 200,
    });
  } catch (error) {
    console.error('List audit jobs error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/audit-jobs/stats/summary
 * Get aggregate audit statistics.
 */
router.get('/stats/summary', requireAuth, requireCapabilityAccess('view_archive'), async (_req: Request, res: Response) => {
  try {
    const [totalJobs, completedJobs, latestJob] = await Promise.all([
      prisma.auditJob.count(),
      prisma.auditJob.count({ where: { status: 'COMPLETED' } }),
      prisma.auditJob.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { finishedAt: 'desc' },
        select: { id: true, score: true, riskLevel: true, finishedAt: true, passCount: true, failCount: true },
      }),
    ]);

    res.json({
      data: { totalJobs, completedJobs, latestJob },
      status: 200,
    });
  } catch (error) {
    console.error('Audit stats error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/audit-jobs/:id
 * Get single audit job with full results.
 */
router.get('/:id', requireAuth, requireCapabilityAccess('view_archive'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const job = await prisma.auditJob.findUnique({
      where: { id },
      include: {
        vm: { select: { id: true, name: true, publicIp: true, status: true, gcpZone: true } },
        triggeredBy: {
          select: { id: true, displayName: true, githubUsername: true, avatarUrl: true },
        },
        scriptRuns: {
          orderBy: { controlId: 'asc' },
          include: {
            script: { select: { id: true, controlId: true, title: true, section: true, assessmentType: true, risk: true } },
          },
        },
        evidences: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Audit job not found', status: 404 });
    }

    res.json({ data: job, status: 200 });
  } catch (error) {
    console.error('Get audit job error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * POST /api/audit-jobs
 * Create a new audit job (leader only).
 */
router.post('/', requireAuth, requireCapabilityAccess('run_audits'), async (req: Request, res: Response) => {
  try {
    const { vmId, mode, ownerSection, jobType } = req.body;
    const userId = (req as unknown as { user: { id: number } }).user.id;

    if (jobType && jobType !== 'AUDIT') {
      return res.status(400).json({ error: 'Use the VM Ops operation endpoints for non-audit jobs', status: 400 });
    }

    await syncSectionPacks(prisma);
    await ensureSectionRuntimeScripts(prisma, ownerSection || 'M1', userId);

    const targetPackMetadata = buildPackMetadata(ownerSection || 'M1');
    if (!targetPackMetadata) {
      return res.status(400).json({ error: 'Invalid ownerSection', status: 400 });
    }

    const targetPack = await prisma.auditPack.findFirst({
      where: { packId: targetPackMetadata.packId },
    });

    if (!targetPack) {
      return res.status(404).json({ error: 'Audit pack not found for ownerSection', status: 404 });
    }

    // Validate VM exists and is running
    const vm = await prisma.labVm.findUnique({ where: { id: vmId } });
    if (!vm) {
      return res.status(404).json({ error: 'Lab VM not found', status: 404 });
    }
    if (vm.status !== 'RUNNING') {
      return res.status(400).json({ error: 'Lab VM is not running', status: 400 });
    }

    // Count active scripts
    const scriptCount = await prisma.auditScript.count({
      where: {
        ...automatedScriptFilter(ownerSection || 'M1'),
      },
    });

    if (targetPack.isPlaceholder) {
      return res.status(400).json({
        error: `Audit pack ${ownerSection || 'M1'} hiện mới là placeholder và chưa sẵn sàng để chạy`,
        status: 400,
      });
    }

    if (mode !== 'OPENSCAP_ONLY' && scriptCount === 0) {
      return res.status(400).json({
        error: `Audit pack ${ownerSection || 'M1'} chưa có script automated sẵn sàng`,
        status: 400,
      });
    }

    const job = await prisma.auditJob.create({
      data: {
        vmId,
        jobType: 'AUDIT',
        mode: mode || 'SCRIPTS_ONLY',
        ownerSection: ownerSection || 'M1',
        totalControls: scriptCount,
        triggeredById: userId,
        status: 'PENDING',
      },
      include: {
        vm: { select: { id: true, name: true, publicIp: true } },
        triggeredBy: { select: { id: true, displayName: true, githubUsername: true } },
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'create_audit_job',
        details: { jobId: job.id, vmId, mode: mode || 'SCRIPTS_ONLY', ownerSection: ownerSection || 'M1', jobType: 'AUDIT' },
        ipAddress: req.ip,
        },
      });

    // Trigger executor asynchronously
    const executor = new AuditJobExecutor(job.id);
    executor.execute().catch((err) => {
      console.error(`Background executor failed for Job ${job.id}:`, err);
    });

    res.status(201).json({ data: job, status: 201 });
  } catch (error) {
    console.error('Create audit job error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * POST /api/audit-jobs/:id/operations
 * Create a VM Ops operation job from a completed audit job.
 */
router.post('/:id/operations', requireAuth, requireCapabilityAccess('run_remediation'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = (req as unknown as { user: { id: number } }).user.id;
    const { operationType, selectedControlIds } = req.body;

    if (!isVmOpsOperationType(String(operationType || ''))) {
      return res.status(400).json({ error: 'Invalid VM Ops operation type', status: 400 });
    }

    const result = await createVmOpsOperationJob({
      sourceJobId: id,
      userId,
      ipAddress: req.ip,
      operationType,
      selectedControlIds: Array.isArray(selectedControlIds)
        ? selectedControlIds.filter((value): value is string => typeof value === 'string')
        : undefined,
    });

    if ('error' in result) {
      return res.status(result.status).json({ error: result.error, status: result.status });
    }

    res.status(201).json({ data: result.job, status: result.status });
  } catch (error) {
    console.error('Create VM Ops job error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

router.post('/:id/remediate', requireAuth, requireCapabilityAccess('run_remediation'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = (req as unknown as { user: { id: number } }).user.id;
    const selectedControlIds = Array.isArray(req.body?.selectedControlIds)
      ? req.body.selectedControlIds.filter((value: unknown): value is string => typeof value === 'string')
      : undefined;

    const result = await createVmOpsOperationJob({
      sourceJobId: id,
      userId,
      ipAddress: req.ip,
      operationType: 'REMEDIATION',
      selectedControlIds,
    });

    if ('error' in result) {
      return res.status(result.status).json({ error: result.error, status: result.status });
    }

    res.status(201).json({ data: result.job, status: result.status });
  } catch (error) {
    console.error('Create remediation job error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

router.post('/:id/cancel', requireAuth, requireCapabilityAccess('run_audits'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = (req as unknown as { user: { id: number } }).user.id;
    const job = await prisma.auditJob.findUnique({ where: { id } });

    if (!job) {
      return res.status(404).json({ error: 'Audit job not found', status: 404 });
    }

    if (job.status !== 'PENDING' && job.status !== 'RUNNING') {
      return res.status(400).json({ error: 'Only pending or running jobs can be cancelled', status: 400 });
    }

    const finishedAt = new Date();
    const durationMs = job.startedAt ? finishedAt.getTime() - job.startedAt.getTime() : null;

    const updated = await prisma.auditJob.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        finishedAt,
        durationMs,
        errorMessage: 'Cancelled by user',
      },
    });

    AuditJobExecutor.requestCancel(id);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'cancel_audit_job',
        details: { jobId: id },
        ipAddress: req.ip,
      },
    });

    res.json({ data: updated, status: 200 });
  } catch (error) {
    console.error('Cancel audit job error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * DELETE /api/audit-jobs/:id
 * Delete a completed historical audit job and its archive artifacts.
 */
router.delete('/:id', requireAuth, requireCapabilityAccess('run_audits'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = (req as unknown as { user: { id: number } }).user.id;
    const job = await prisma.auditJob.findUnique({ where: { id } });

    if (!job) {
      return res.status(404).json({ error: 'Audit job not found', status: 404 });
    }

    if (job.status === 'PENDING' || job.status === 'RUNNING') {
      return res.status(400).json({ error: 'Running jobs must be cancelled before deletion', status: 400 });
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'delete_audit_job',
        details: { jobId: id, status: job.status },
        ipAddress: req.ip,
      },
    });

    await purgeAuditJobArtifacts(prisma, id);

    res.json({ data: { deleted: true }, status: 200 });
  } catch (error) {
    console.error('Delete audit job error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/audit-jobs/:id/logs
 * Get the raw execution logs from Supabase.
 */
router.get('/:id/logs', requireAuth, requireCapabilityAccess('view_archive'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const logPath = `archives/audits/${id}/audit-log.txt`;
    const data = await downloadFromAnyBucket(logPath);

    if (!data) {
      return res.status(404).json({ error: 'Log file not found', status: 404 });
    }

    const logContent = await data.text();
    res.json({ data: { content: logContent }, status: 200 });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/audit-jobs/:id/evidence/:evidenceId
 * Get a specific evidence artifact file.
 */
router.get('/:id/evidence/:evidenceId', requireAuth, requireCapabilityAccess('view_archive'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const evidenceId = parseInt(req.params.evidenceId, 10);

    const evidence = await prisma.auditEvidence.findUnique({
      where: { id: evidenceId },
    });

    if (!evidence || evidence.auditJobId !== id) {
      return res.status(404).json({ error: 'Evidence not found', status: 404 });
    }

    let data = await downloadFromAnyBucket(evidence.storagePath);

    if (!data) {
      const restored = await restoreDashboardArtifactIfMissing(evidence);
      if (restored) {
        data = await downloadFromAnyBucket(evidence.storagePath);
      }
    }

    if (!data) {
      return res.status(404).json({ error: 'Evidence file not found in storage', status: 404 });
    }

    // Set content type and send buffer
    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', evidence.mimeType || 'application/octet-stream');
    res.send(buffer);
  } catch (error) {
    console.error('Get audit evidence error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/audit-jobs/:id/evidence
 * List evidence artifacts for a job.
 */
router.get('/:id/evidence', requireAuth, requireCapabilityAccess('view_archive'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const evidences = await prisma.auditEvidence.findMany({
      where: { auditJobId: id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: evidences, status: 200 });
  } catch (error) {
    console.error('List audit evidence error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
