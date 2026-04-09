import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';
import { buildPreviewReport } from '../services/report-generator';
import { getSignedUrl } from '../services/storage';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/reports/preview
 * Trigger a preview report build (leader only).
 */
router.post('/preview', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const result = await buildPreviewReport(req.user!.id);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'generate_report',
        details: {
          buildId: result.buildId,
          buildType: 'preview',
          status: result.status,
        },
      },
    });

    res.json({
      data: result,
      status: 200,
    });
  } catch (error) {
    console.error('Build preview error:', error);
    res.status(500).json({ error: 'Failed to build preview', status: 500 });
  }
});

/**
 * GET /api/reports
 * List all report builds (leader only).
 */
router.get('/', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const builds = await prisma.reportBuild.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        triggeredBy: {
          select: { id: true, displayName: true, githubUsername: true },
        },
        release: true,
      },
    });

    res.json({
      data: builds.map((b) => ({
        id: b.id,
        buildType: b.buildType,
        status: b.status,
        storageKeyDocx: b.storageKeyDocx,
        storageKeyPdf: b.storageKeyPdf,
        triggeredBy: b.triggeredBy,
        release: b.release,
        createdAt: b.createdAt,
        completedAt: b.completedAt,
      })),
      status: 200,
    });
  } catch (error) {
    console.error('List reports error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/reports/:id
 * Get a report build detail with download link.
 */
router.get('/:id', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const buildId = parseInt(req.params.id, 10);

    const build = await prisma.reportBuild.findUnique({
      where: { id: buildId },
      include: {
        triggeredBy: {
          select: { id: true, displayName: true, githubUsername: true },
        },
        release: true,
      },
    });

    if (!build) {
      res.status(404).json({ error: 'Report build not found', status: 404 });
      return;
    }

    // Generate download URLs
    let downloadUrlDocx = null;
    let downloadUrlPdf = null;

    if (build.storageKeyDocx) {
      downloadUrlDocx = await getSignedUrl(build.storageKeyDocx, 3600);
    }
    if (build.storageKeyPdf) {
      downloadUrlPdf = await getSignedUrl(build.storageKeyPdf, 3600);
    }

    res.json({
      data: {
        ...build,
        downloadUrlDocx,
        downloadUrlPdf,
      },
      status: 200,
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
