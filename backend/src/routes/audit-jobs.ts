import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';

const router = Router();
const prisma = new PrismaClient();

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
        enabled: true,
        pack: { ownerSection: ownerSection || 'M1', enabled: true },
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

    res.status(201).json({ data: job, status: 201 });
  } catch (error) {
    console.error('Create audit job error:', error);
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

export default router;
