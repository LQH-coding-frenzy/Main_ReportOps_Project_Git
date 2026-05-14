import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';
import { AuditJobExecutor } from '../services/audit/job-executor';
import { purgeAuditJobArtifacts } from '../services/audit/archive-cleanup';
import { MANUAL_M1_CONTROL_IDS } from '../services/audit/m1-manual-controls';
import { env } from '../config/env';
import { supabase } from '../config/supabase';

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

function automatedScriptFilter(ownerSection: string) {
  return {
    enabled: true,
    assessmentType: { not: 'Manual' },
    controlId: { notIn: [...MANUAL_M1_CONTROL_IDS] },
    pack: { ownerSection, enabled: true },
  };
}

/**
 * GET /api/audit-jobs
 * List audit jobs with pagination.
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
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
router.get('/stats/summary', requireAuth, async (_req: Request, res: Response) => {
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
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
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
router.post('/', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const { vmId, mode, ownerSection } = req.body;
    const userId = (req as unknown as { user: { id: number } }).user.id;

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

    const job = await prisma.auditJob.create({
      data: {
        vmId,
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
        details: { jobId: job.id, vmId, mode: mode || 'SCRIPTS_ONLY' },
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
 * POST /api/audit-jobs/:id/cancel
 * Cancel a pending or running audit job.
 */
router.post('/:id/cancel', requireAuth, requireLeader, async (req: Request, res: Response) => {
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
router.delete('/:id', requireAuth, requireLeader, async (req: Request, res: Response) => {
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
router.get('/:id/logs', requireAuth, async (req: Request, res: Response) => {
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
router.get('/:id/evidence/:evidenceId', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const evidenceId = parseInt(req.params.evidenceId, 10);

    const evidence = await prisma.auditEvidence.findUnique({
      where: { id: evidenceId },
    });

    if (!evidence || evidence.auditJobId !== id) {
      return res.status(404).json({ error: 'Evidence not found', status: 404 });
    }

    const data = await downloadFromAnyBucket(evidence.storagePath);

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
router.get('/:id/evidence', requireAuth, async (req: Request, res: Response) => {
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
