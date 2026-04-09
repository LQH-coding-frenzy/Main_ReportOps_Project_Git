import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  getAuthorizationUrl,
  exchangeCodeForToken,
  getGitHubUser,
  getGitHubUserEmail,
} from '../services/github-oauth';
import { generateToken, setAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

// In-memory state store for OAuth CSRF protection
const oauthStates = new Map<string, { timestamp: number }>();

// Clean up expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of oauthStates.entries()) {
    if (now - value.timestamp > 10 * 60 * 1000) {
      oauthStates.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * GET /api/auth/github/start
 * Redirect user to GitHub OAuth authorization page.
 */
router.get('/github/start', (_req: Request, res: Response) => {
  const state = uuidv4();
  oauthStates.set(state, { timestamp: Date.now() });

  const authUrl = getAuthorizationUrl(state);
  res.redirect(authUrl);
});

/**
 * GET /api/auth/github/callback
 * Handle GitHub OAuth callback: exchange code for token, upsert user, set cookie.
 */
router.get('/github/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== 'string') {
      res.redirect(`${env.FRONTEND_URL}?error=missing_code`);
      return;
    }

    // Verify state for CSRF protection
    if (!state || typeof state !== 'string' || !oauthStates.has(state)) {
      res.redirect(`${env.FRONTEND_URL}?error=invalid_state`);
      return;
    }
    oauthStates.delete(state);

    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);

    // Fetch GitHub user profile
    const githubUser = await getGitHubUser(accessToken);
    const email = githubUser.email || (await getGitHubUserEmail(accessToken));

    // Upsert user in database
    // If the user already exists (by githubUsername), update their githubId and profile.
    // If a seed user exists with placeholder githubId, it gets updated here.
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { githubId: String(githubUser.id) },
          { githubUsername: githubUser.login },
        ],
      },
    });

    if (user) {
      // Update existing user with latest GitHub info
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubId: String(githubUser.id),
          githubUsername: githubUser.login,
          displayName: githubUser.name || user.displayName,
          email: email || user.email,
          avatarUrl: githubUser.avatar_url,
        },
      });
    } else {
      // New user — create with MEMBER role (leader can promote later)
      user = await prisma.user.create({
        data: {
          githubId: String(githubUser.id),
          githubUsername: githubUser.login,
          displayName: githubUser.name,
          email,
          avatarUrl: githubUser.avatar_url,
          role: 'MEMBER',
        },
      });
    }

    // Log the login
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'login',
        details: {
          githubUsername: githubUser.login,
          ip: req.ip,
        },
        ipAddress: req.ip || null,
      },
    });

    // Generate JWT and set cookie
    const token = generateToken(user.id);
    setAuthCookie(res, token);

    // Redirect to dashboard
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${env.FRONTEND_URL}?error=auth_failed`);
  }
});

/**
 * POST /api/auth/logout
 * Clear auth cookie.
 */
router.post('/logout', requireAuth, (req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ data: null, status: 200 });
});

/**
 * GET /api/auth/me
 * Get current authenticated user with role and section assignments.
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        assignments: {
          include: {
            section: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found', status: 404 });
      return;
    }

    res.json({
      data: {
        id: user.id,
        githubId: user.githubId,
        githubUsername: user.githubUsername,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        sections: user.assignments.map((a) => ({
          id: a.section.id,
          code: a.section.code,
          title: a.section.title,
          cisChapters: a.section.cisChapters,
        })),
      },
      status: 200,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
