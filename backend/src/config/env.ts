import dotenv from 'dotenv';
dotenv.config();

export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Database (Supabase Postgres via Prisma)
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Supabase (for Storage)
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET || 'reportops-documents',

  // GitHub OAuth
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
  GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/api/auth/github/callback',

  // GitHub API (for releases)
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  GITHUB_REPO_OWNER: process.env.GITHUB_REPO_OWNER || 'LQH-coding-frenzy',
  GITHUB_REPO_NAME: process.env.GITHUB_REPO_NAME || 'Main_ReportOps_Project_Git',

  // ONLYOFFICE
  ONLYOFFICE_DOCUMENT_SERVER_URL: process.env.ONLYOFFICE_DOCUMENT_SERVER_URL || 'http://localhost:8080',
  ONLYOFFICE_DOCUMENT_SERVER_INTERNAL_URL: process.env.ONLYOFFICE_DOCUMENT_SERVER_INTERNAL_URL || '',
  ONLYOFFICE_JWT_SECRET: process.env.ONLYOFFICE_JWT_SECRET || 'reportops-onlyoffice-secret',

  // JWT (for auth cookies)
  JWT_SECRET: process.env.JWT_SECRET || 'reportops-jwt-secret-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Backend public URL (for ONLYOFFICE callback)
  BACKEND_PUBLIC_URL: process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000',
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
    required.push('JWT_SECRET', 'ONLYOFFICE_JWT_SECRET');
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    if (env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}
