# ReportOps — Project Overview

Collaborative CIS Benchmark report editing platform. Members edit their assigned sections via ONLYOFFICE embedded editor. Leader generates merged reports and publishes releases.

## Architecture

```
/
├── frontend/          # Next.js 16 (Turbopack) → Deploy to Vercel
├── backend/           # Express API + Prisma ORM (Node 20) → Deploy to GCP VM
├── infra/             # Docker Compose (ONLYOFFICE + Nginx) → GCP VM
├── .github/workflows/ # CI/CD (lint, security, release, deploy)
└── AGENTS.md          # This file
```

### Deployment Architecture
- **Frontend**: [automatedprogram.app](https://automatedprogram.app) → Vercel (Production)
- **Backend API**: [api.automatedprogram.app](https://api.automatedprogram.app) → GCP Compute Engine VM (Ubuntu)
- **ONLYOFFICE**: [docs.automatedprogram.app](https://docs.automatedprogram.app) → GCP Compute Engine VM (Docker)
- **Database**: Supabase Postgres (RLS Enabled)
- **Storage**: Supabase Storage (Private Bucket, .docx files)
- **CI/CD**: GitHub Actions (SSH `ed25519` based deployment)

### CI/CD Secrets (GitHub)
- `GCP_VM_HOST`: VM Public IP
- `GCP_VM_USER`: `jach9`
- `GCP_VM_SSH_KEY`: Private `ed25519` key
- `VERCEL_TOKEN`: CLI Deployment token
- `SUPABASE_SERVICE_ROLE_KEY`: Admin key for backend access
- `ONLYOFFICE_JWT_SECRET`: Shared secret for document security

## Commands

```bash
# Frontend
cd frontend && npm run dev      # Start dev server (http://localhost:3000)
npm run build                    # Production build
npm run lint                     # ESLint

# Backend
cd backend && npm run dev        # Start API (http://localhost:4000)
npm run build                    # TypeScript compile
npm run lint                     # ESLint
npm run db:migrate               # Prisma migrate
npm run db:generate              # Generate Prisma client
npm run db:seed                  # Seed users + sections
npm run db:studio                # Open Prisma Studio GUI
npm run db:push                  # Push schema to DB (dev)

# ONLYOFFICE (GCP VM)
cd infra/onlyoffice && docker compose up -d    # Start Document Server
docker compose logs -f onlyoffice              # View logs
```

## Conventions

- **Writing Format**: Must strictly follow [WRITING_GUIDE.md](./WRITING_GUIDE.md) to ensure `.docx` merging stability.
- API base URL: `http://localhost:4000/api` (dev) / `https://api.automatedprogram.app/api` (prod)
- Frontend proxy: `/api` → backend via `next.config.js` rewrites
- Env files: `.env.local` (frontend), `.env` (backend)
- Auth: GitHub OAuth → JWT in httpOnly cookie
- API responses: `{ data, error, status }` format
- CORS: configured for frontend origin with credentials

## Key Files

- Frontend entry: `frontend/src/app/page.tsx` (Login)
- Dashboard: `frontend/src/app/dashboard/page.tsx`
- Editor: `frontend/src/app/editor/[sectionId]/page.tsx`
- API entry: `backend/src/index.ts`
- DB schema: `backend/prisma/schema.prisma`
- Seed: `backend/prisma/seed.ts`
- Types: `frontend/src/lib/types.ts`
- API client: `frontend/src/lib/api.ts`

## Team

| Member | Role | GitHub | Sections |
|--------|------|--------|----------|
| Lại Quang Huy | Leader | LQH-coding-frenzy | M1: 1.1, 1.2, 1.4, 1.5, 1.6, 2.3, 2.4 |
| Bao Nguyên | Member | baongdqu | M2: 1.3, 2.1, 2.2, 3, 4 |
| Trương Duy | Member | truongdaoanhduy | M3: 5.1, 5.2, 5.3, 5.4 |
| Lâm Hoàng Phước | Member | hpuoc | M4: 1.7, 1.8, 6, 7 |
