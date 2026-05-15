import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { Client, type ClientChannel } from 'ssh2';
import { WebSocketServer, WebSocket } from 'ws';
import { env } from '../config/env';

const prisma = new PrismaClient();

function resolveAuditRunnerPrivateKey(): string {
  const rawPrivateKey = env.AUDIT_RUNNER_SSH_KEY;

  if (!rawPrivateKey) {
    throw new Error('AUDIT_RUNNER_SSH_KEY is not configured');
  }

  if (!rawPrivateKey.includes('-----BEGIN')) {
    const cleaned = rawPrivateKey.replace(/[^A-Za-z0-9+/=]/g, '');
    const decoded = Buffer.from(cleaned, 'base64').toString('utf-8').trim();
    if (decoded.includes('-----BEGIN')) {
      return decoded;
    }

    return rawPrivateKey;
  }

  return rawPrivateKey.replace(/\\n/g, '\n').trim();
}

function extractCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  for (const pair of cookieHeader.split(';')) {
    const [rawKey, ...rawValueParts] = pair.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rawValueParts.join('='));
    }
  }

  return null;
}

async function authenticateUpgradeRequest(req: IncomingMessage) {
  const token = extractCookie(req.headers.cookie, 'reportops_token');
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number };
    return prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        role: true,
      },
    });
  } catch {
    return null;
  }
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

export function registerLabSshWebSocket(server: import('http').Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const match = requestUrl.pathname.match(/^\/api\/lab\/vms\/(\d+)\/ssh$/);

    if (!match) {
      return;
    }

    try {
      const user = await authenticateUpgradeRequest(req);
      if (!user) {
        rejectUpgrade(socket, 401, 'Unauthorized');
        return;
      }

      if (user.role !== 'LEADER') {
        rejectUpgrade(socket, 403, 'Forbidden');
        return;
      }

      const vmId = parseInt(match[1], 10);
      const vm = await prisma.labVm.findUnique({ where: { id: vmId } });

      if (!vm) {
        rejectUpgrade(socket, 404, 'Not Found');
        return;
      }

      if (vm.status !== 'RUNNING' || !vm.publicIp) {
        rejectUpgrade(socket, 409, 'VM Not Ready');
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        Object.assign(ws, { labVm: vm });
        wss.emit('connection', ws, req);
      });
    } catch (error) {
      console.error('SSH websocket upgrade error:', error);
      rejectUpgrade(socket, 500, 'Internal Server Error');
    }
  });

  wss.on('connection', (ws) => {
    const labVm = (ws as WebSocket & { labVm?: { id: number; name: string; publicIp: string | null } }).labVm;

    if (!labVm?.publicIp) {
      sendJson(ws, { type: 'error', message: 'VM không sẵn sàng cho SSH.' });
      ws.close();
      return;
    }

    const ssh = new Client();
    let shell: ClientChannel | null = null;
    let isClosed = false;

    const closeSession = () => {
      if (isClosed) return;
      isClosed = true;
      shell?.close();
      ssh.end();
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };

    ssh.on('ready', () => {
      ssh.shell(
        {
          term: 'xterm-256color',
          cols: 120,
          rows: 34,
        },
        (error, stream) => {
          if (error) {
            sendJson(ws, { type: 'error', message: `Không thể mở SSH shell: ${error.message}` });
            closeSession();
            return;
          }

          shell = stream;
          sendJson(ws, { type: 'ready', vmName: labVm.name });

          stream.on('data', (chunk: Buffer) => {
            sendJson(ws, { type: 'output', data: chunk.toString('utf-8') });
          });

          stream.stderr.on('data', (chunk: Buffer) => {
            sendJson(ws, { type: 'output', data: chunk.toString('utf-8') });
          });

          stream.on('close', () => {
            sendJson(ws, { type: 'closed' });
            closeSession();
          });
        }
      );
    });

    ssh.on('error', (error) => {
      sendJson(ws, { type: 'error', message: `Kết nối SSH thất bại: ${error.message}` });
      closeSession();
    });

    ssh.on('close', () => {
      sendJson(ws, { type: 'closed' });
      closeSession();
    });

    ws.on('message', (rawMessage) => {
      if (!shell) return;

      try {
        const message = JSON.parse(rawMessage.toString()) as { type?: string; data?: string; cols?: number; rows?: number };

        if (message.type === 'input' && typeof message.data === 'string') {
          shell.write(message.data);
          return;
        }

        if (message.type === 'resize' && typeof message.cols === 'number' && typeof message.rows === 'number') {
          const resizableShell = shell as ClientChannel & {
            setWindow?: (rows: number, cols: number, height: number, width: number) => void;
          };
          resizableShell.setWindow?.(message.rows, message.cols, 0, 0);
        }
      } catch (error) {
        console.error('SSH websocket message parse error:', error);
      }
    });

    ws.on('close', closeSession);
    ws.on('error', closeSession);

    sendJson(ws, { type: 'status', message: `Đang kết nối tới audituser@${labVm.publicIp}...` });

    ssh.connect({
      host: labVm.publicIp,
      port: 22,
      username: 'audituser',
      privateKey: resolveAuditRunnerPrivateKey(),
      readyTimeout: 60000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
    });
  });
}
