import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';
import { createGitHubRelease, deleteGitHubReleaseByVersion } from '../services/github-release';
import { deleteFile } from '../services/storage';
import { env } from '../config/env';

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

/**
 * DELETE /api/releases/:id
 * Delete a release record (leader only).
 */
router.delete('/:id', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    if (Number.isNaN(releaseId)) {
      res.status(400).json({ error: 'Invalid release id', status: 400 });
      return;
    }

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      include: {
        reportBuild: true,
      },
    });

    if (!release) {
      res.status(404).json({ error: 'Release not found', status: 404 });
      return;
    }

    let githubDeleteResult: { tag: string; releaseDeleted: boolean; tagDeleted: boolean } | null = null;

    if (release.githubReleaseUrl) {
      if (!env.GITHUB_TOKEN) {
        res.status(400).json({
          error: 'GITHUB_TOKEN is required to delete release from GitHub',
          status: 400,
        });
        return;
      }

      githubDeleteResult = await deleteGitHubReleaseByVersion(release.version);
    }

    const buildDocxKey = release.reportBuild.storageKeyDocx;
    const buildPdfKey = release.reportBuild.storageKeyPdf;

    if (buildDocxKey) {
      await deleteFile(buildDocxKey).catch(() => undefined);
    }
    if (buildPdfKey) {
      await deleteFile(buildPdfKey).catch(() => undefined);
    }

    await prisma.$transaction(async (tx) => {
      await tx.release.delete({
        where: { id: release.id },
      });

      await tx.reportBuild.delete({
        where: { id: release.reportBuildId },
      });
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'delete_release',
        details: {
          releaseId,
          reportBuildId: release.reportBuildId,
          version: release.version,
          storageKeyDocx: buildDocxKey,
          storageKeyPdf: buildPdfKey,
          github: githubDeleteResult,
        },
      },
    });

    res.json({ data: { success: true }, status: 200 });
  } catch (error) {
    console.error('Delete release error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: msg, status: 500 });
  }
});

export default router;
