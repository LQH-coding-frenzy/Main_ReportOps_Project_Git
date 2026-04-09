import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prisma = new PrismaClient();

export interface AuthUser {
  id: number;
  githubId: string;
  githubUsername: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: 'LEADER' | 'MEMBER';
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Middleware: Verify JWT from httpOnly cookie and attach user to request.
 * Returns 401 if no valid token found.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.reportops_token;

    if (!token) {
      res.status(401).json({ error: 'Authentication required', status: 401 });
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        githubId: true,
        githubUsername: true,
        displayName: true,
        email: true,
        avatarUrl: true,
        role: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found', status: 401 });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired', status: 401 });
      return;
    }
    res.status(401).json({ error: 'Invalid token', status: 401 });
  }
}

/**
 * Optional auth: attach user if token exists, but don't require it.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.reportops_token;
    if (!token) {
      next();
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        githubId: true,
        githubUsername: true,
        displayName: true,
        email: true,
        avatarUrl: true,
        role: true,
      },
    });

    if (user) {
      req.user = user;
    }
    next();
  } catch {
    // Token invalid — continue without user
    next();
  }
}

/**
 * Generate a JWT token for a user.
 */
export function generateToken(userId: number): string {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: '7d' as const,
  });
}

/**
 * Set the auth cookie on the response.
 */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie('reportops_token', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

/**
 * Clear the auth cookie.
 */
export function clearAuthCookie(res: Response): void {
  res.clearCookie('reportops_token', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
}
