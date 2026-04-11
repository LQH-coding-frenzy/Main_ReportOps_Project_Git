import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';
import { buildPreviewReport } from '../services/report-generator';
import { getSignedUrl, uploadFile } from '../services/storage';
import { env } from '../config/env';
import { getCanonicalDocxStorageKey } from '../services/report-artifacts';

const router = Router();
const prisma = new PrismaClient();
const MAX_CANONICAL_DOCX_BYTES = 80 * 1024 * 1024;

interface CanonicalizeDocxRequestBody {
  downloadUrl?: unknown;
}

function isDefaultPort(protocol: string, port: string): boolean {
  if (!port) return true;
  if (protocol === 'https:' && port === '443') return true;
  if (protocol === 'http:' && port === '80') return true;

  return false;
}

function isAllowedOnlyOfficeDownloadUrl(rawUrl: string): boolean {
  try {
    const configured = new URL(env.ONLYOFFICE_DOCUMENT_SERVER_URL);
    const candidate = new URL(rawUrl);

    if (candidate.protocol !== configured.protocol) {
      return false;
    }

    if (candidate.hostname.toLowerCase() !== configured.hostname.toLowerCase()) {
      return false;
    }

    if (configured.port) {
      return candidate.port === configured.port;
    }

    return isDefaultPort(candidate.protocol, candidate.port);
  } catch {
    return false;
  }
}

async function downloadOnlyOfficeDocx(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ONLYOFFICE download failed with HTTP ${response.status}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = Number.parseInt(contentLengthHeader || '', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_CANONICAL_DOCX_BYTES) {
    throw new Error('Downloaded DOCX is too large');
  }

  const arrayBuffer = await response.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  if (fileBuffer.length === 0) {
    throw new Error('Downloaded DOCX is empty');
  }

  if (fileBuffer.length > MAX_CANONICAL_DOCX_BYTES) {
    throw new Error('Downloaded DOCX exceeds allowed size limit');
  }

  return fileBuffer;
}

/**
 * POST /api/reports/preview
 * Trigger a preview report build (leader only).
 */
router.post('/preview', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const result = await buildPreviewReport(req.user!.id);

    if (!result.reusedExisting) {
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
    }

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
        buildLog: b.buildLog,
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
 * GET /api/reports/performance
 * Get performance metrics for leaders.
 */
router.get('/performance', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        assignments: true,
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    const totalSectionsCount = await prisma.section.count();

    const performance = users.map((u) => {
      const editLogs = u.auditLogs.filter((l) => l.action === 'save_document' || l.action === 'edit_section');
      const lastActive = u.auditLogs[0]?.createdAt || null;

      return {
        id: u.id,
        displayName: u.displayName,
        githubUsername: u.githubUsername,
        avatarUrl: u.avatarUrl,
        role: u.role,
        stats: {
          assignedSections: u.assignments.length,
          totalEdits: editLogs.length,
          lastActive,
        },
      };
    });

    res.json({
      data: {
        users: performance,
        totalSections: totalSectionsCount,
      },
      status: 200,
    });
  } catch (error) {
    console.error('Performance analytics error:', error);
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
    if (Number.isNaN(buildId)) {
      res.status(400).json({ error: 'Invalid report build id', status: 400 });
      return;
    }

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

/**
 * POST /api/reports/:id/canonicalize-docx
 * Canonicalize DOCX via ONLYOFFICE download pipeline, then persist artifact in storage.
 */
router.post('/:id/canonicalize-docx', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const buildId = parseInt(req.params.id, 10);
    if (Number.isNaN(buildId)) {
      res.status(400).json({ error: 'Invalid report build id', status: 400 });
      return;
    }

    const { downloadUrl: downloadUrlRaw } = (req.body || {}) as CanonicalizeDocxRequestBody;
    if (typeof downloadUrlRaw !== 'string' || downloadUrlRaw.trim().length === 0) {
      res.status(400).json({ error: 'downloadUrl is required', status: 400 });
      return;
    }

    if (!isAllowedOnlyOfficeDownloadUrl(downloadUrlRaw)) {
      res.status(400).json({ error: 'downloadUrl must be an ONLYOFFICE server URL', status: 400 });
      return;
    }

    const build = await prisma.reportBuild.findUnique({ where: { id: buildId } });
    if (!build) {
      res.status(404).json({ error: 'Report build not found', status: 404 });
      return;
    }

    if (build.status !== 'completed') {
      res.status(400).json({ error: 'Only completed report builds can be canonicalized', status: 400 });
      return;
    }

    const canonicalStorageKey = getCanonicalDocxStorageKey(build.id, build.buildType);
    const fileBuffer = await downloadOnlyOfficeDocx(downloadUrlRaw);

    await uploadFile(canonicalStorageKey, fileBuffer);
    await prisma.reportBuild.update({
      where: { id: build.id },
      data: {
        storageKeyDocx: canonicalStorageKey,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'canonicalize_report_docx',
        details: {
          buildId: build.id,
          buildType: build.buildType,
          fileSize: fileBuffer.length,
          storageKeyDocx: canonicalStorageKey,
        },
      },
    });

    const signedDownloadUrl = await getSignedUrl(canonicalStorageKey, 3600);

    res.json({
      data: {
        buildId: build.id,
        storageKeyDocx: canonicalStorageKey,
        downloadUrl: signedDownloadUrl,
        canonicalized: true,
        fileSize: fileBuffer.length,
      },
      status: 200,
    });
  } catch (error) {
    console.error('Canonicalize report DOCX error:', error);
    res.status(500).json({ error: 'Failed to canonicalize DOCX via ONLYOFFICE', status: 500 });
  }
});

/**
 * DELETE /api/reports/:id
 * Delete a report build (leader only).
 */
router.delete('/:id', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const buildId = parseInt(req.params.id, 10);
    const { deleteReportBuild } = await import('../services/report-generator');
    
    await deleteReportBuild(buildId);

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'delete_report',
        details: { buildId },
      },
    });

    res.json({ data: { success: true }, status: 200 });
  } catch (error) {
    console.error('Delete report error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete report';
    res.status(400).json({ error: msg, status: 400 });
  }
});

export default router;
