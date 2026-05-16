import { Request, Response, NextFunction } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { type AppCapability, hasAnyRole, hasCapability, hasRole } from '../lib/system-roles';

const prisma = new PrismaClient();

/**
 * Middleware: Require LEADER role.
 * Must be used after requireAuth.
 */
export function requireLeader(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required', status: 401 });
    return;
  }

  if (!hasRole(req.user, Role.LEADER)) {
    res.status(403).json({ error: 'Leader access required', status: 403 });
    return;
  }

  next();
}

export function requireAnySystemRole(roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', status: 401 });
      return;
    }

    if (!hasAnyRole(req.user, roles)) {
      res.status(403).json({ error: 'Insufficient role access', status: 403 });
      return;
    }

    next();
  };
}

export function requireCapabilityAccess(capability: AppCapability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', status: 401 });
      return;
    }

    if (!hasCapability(req.user, capability)) {
      res.status(403).json({ error: 'Insufficient capability access', status: 403 });
      return;
    }

    next();
  };
}

/**
 * Middleware factory: Require user to be assigned to the section specified by :sectionId param.
 * Leaders can access all sections.
 * Must be used after requireAuth.
 */
export function requireSectionAccess(paramName: string = 'sectionId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', status: 401 });
      return;
    }

    // Leaders and section managers can access all sections
    if (hasAnyRole(req.user, [Role.LEADER, Role.ADMIN])) {
      next();
      return;
    }

    const sectionId = parseInt(req.params[paramName], 10);
    if (isNaN(sectionId)) {
      res.status(400).json({ error: 'Invalid section ID', status: 400 });
      return;
    }

    const assignment = await prisma.sectionAssignment.findFirst({
      where: {
        userId: req.user.id,
        sectionId,
      },
    });

    if (!assignment) {
      res.status(403).json({
        error: 'You do not have access to this section',
        status: 403,
      });
      return;
    }

    next();
  };
}
