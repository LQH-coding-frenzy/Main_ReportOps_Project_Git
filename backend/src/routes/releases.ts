import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';
import { createGitHubRelease } from '../services/github-release';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/releases/freeze
 * Freeze a preview build into a final release and create a GitHub Release.
 */
router.post('/freeze', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const { reportBuildId, version, notes } = req.body;

    if (!reportBuildId || !version) {
      res.status(400).json({
        error: 'reportBuildId and version are required',
        status: 400,
      });
      return;
    }

    // Check if version already exists
    const existing = await prisma.release.findFirst({
      where: { version },
    });
    if (existing) {
      res.status(409).json({
        error: `Release ${version} already exists`,
        status: 409,
      });
      return;
    }

    const result = await createGitHubRelease(reportBuildId, version, notes || '');

    if (!result.success) {
      res.status(500).json({
        error: result.error || 'Failed to create release',
        status: 500,
      });
      return;
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'release',
        details: {
          releaseId: result.releaseId,
          version: result.version,
          githubReleaseUrl: result.githubReleaseUrl,
        },
      },
    });

    res.status(200).json({
      data: result,
      status: 200,
    });
  } catch (error) {
    console.error('Freeze release error:', error);
    res.status(500).json({ error: 'Failed to create release', status: 500 });
  }
});

/**
 * GET /api/releases
 * List all releases (leader only).
 */
router.get('/', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const releases = await prisma.release.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reportBuild: {
          include: {
            triggeredBy: {
              select: { id: true, displayName: true, githubUsername: true },
            },
          },
        },
      },
    });

    res.json({
      data: releases.map((r) => ({
        id: r.id,
        version: r.version,
        githubReleaseUrl: r.githubReleaseUrl,
        checksum: r.checksum,
        notes: r.notes,
        createdAt: r.createdAt,
        build: {
          id: r.reportBuild.id,
          status: r.reportBuild.status,
          triggeredBy: r.reportBuild.triggeredBy,
          createdAt: r.reportBuild.createdAt,
        },
      })),
      status: 200,
    });
  } catch (error) {
    console.error('List releases error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
