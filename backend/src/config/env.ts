import dotenv from 'dotenv';
import { getProjectAnswers } from './project-answers';
dotenv.config();

const projectAnswers = getProjectAnswers();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const defaultFrontendUrl = isProduction
  ? projectAnswers.project?.frontend_url || 'https://automatedprogram.app'
  : 'http://localhost:3000';
const defaultBackendPublicUrl = isProduction
  ? projectAnswers.project?.backend_url || 'https://api.automatedprogram.app'
  : 'http://localhost:4000';
const defaultOnlyOfficeUrl = isProduction
  ? projectAnswers.project?.onlyoffice_url || 'https://docs.automatedprogram.app'
  : 'http://localhost:8080';
const defaultDocumentsBucket = projectAnswers.storage?.documents_bucket || 'reportops-documents';
const defaultArchiveBucket = projectAnswers.storage?.archive_bucket || 'reportops-archives';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function isLoopbackUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

function normalizePublicUrl(url: string): string {
  const trimmed = trimTrailingSlash(url);

  if (!isProduction) {
    return trimmed;
  }

  if (trimmed.startsWith('http://')) {
    return `https://${trimmed.slice('http://'.length)}`;
  }

  return trimmed;
}

function resolvePublicUrl(envKey: 'ONLYOFFICE_DOCUMENT_SERVER_URL' | 'BACKEND_PUBLIC_URL', fallback: string): string {
  const configured = process.env[envKey]?.trim();

  if (!configured) {
    return fallback;
  }

  if (isProduction && isLoopbackUrl(configured)) {
    return fallback;
  }

  return normalizePublicUrl(configured);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: nodeEnv,
  FRONTEND_URL: process.env.FRONTEND_URL || defaultFrontendUrl,

  // Database (Supabase Postgres via Prisma)
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Supabase (for Storage)
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET || defaultDocumentsBucket,
  SUPABASE_ARCHIVE_BUCKET: process.env.SUPABASE_ARCHIVE_BUCKET || defaultArchiveBucket,

  // GitHub OAuth
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
  GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/api/auth/github/callback',

  // GitHub API (for releases)
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  GITHUB_REPO_OWNER: process.env.GITHUB_REPO_OWNER || 'LQH-coding-frenzy',
  GITHUB_REPO_NAME: process.env.GITHUB_REPO_NAME || 'Main_ReportOps_Project_Git',

  // Source of truth
  PROJECT_ANSWERS_PATH: process.env.PROJECT_ANSWERS_PATH || '',

  // ONLYOFFICE
  ONLYOFFICE_DOCUMENT_SERVER_URL: resolvePublicUrl('ONLYOFFICE_DOCUMENT_SERVER_URL', defaultOnlyOfficeUrl),
  ONLYOFFICE_DOCUMENT_SERVER_INTERNAL_URL: process.env.ONLYOFFICE_DOCUMENT_SERVER_INTERNAL_URL || '',
  ONLYOFFICE_JWT_SECRET: process.env.ONLYOFFICE_JWT_SECRET || 'reportops-onlyoffice-secret',

  // JWT (for auth cookies)
  JWT_SECRET: process.env.JWT_SECRET || 'reportops-jwt-secret-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Backend public URL (for ONLYOFFICE callback)
  BACKEND_PUBLIC_URL: resolvePublicUrl('BACKEND_PUBLIC_URL', defaultBackendPublicUrl),

  // Audit Runner
  AUDIT_RUNNER_SSH_KEY: process.env.AUDIT_RUNNER_SSH_KEY || '',

  // Preview merge worker memory budget (MB)
  REPORT_MERGE_WORKER_MAX_OLD_GENERATION_MB: parsePositiveInt(
    process.env.REPORT_MERGE_WORKER_MAX_OLD_GENERATION_MB,
    1536
  ),
} as const;

// Validate required environment variables in production
export function validateEnv(): void {
  const required = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
  ];

  if (env.NODE_ENV === 'production') {
    required.push('JWT_SECRET', 'ONLYOFFICE_JWT_SECRET', 'AUDIT_RUNNER_SSH_KEY');
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    if (env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}
