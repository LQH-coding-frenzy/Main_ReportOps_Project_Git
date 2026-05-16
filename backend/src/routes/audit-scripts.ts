import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth';
import { requireCapabilityAccess } from '../middleware/rbac';
import { validateAuditScript } from '../services/audit/script-validator';
import { MANUAL_M1_CONTROL_IDS } from '../services/audit/m1-manual-controls';
import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { buildPackMetadata, MANAGED_PACK_IDS, syncSectionPacks } from '../services/audit/pack-registry';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 } });

/**
 * GET /api/audit-scripts/packs
 * List all audit packs.
 */
router.get('/packs', requireAuth, async (_req: Request, res: Response) => {
  try {
    await syncSectionPacks(prisma);

    const packs = await prisma.auditPack.findMany({
      where: { packId: { in: MANAGED_PACK_IDS } },
      orderBy: { ownerSection: 'asc' },
      include: {
        _count: { select: { scripts: true } },
        scripts: {
          where: {
            assessmentType: { not: 'Manual' },
            controlId: { notIn: [...MANUAL_M1_CONTROL_IDS] },
          },
          select: {
            id: true,
            controlId: true,
            title: true,
            section: true,
            assessmentType: true,
            risk: true,
            enabled: true,
            validations: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: {
                id: true,
                valid: true,
                warningsJson: true,
                errorsJson: true,
                createdAt: true,
              },
            },
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
router.post('/packs', requireAuth, requireCapabilityAccess('manage_audit_packs'), async (req: Request, res: Response) => {
  try {
    const { ownerSection, title, sections, benchmarkName, benchmarkVersion, profile, isPlaceholder } = req.body;
    const metadata = buildPackMetadata(String(ownerSection || 'M1'));

    if (!metadata) {
      res.status(400).json({ error: 'Invalid ownerSection', status: 400 });
      return;
    }

    const pack = await prisma.auditPack.upsert({
      where: { packId: metadata.packId },
      create: {
        packId: metadata.packId,
        ownerSection: metadata.ownerSection,
        title: title || metadata.title,
        sections: sections || metadata.sections,
        benchmarkName: benchmarkName || 'CIS AlmaLinux OS 9 Benchmark',
        benchmarkVersion: benchmarkVersion || '2.0.0',
        profile: profile || 'Level 1 - Server',
        manifestPath: metadata.manifestPath,
        auditScriptPath: metadata.auditScriptPath,
        remediationPath: metadata.remediationPath,
        isPlaceholder: typeof isPlaceholder === 'boolean' ? isPlaceholder : metadata.isPlaceholder,
      },
      update: {
        title: title || metadata.title,
        sections: sections || metadata.sections,
        manifestPath: metadata.manifestPath,
        auditScriptPath: metadata.auditScriptPath,
        remediationPath: metadata.remediationPath,
        isPlaceholder: typeof isPlaceholder === 'boolean' ? isPlaceholder : metadata.isPlaceholder,
        enabled: true,
      },
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
  requireCapabilityAccess('manage_audit_packs'),
  upload.single('script'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as unknown as { user: { id: number } }).user.id;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No script file uploaded', status: 400 });
      }

      const { packId, controlId, title, section, risk } = req.body;
      if (!packId || !controlId || !title || !section) {
        return res.status(400).json({ error: 'Missing required fields: packId, controlId, title, section', status: 400 });
      }

      await syncSectionPacks(prisma);

      const pack = await prisma.auditPack.findUnique({ where: { packId: String(packId) } });
      if (!pack) {
        return res.status(404).json({ error: 'Audit pack not found', status: 404 });
      }

      // Validate script
      const validation = validateAuditScript(file.originalname, file.buffer, controlId, {
        allowedSections: pack.sections,
      });

      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors.join(' '), status: 400 });
      }

      // Calculate SHA-256
      const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

      await prisma.auditPack.update({
        where: { id: pack.id },
        data: { enabled: true, isPlaceholder: false },
      });

      // Upload to Supabase storage
      const storagePath = `audit-scripts/${pack.ownerSection}/${controlId}.sh`;
      const { error: uploadError } = await supabase.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
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
          assessmentType: 'Automated',
          risk: risk || 'medium',
          scriptStoragePath: storagePath,
          scriptSha256: sha256,
          createdById: userId,
        },
        update: {
          title,
          section,
          assessmentType: 'Automated',
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
router.patch('/:id/toggle', requireAuth, requireCapabilityAccess('manage_audit_packs'), async (req: Request, res: Response) => {
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
