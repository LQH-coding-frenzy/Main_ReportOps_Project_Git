# Database Setup Instructions

## Prerequisites
- PostgreSQL 14+ installed
- Node.js 18+

## Initial Setup

1. Create database:
```sql
CREATE DATABASE iot_db;
CREATE USER iot_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE iot_db TO iot_user;
```

2. Configure backend:
```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials
```

3. Run migrations:
```bash
cd backend
npm install
npx prisma migrate dev --name init
npx prisma generate
```

## Common Commands
```bash
npx prisma migrate dev    # Create and apply migrations
npx prisma migrate deploy # Apply migrations in production
npx prisma db push        # Sync schema without migration
npx prisma studio         # Visual database editor
```
