# 📋 ReportOps

> Nền tảng cộng tác viết báo cáo CIS Benchmark — CIS AlmaLinux OS 9 v2.0.0 Level 1 Server

[![CI](https://github.com/LQH-coding-frenzy/Main_ReportOps_Project_Git/actions/workflows/ci.yml/badge.svg)](https://github.com/LQH-coding-frenzy/Main_ReportOps_Project_Git/actions)

## ✨ Features

- 🔐 **GitHub OAuth** — Đăng nhập bảo mật qua GitHub
- ✏️ **ONLYOFFICE Editor** — Chỉnh sửa `.docx` trực tiếp, trải nghiệm như Microsoft Word
- 🛡️ **Hạ tầng bảo mật** — RLS (Supabase), Secret Scanning, Pre-commit Hooks
- 🤖 **CI/CD Automatied** — Tự động build & deploy khi push code lên GitHub
- 📊 **Auto Report Generation** — Tự động hợp nhất các section thành báo cáo tổng quát
- 🚀 **GitHub Releases** — Quản lý phiên bản và lưu trữ artifact chuyên nghiệp
- 🕵️ **Audit Logs** — Truy vết mọi hành động chỉnh sửa của người dùng

## 🏗️ Architecture

```mermaid
graph TD
    %% Nodes
    User(("🌐 Users<br/>(Browsers/Mobile)"))
    
    subgraph Vercel ["▲ Vercel (Frontend)"]
        Next["Next.js 16 App Router<br/>(automatedprogram.app)"]
    end
    
    subgraph GCP ["☁️ Google Cloud Platform (Backend)"]
        direction TB
        Nginx["Nginx Reverse Proxy"]
        Express["Express.js API<br/>(api.automatedprogram.app)"]
        OO["ONLYOFFICE DocServer<br/>(docs.automatedprogram.app)"]
        
        Nginx --> Express
        Nginx --> OO
    end
    
    subgraph Supabase ["⚡ Supabase (Data & Storage)"]
        DB[("PostgreSQL<br/>(RLS Enabled)")]
        Storage[("Object Storage<br/>(Private Bucket)")]
    end
    
    subgraph GitHub ["🐙 GitHub Ecosystem"]
        Auth["GitHub OAuth"]
        CICD["GitHub Actions<br/>(CI/CD Pipeline)"]
        Rel["GitHub Releases"]
    end

    %% Connections
    User -->|HTTPS| Next
    Next -->|API Calls| Nginx
    Express -->|ORM / Auth| DB
    Express -->|File I/O| Storage
    Express -->|Auth Verify| Auth
    Express -->|Trigger| Rel
    User -.->|Commit Code| CICD
    CICD -.->|Deploy| GCP
    CICD -.->|Deploy| Vercel

    %% Styles
    style Next fill:#000,color:#fff,stroke:#333
    style Express fill:#404137,color:#fff,stroke:#333
    style DB fill:#3ecf8e,color:#fff,stroke:#333
    style Storage fill:#3ecf8e,color:#fff,stroke:#333
    style CICD fill:#2088ff,color:#fff,stroke:#333
```

## 🌐 Live Production

- **Website**: [https://automatedprogram.app](https://automatedprogram.app)
- **API Endpoint**: `https://api.automatedprogram.app`
- **Document Server**: `https://docs.automatedprogram.app`

---
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

## 🛠️ Infrastructure & Security

### CI/CD Pipeline
Dự án được triển khai tự động qua **GitHub Actions**:
- **Frontend**: Tự động build và deploy lên Vercel.
- **Backend**: SSH Deployment qua chuẩn `ed25519` bảo mật, tự động cập nhật Code, Restart PM2 và Docker Stack trên GCP VM.

### Security Meaures
- **Row Level Security (RLS)**: Cấu hình trên Supabase để chặn mọi truy cập trái phép từ Client.
- **Git Hooks**: Pre-commit hook ngăn chặn vô tình commit file `.env` hoặc Private Key.
- **Secret Scanning**: Tự động quét và bảo vệ các chuỗi nhạy cảm trong Repo.

## 📜 License

Private — UIT IoT Team Project (Báo cáo Đồ Án)
- **Giảng viên hướng dẫn**: [Tên Giảng Viên]
- **Năm thực hiện**: {new Date().getFullYear()}
