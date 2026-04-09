import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/audit-logs
 * List audit logs (leader only).
 */
router.get('/', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              githubUsername: true,
              avatarUrl: true,
            },
          },
        },
      }),
      prisma.auditLog.count(),
    ]);

    res.json({
      data: {
        logs: logs.map((log) => ({
          id: log.id,
          action: log.action,
          details: log.details,
          ipAddress: log.ipAddress,
          createdAt: log.createdAt,
          user: log.user,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      status: 200,
    });
  } catch (error) {
    console.error('List audit logs error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
