import type { Request } from 'express';
import csurf from 'csurf';
import { env } from '../config/env';

type CsrfRequest = Request & {
  csrfToken: () => string;
};

const cookieOptions = {
  key: 'reportops_csrf_secret',
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  path: '/',
  ...(env.NODE_ENV === 'production' ? { domain: '.automatedprogram.app' } : {}),
};

export const csrfProtection = csurf({
  cookie: cookieOptions,
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
});

export function issueCsrfToken(req: Request): string {
  return (req as CsrfRequest).csrfToken();
}

export function clearCsrfSecretCookie(res: {
  clearCookie: (name: string, options?: Record<string, unknown>) => void;
}): void {
  res.clearCookie(cookieOptions.key, cookieOptions);
}
