import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';

const router = Router();
const prisma = new PrismaClient();

// All admin routes require auth + leader role
router.use(requireAuth, requireLeader);

/**
 * GET /api/admin/users
 * List all users with stats (Leader only).
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        assignments: {
          include: {
            section: {
              select: { id: true, code: true, title: true },
            },
          },
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    res.json({
      data: users.map((u) => ({
        id: u.id,
        githubId: u.githubId,
        githubUsername: u.githubUsername,
        displayName: u.displayName,
        email: u.email,
        avatarUrl: u.avatarUrl,
        role: u.role,
        createdAt: u.createdAt,
        sections: u.assignments.map((a) => a.section),
        lastActive: u.auditLogs[0]?.createdAt ?? null,
      })),
      status: 200,
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * PATCH /api/admin/users/:id/role
 * Change a user's role (Leader only).
 */
router.patch('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { role } = req.body;

    if (isNaN(userId) || !role) {
      res.status(400).json({ error: 'Invalid user ID or role', status: 400 });
      return;
    }

    if (!['LEADER', 'MEMBER'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be LEADER or MEMBER', status: 400 });
      return;
    }

    // Prevent self-demotion
    if (userId === req.user!.id) {
      res.status(400).json({ error: 'Cannot change your own role', status: 400 });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, githubUsername: true, displayName: true, role: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'change_user_role',
        details: { targetUserId: userId, newRole: role },
      },
    });

    res.json({ data: updatedUser, status: 200 });
  } catch (error) {
    console.error('Admin change role error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * DELETE /api/admin/sections/:sectionId/assign/:userId
 * Remove a user from a section assignment (Leader only).
 */
router.delete('/sections/:sectionId/assign/:userId', async (req: Request, res: Response) => {
  try {
    const sectionId = parseInt(req.params.sectionId, 10);
    const userId = parseInt(req.params.userId, 10);

    if (isNaN(sectionId) || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid IDs', status: 400 });
      return;
    }

    await prisma.sectionAssignment.deleteMany({
      where: { sectionId, userId },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'unassign_section',
        details: { sectionId, removedUserId: userId },
      },
    });

    res.json({ data: null, status: 200 });
  } catch (error) {
    console.error('Admin unassign section error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/admin/stats
 * High-level system stats for admin overview.
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [totalUsers, totalSections, totalBuilds, totalReleases, totalLogs] = await Promise.all([
      prisma.user.count(),
      prisma.section.count(),
      prisma.reportBuild.count({ where: { status: 'completed' } }),
      prisma.release.count(),
      prisma.auditLog.count(),
    ]);

    res.json({
      data: { totalUsers, totalSections, totalBuilds, totalReleases, totalLogs },
      status: 200,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
