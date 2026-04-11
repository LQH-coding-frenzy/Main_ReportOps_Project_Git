import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env, validateEnv } from './config/env';
import { initStorage } from './config/supabase';
import { resumeInFlightPreviewBuilds } from './services/report-generator';

// Routes
import authRoutes from './routes/auth';
import sectionRoutes from './routes/sections';
import editorRoutes from './routes/editor';
import reportRoutes from './routes/reports';
import releaseRoutes from './routes/releases';
import auditRoutes from './routes/audit';

// Validate environment
validateEnv();

const app = express();

// ── Middleware ──
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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
app.use('/api/onlyoffice', editorRoutes); // Mount callback under /api/onlyoffice too
app.use('/api/reports', reportRoutes);
app.use('/api/releases', releaseRoutes);
app.use('/api/audit-logs', auditRoutes);

// ── 404 Handler ──
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', status: 404 });
});

// ── Error Handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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

  app.listen(env.PORT, () => {
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
