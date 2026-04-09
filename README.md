# 📋 ReportOps

> Nền tảng cộng tác viết báo cáo CIS Benchmark — CIS AlmaLinux OS 9 v2.0.0 Level 1 Server

[![CI](https://github.com/LQH-coding-frenzy/Main_ReportOps_Project_Git/actions/workflows/ci.yml/badge.svg)](https://github.com/LQH-coding-frenzy/Main_ReportOps_Project_Git/actions)

## ✨ Features

- 🔐 **GitHub OAuth** — Đăng nhập bằng tài khoản GitHub
- ✏️ **ONLYOFFICE Editor** — Chỉnh sửa tài liệu .docx ngay trên web (gần Word)
- 🛡️ **RBAC** — Mỗi thành viên chỉ sửa được section của mình
- 📊 **Auto Report Generation** — Tự động merge các sections thành báo cáo tổng
- 🚀 **GitHub Releases** — Đẩy artifact chính thức lên GitHub Releases
- 📝 **Version History** — Lưu lịch sử chỉnh sửa, audit log đầy đủ

## 🏗️ Architecture

```
┌──────────────────┐     ┌─────────────────────────────────┐
│  Vercel (Free)   │     │  GCP VM (e2-micro / e2-small)   │
│                  │     │                                 │
│  ┌────────────┐  │     │  ┌───────┐  ┌──────────────┐   │
│  │  Next.js   │──┼─────┼──│Express│  │  ONLYOFFICE  │   │
│  │  Frontend  │  │     │  │  API  │  │  Doc Server  │   │
│  └────────────┘  │     │  └───┬───┘  └──────────────┘   │
│                  │     │      │           (Docker)       │
│  automatedprogram│     │  ┌───┴──────────┐               │
│  .app            │     │  │    Nginx     │               │
└──────────────────┘     │  │  Reverse     │               │
                         │  │  Proxy       │               │
┌──────────────────┐     │  └──────────────┘               │
│  Supabase (Free) │     │  api.automatedprogram.app       │
│                  │     │  docs.automatedprogram.app      │
│  ┌──────────┐    │     └─────────────────────────────────┘
│  │ Postgres │    │
│  │ Storage  │    │     ┌─────────────────────────────────┐
│  └──────────┘    │     │  GitHub                         │
└──────────────────┘     │  OAuth + Releases + CI/CD       │
                         └─────────────────────────────────┘
```

## 🚀 Quick Start (Development)

### Prerequisites

- Node.js 20+
- Supabase project (free tier)
- GitHub OAuth App

### 1. Clone & Install

```bash
git clone https://github.com/LQH-coding-frenzy/Main_ReportOps_Project_Git.git
cd Main_ReportOps_Project_Git
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your Supabase + GitHub OAuth credentials

npm install
npx prisma generate
npx prisma db push     # Push schema to Supabase
npm run db:seed        # Seed 4 users + 4 sections
npm run dev            # Start on http://localhost:4000
```

### 3. Frontend Setup

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev            # Start on http://localhost:3000
```

### 4. ONLYOFFICE (Optional — for editor functionality)

```bash
cd infra/onlyoffice
docker compose up -d   # Start Document Server on http://localhost:8080
# Wait ~2 minutes for initialization
```

## 👥 Team

| Thành viên | Role | Section | CIS Chapters |
|---|---|---|---|
| **Lại Quang Huy** | 👑 Leader | M1 | 1.1, 1.2, 1.4, 1.5, 1.6, 2.3, 2.4 |
| **Bao Nguyên** | Member | M2 | 1.3, 2.1, 2.2, 3, 4 |
| **Trương Duy** | Member | M3 | 5.1, 5.2, 5.3, 5.4 |
| **Lâm Hoàng Phước** | Member | M4 | 1.7, 1.8, 6, 7 |

## 🔑 Environment Setup

### GitHub OAuth App

1. Go to https://github.com/settings/developers
2. **New OAuth App**
3. Settings:
   - Name: `ReportOps`
   - Homepage: `http://localhost:3000`
   - Callback: `http://localhost:4000/api/auth/github/callback`
4. Copy Client ID & Secret to `backend/.env`

### Supabase

1. Create project at https://supabase.com
2. Go to Settings → Database → Connection string
3. Copy `DATABASE_URL` to `backend/.env`
4. Go to Settings → API → Copy `URL` and `service_role` key

## 📁 Project Structure

```
├── frontend/               # Next.js 14 App Router
│   ├── src/app/           # Pages (login, dashboard, editor, reports, releases)
│   ├── src/lib/           # Types, API client
│   └── .env.example       # Frontend env template
│
├── backend/                # Express + Prisma
│   ├── src/routes/        # API routes (auth, sections, editor, reports, releases)
│   ├── src/services/      # Business logic (OAuth, ONLYOFFICE, storage, reports)
│   ├── src/middleware/     # Auth + RBAC middleware
│   ├── prisma/            # Schema + seed
│   └── .env.example       # Backend env template
│
├── infra/                  # Infrastructure
│   ├── onlyoffice/        # Docker Compose + Nginx
│   └── setup-vm.sh        # GCP VM setup script
│
└── .github/workflows/     # CI/CD (lint, security, release)
```

## 📖 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/github/start` | — | OAuth redirect |
| GET | `/api/auth/github/callback` | — | OAuth callback |
| GET | `/api/auth/me` | ✅ | Current user |
| GET | `/api/sections` | ✅ | List sections |
| GET | `/api/editor/config/:id` | ✅ | ONLYOFFICE config |
| POST | `/api/onlyoffice/callback` | — | Save callback |
| POST | `/api/reports/preview` | 👑 | Build preview |
| POST | `/api/releases/freeze` | 👑 | Freeze release |
| GET | `/api/audit-logs` | 👑 | Audit logs |

## 📜 License

Private — UIT IoT Team Project
