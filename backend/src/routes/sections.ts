import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/sections
 * List all sections. Members see only their assigned sections.
 * Leaders see all sections.
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    let sections;

    if (user.role === 'LEADER') {
      sections = await prisma.section.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  githubUsername: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
          },
          documents: {
            select: {
              id: true,
              fileName: true,
              fileSize: true,
              wordCount: true,
              lastEditedAt: true,
              lastEditedBy: true,
            },
          },
        },
      });
    } else {
      // Member: only their assigned sections
      const assignments = await prisma.sectionAssignment.findMany({
        where: { userId: user.id },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);

      sections = await prisma.section.findMany({
        where: { id: { in: sectionIds } },
        orderBy: { sortOrder: 'asc' },
        include: {
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  githubUsername: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
          },
          documents: {
            select: {
              id: true,
              fileName: true,
              fileSize: true,
              wordCount: true,
              lastEditedAt: true,
              lastEditedBy: true,
            },
          },
        },
      });
    }

    res.json({
      data: sections.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        description: s.description,
        cisChapters: s.cisChapters,
        sortOrder: s.sortOrder,
        assignees: s.assignments.map((a) => a.user),
        document: s.documents[0] || null,
      })),
      status: 200,
    });
  } catch (error) {
    console.error('Get sections error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/sections/:id
 * Get a single section detail.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const sectionId = parseInt(req.params.id, 10);
    if (isNaN(sectionId)) {
      res.status(400).json({ error: 'Invalid section ID', status: 400 });
      return;
    }

    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                githubUsername: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        documents: {
          include: {
            versions: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              include: {
                editedBy: {
                  select: { id: true, displayName: true, githubUsername: true },
                },
              },
            },
          },
        },
      },
    });

    if (!section) {
      res.status(404).json({ error: 'Section not found', status: 404 });
      return;
    }

    // Check access for members
    if (req.user!.role !== 'LEADER') {
      const hasAccess = section.assignments.some((a) => a.user.id === req.user!.id);
      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied', status: 403 });
        return;
      }
    }

    res.json({
      data: {
        id: section.id,
        code: section.code,
        title: section.title,
        description: section.description,
        cisChapters: section.cisChapters,
        assignees: section.assignments.map((a) => a.user),
        document: section.documents[0]
          ? {
              ...section.documents[0],
              versions: section.documents[0].versions,
            }
          : null,
      },
      status: 200,
    });
  } catch (error) {
    console.error('Get section error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * POST /api/sections/:id/assign
 * Assign a user to a section (leader only).
 */
router.post('/:id/assign', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const sectionId = parseInt(req.params.id, 10);
    const { userId } = req.body;

    if (isNaN(sectionId) || !userId) {
      res.status(400).json({ error: 'Invalid section ID or user ID', status: 400 });
      return;
    }

    const assignment = await prisma.sectionAssignment.upsert({
      where: {
        userId_sectionId: { userId, sectionId },
      },
      update: {},
      create: { userId, sectionId },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'assign_section',
        details: { sectionId, assignedUserId: userId },
      },
    });

    res.json({ data: assignment, status: 200 });
  } catch (error) {
    console.error('Assign section error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
