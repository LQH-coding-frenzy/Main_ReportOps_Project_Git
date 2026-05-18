import http from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env, validateEnv } from './config/env';
import { initStorage } from './config/supabase';
import { csrfProtection } from './middleware/csrf';
import { resumeInFlightPreviewBuilds } from './services/report-generator';
import { registerLabSshWebSocket } from './services/lab-ssh-websocket';

// Routes
import authRoutes from './routes/auth';
import sectionRoutes from './routes/sections';
import editorRoutes from './routes/editor';
import reportRoutes from './routes/reports';
import releaseRoutes from './routes/releases';
import auditRoutes from './routes/audit';
import adminRoutes from './routes/admin';
import auditJobRoutes from './routes/audit-jobs';
import auditScriptRoutes from './routes/audit-scripts';
import labCallbackRoutes from './routes/lab-callback';
import labRoutes from './routes/lab';

// Validate environment
validateEnv();

const app = express();
const server = http.createServer(app);

// ── Middleware ──
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Machine-to-machine callbacks do not use cookie auth and must stay outside browser CSRF protection.
app.use('/api/onlyoffice', editorRoutes);
app.use('/api/lab', labCallbackRoutes);

app.use(cookieParser());
app.use(csrfProtection);

// ── Health Check ──
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'reportops-backend',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  });
});

// ── API Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/editor', editorRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/releases', releaseRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/audit-jobs', auditJobRoutes);
app.use('/api/audit-scripts', auditScriptRoutes);
app.use('/api/lab', labRoutes);

// ── 404 Handler ──
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', status: 404 });
});

// ── Error Handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if ((err as Error & { code?: string }).code === 'EBADCSRFTOKEN') {
    res.status(403).json({ error: 'Invalid CSRF token', status: 403 });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', status: 500 });
});

// ── Start Server ──
async function start() {
  let storageReady = false;

  // Initialize Supabase storage bucket
  try {
    await initStorage();
    storageReady = true;
  } catch (error) {
    console.warn('⚠️ Storage initialization skipped:', error);
  }

  if (storageReady) {
    try {
      const resumedCount = await resumeInFlightPreviewBuilds();
      if (resumedCount > 0) {
        console.log(`♻️ Re-queued ${resumedCount} in-flight preview build(s) after restart.`);
      }
    } catch (error) {
      console.error('Failed to resume in-flight preview builds:', error);
    }
  }

  registerLabSshWebSocket(server);

  server.listen(env.PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║       ReportOps Backend API                  ║
║       Port: ${String(env.PORT).padEnd(33)}║
║       Env:  ${env.NODE_ENV.padEnd(33)}║
║       Frontend: ${env.FRONTEND_URL.padEnd(29)}║
╚══════════════════════════════════════════════╝
    `);
  });
}

start();

export default app;
