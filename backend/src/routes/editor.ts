import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireSectionAccess } from '../middleware/rbac';
import { generateEditorConfig, CallbackStatus } from '../services/onlyoffice';
import { getSignedUrl, downloadFromUrl, uploadFile, fileExists, createEmptyDocx } from '../services/storage';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/editor/config/:sectionId
 * Generate ONLYOFFICE editor configuration for a section.
 */
router.get(
  '/config/:sectionId',
  requireAuth,
  requireSectionAccess('sectionId'),
  async (req: Request, res: Response) => {
    try {
      const sectionId = parseInt(req.params.sectionId, 10);
      const user = req.user!;

      const section = await prisma.section.findUnique({
        where: { id: sectionId },
        include: { documents: true, assignments: true },
      });

      if (!section) {
        res.status(404).json({ error: 'Section not found', status: 404 });
        return;
      }

      const doc = section.documents[0];
      if (!doc) {
        res.status(404).json({ error: 'Document not found for section', status: 404 });
        return;
      }

      // Check if file exists in storage, create empty one if not
      const exists = await fileExists(doc.currentStorageKey);
      if (!exists) {
        const emptyDocx = createEmptyDocx();
        await uploadFile(doc.currentStorageKey, emptyDocx);
      }

      // Generate signed URL for ONLYOFFICE to fetch the document
      const fileUrl = await getSignedUrl(doc.currentStorageKey, 7200); // 2 hour expiry

      // Determine edit permission
      const isAssigned = section.assignments.some((a) => a.userId === user.id);
      const canEdit = user.role === 'LEADER' || isAssigned;

      const config = generateEditorConfig({
        fileUrl,
        fileKey: doc.currentStorageKey,
        fileName: doc.fileName,
        userId: user.id,
        userName: user.displayName || user.githubUsername,
        sectionId: section.id,
        canEdit,
        updatedAt: doc.updatedAt.getTime().toString(),
      });

      res.json({
        data: {
          config,
          documentServerUrl: env.ONLYOFFICE_DOCUMENT_SERVER_URL,
          section: {
            id: section.id,
            code: section.code,
            title: section.title,
          },
        },
        status: 200,
      });
    } catch (error) {
      console.error('Editor config error:', error);
      res.status(500).json({ error: 'Failed to generate editor config', status: 500 });
    }
  }
);

/**
 * POST /api/onlyoffice/callback
 * Handle ONLYOFFICE Document Server save callbacks.
 *
 * @see https://api.onlyoffice.com/editors/callback
 */
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const { status, url, key, users } = req.body;
    const sectionId = parseInt(req.query.sectionId as string, 10);

    if (isNaN(sectionId)) {
      // ONLYOFFICE expects { error: 0 } for success
      res.json({ error: 0 });
      return;
    }

    // Handle save events
    if (status === CallbackStatus.READY_FOR_SAVE || status === CallbackStatus.FORCE_SAVE) {
      if (!url) {
        console.error('ONLYOFFICE callback: No URL provided for save');
        res.json({ error: 0 });
        return;
      }

      // Download the saved document from ONLYOFFICE
      const fileBuffer = await downloadFromUrl(url);

      // Get current document
      const doc = await prisma.document.findUnique({
        where: { sectionId },
      });

      if (!doc) {
        console.error(`ONLYOFFICE callback: No document for section ${sectionId}`);
        res.json({ error: 0 });
        return;
      }

      // Determine who edited (from ONLYOFFICE users array)
      const editorUserId = users && users.length > 0 ? parseInt(users[0], 10) : null;

      // Create version snapshot before overwriting
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const section = await prisma.section.findUnique({ where: { id: sectionId } });
      const versionKey = `sections/${section?.code || sectionId}/versions/${timestamp}.docx`;

      await uploadFile(versionKey, fileBuffer);

      // Overwrite current document
      await uploadFile(doc.currentStorageKey, fileBuffer);

      // Update document metadata
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          fileSize: fileBuffer.length,
          lastEditedAt: new Date(),
          lastEditedBy: editorUserId,
        },
      });

      // Create version record
      if (editorUserId) {
        await prisma.documentVersion.create({
          data: {
            documentId: doc.id,
            storageKey: versionKey,
            versionLabel: status === CallbackStatus.FORCE_SAVE ? 'auto-save' : 'save',
            fileSize: fileBuffer.length,
            editedById: editorUserId,
          },
        });
      }

      // Audit log
      if (editorUserId) {
        await prisma.auditLog.create({
          data: {
            userId: editorUserId,
            action: 'save_document',
            details: {
              sectionId,
              sectionCode: section?.code,
              fileSize: fileBuffer.length,
              saveType: status === CallbackStatus.FORCE_SAVE ? 'force_save' : 'close_save',
            },
          },
        });
      }

      console.log(
        `📝 Document saved: section=${section?.code}, size=${fileBuffer.length}, user=${editorUserId}`
      );
    }

    // ONLYOFFICE expects { error: 0 } for success
    res.json({ error: 0 });
  } catch (error) {
    console.error('ONLYOFFICE callback error:', error);
    // Still return { error: 0 } to prevent ONLYOFFICE from retrying
    res.json({ error: 0 });
  }
});

export default router;
