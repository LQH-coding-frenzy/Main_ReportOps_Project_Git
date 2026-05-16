import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const LAB_SSH_SESSION_SCOPE = 'lab_ssh';

type SshSessionClaims = {
  scope: typeof LAB_SSH_SESSION_SCOPE;
  userId: number;
  vmId: number;
};

type RequestHostContext = {
  headers: {
    host?: string | string[];
    'x-forwarded-host'?: string | string[];
    'x-forwarded-proto'?: string | string[];
  };
  protocol?: string;
};

function getFirstForwardedValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  if (!value) {
    return null;
  }

  return value.split(',')[0]?.trim() || null;
}

export function createLabSshSessionToken(userId: number, vmId: number): string {
  return jwt.sign({ scope: LAB_SSH_SESSION_SCOPE, userId, vmId } satisfies SshSessionClaims, env.JWT_SECRET, {
    expiresIn: '5m',
  });
}

export function verifyLabSshSessionToken(token: string): { userId: number; vmId: number } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as Partial<SshSessionClaims>;

    if (decoded.scope !== LAB_SSH_SESSION_SCOPE) {
      return null;
    }

    if (typeof decoded.userId !== 'number' || typeof decoded.vmId !== 'number') {
      return null;
    }

    return { userId: decoded.userId, vmId: decoded.vmId };
  } catch {
    return null;
  }
}

export function buildLabSshWebSocketUrl(req: RequestHostContext, vmId: number, sessionToken: string): string {
  const forwardedProto = getFirstForwardedValue(req.headers['x-forwarded-proto']);
  const forwardedHost = getFirstForwardedValue(req.headers['x-forwarded-host']);
  const host = forwardedHost || getFirstForwardedValue(req.headers.host) || 'localhost:4000';
  const protocol = forwardedProto || req.protocol || 'http';
  const wsProtocol = protocol === 'https' ? 'wss' : 'ws';

  return `${wsProtocol}://${host}/api/lab/vms/${vmId}/ssh?token=${encodeURIComponent(sessionToken)}`;
}
