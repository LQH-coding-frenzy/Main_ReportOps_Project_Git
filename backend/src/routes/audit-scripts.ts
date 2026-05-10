import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';
import { validateAuditScript } from '../services/audit/script-validator';
import { supabase } from '../config/supabase';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 } });

/**
 * GET /api/audit-scripts/packs
 * List all audit packs.
 */
router.get('/packs', requireAuth, async (_req: Request, res: Response) => {
  try {
    const packs = await prisma.auditPack.findMany({
      orderBy: { ownerSection: 'asc' },
      include: {
        _count: { select: { scripts: true } },
        scripts: {
          select: {
            id: true, controlId: true, title: true, section: true,
            assessmentType: true, risk: true, enabled: true,
          },
          orderBy: { controlId: 'asc' },
        },
      },
    });
    res.json({ data: packs, status: 200 });
  } catch (error) {
    console.error('List packs error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * POST /api/audit-scripts/packs
 * Create or update an audit pack (leader only).
 */
router.post('/packs', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const { packId, ownerSection, title, sections, benchmarkName, benchmarkVersion, profile } = req.body;

    const pack = await prisma.auditPack.upsert({
      where: { packId },
      create: {
        packId,
        ownerSection: ownerSection || 'M1',
        title,
        sections: sections || [],
        benchmarkName: benchmarkName || 'CIS AlmaLinux OS 9 Benchmark',
        benchmarkVersion: benchmarkVersion || '2.0.0',
        profile: profile || 'Level 1 - Server',
      },
      update: { title, sections, enabled: true },
    });

    res.status(201).json({ data: pack, status: 201 });
  } catch (error) {
    console.error('Create pack error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * POST /api/audit-scripts/upload
 * Upload a .sh script to a pack (leader only).
 */
router.post(
  '/upload',
  requireAuth,
  requireLeader,
  upload.single('script'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as unknown as { user: { id: number } }).user.id;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No script file uploaded', status: 400 });
      }

      const { packId, controlId, title, section, assessmentType, risk } = req.body;
      if (!packId || !controlId || !title || !section) {
        return res.status(400).json({ error: 'Missing required fields: packId, controlId, title, section', status: 400 });
      }

      // Find pack
      const pack = await prisma.auditPack.findFirst({ where: { packId: String(packId) } });
      if (!pack) {
        return res.status(404).json({ error: `Pack "${packId}" not found`, status: 404 });
      }

      // Validate script
      const validation = validateAuditScript(file.originalname, file.buffer, controlId);

      // Calculate SHA-256
      const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

      // Upload to Supabase storage
      const storagePath = `audit-scripts/${pack.ownerSection}/${controlId}.sh`;
      const { error: uploadError } = await supabase.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET || 'reportops-documents')
        .upload(storagePath, file.buffer, {
          contentType: 'text/x-shellscript',
          upsert: true,
        });

      if (uploadError) {
        console.error('Script upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload script to storage', status: 500 });
      }

      // Upsert script record
      const script = await prisma.auditScript.upsert({
        where: { packId_controlId: { packId: pack.id, controlId } },
        create: {
          packId: pack.id,
          controlId,
          title,
          section,
          assessmentType: assessmentType || 'Automated',
          risk: risk || 'medium',
          scriptStoragePath: storagePath,
          scriptSha256: sha256,
          createdById: userId,
        },
        update: {
          title,
          section,
          assessmentType: assessmentType || 'Automated',
          risk: risk || 'medium',
          scriptStoragePath: storagePath,
          scriptSha256: sha256,
        },
      });

      // Save validation result
      await prisma.scriptValidation.create({
        data: {
          scriptId: script.id,
          valid: validation.valid,
          warningsJson: validation.warnings,
          errorsJson: validation.errors,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'upload_audit_script',
          details: { scriptId: script.id, controlId, packId, valid: validation.valid },
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        data: { script, validation },
        status: 201,
      });
    } catch (error) {
      console.error('Upload script error:', error);
      res.status(500).json({ error: 'Internal server error', status: 500 });
    }
  }
);

/**
 * PATCH /api/audit-scripts/:id/toggle
 * Enable/disable a script.
 */
router.patch('/:id/toggle', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const script = await prisma.auditScript.findUnique({ where: { id } });
    if (!script) {
      return res.status(404).json({ error: 'Script not found', status: 404 });
    }

    const updated = await prisma.auditScript.update({
      where: { id },
      data: { enabled: !script.enabled },
    });

    res.json({ data: updated, status: 200 });
  } catch (error) {
    console.error('Toggle script error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/audit-scripts/:id/validation
 * Get latest validation result for a script.
 */
router.get('/:id/validation', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const validation = await prisma.scriptValidation.findFirst({
      where: { scriptId: id },
      orderBy: { createdAt: 'desc' },
    });

    if (!validation) {
      return res.status(404).json({ error: 'No validation found', status: 404 });
    }

    res.json({ data: validation, status: 200 });
  } catch (error) {
    console.error('Get validation error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
