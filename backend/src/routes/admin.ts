import { Router, Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireCapabilityAccess } from '../middleware/rbac';
import { getEffectiveRoles, normalizeAssignableRoles } from '../lib/system-roles';

const router = Router();
const prisma = new PrismaClient();

// All admin routes require auth + admin panel capability
router.use(requireAuth, requireCapabilityAccess('admin_panel'));

/**
 * GET /api/admin/users
 * List all users with stats (Admin capable users only).
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
        roles: getEffectiveRoles(u),
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
 * Change a user's roles.
 */
router.patch('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const rawRoles = Array.isArray(req.body?.roles)
      ? req.body.roles
      : typeof req.body?.role === 'string'
        ? [req.body.role]
        : [];

    if (isNaN(userId) || rawRoles.length === 0) {
      res.status(400).json({ error: 'Invalid user ID or roles', status: 400 });
      return;
    }

    const invalidRoles = rawRoles.filter((role: string) => !Object.values(Role).includes(role as Role));
    if (invalidRoles.length > 0) {
      res.status(400).json({ error: `Invalid roles: ${invalidRoles.join(', ')}`, status: 400 });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, githubUsername: true },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found', status: 404 });
      return;
    }

    const normalizedRoles = normalizeAssignableRoles(
      targetUser.githubUsername,
      rawRoles.map((role: string) => role as Role)
    );

    // Prevent self-demotion
    if (userId === req.user!.id) {
      res.status(400).json({ error: 'Cannot change your own roles', status: 400 });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        role: normalizedRoles[0],
        roles: normalizedRoles,
      },
      select: { id: true, githubUsername: true, displayName: true, role: true, roles: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'set_user_roles',
        details: { targetUserId: userId, newRoles: normalizedRoles },
      },
    });

    res.json({
      data: {
        ...updatedUser,
        roles: getEffectiveRoles(updatedUser),
      },
      status: 200,
    });
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
    const [users, sections, totalBuilds, totalReleases, totalLogs] = await Promise.all([
      prisma.user.findMany({ select: { id: true, githubUsername: true, role: true, roles: true } }),
      prisma.section.findMany({
        select: {
          code: true,
          _count: { select: { assignments: true } },
        },
      }),
      prisma.reportBuild.count({ where: { status: 'completed' } }),
      prisma.release.count(),
      prisma.auditLog.count(),
    ]);

    const roleBreakdown = Object.values(Role).reduce<Record<string, number>>((acc, role) => {
      acc[role] = 0;
      return acc;
    }, {});

    for (const user of users) {
      for (const role of getEffectiveRoles(user)) {
        roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
      }
    }

    const sectionBreakdown = sections.map((section) => ({
      code: section.code,
      assigneeCount: section._count.assignments,
    }));

    res.json({
      data: {
        totalUsers: users.length,
        totalSections: sections.length,
        totalBuilds,
        totalReleases,
        totalLogs,
        roleBreakdown,
        sectionBreakdown,
      },
      status: 200,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
