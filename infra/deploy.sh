#!/bin/bash
# ═══════════════════════════════════════════════════
# ReportOps — Quick Deploy Script
# Run this on the GCP VM to deploy latest changes
#
# Usage:
#   cd /opt/reportops
#   bash infra/deploy.sh
# ═══════════════════════════════════════════════════

set -euo pipefail

APP_DIR="/opt/reportops"
cd $APP_DIR

echo "🚀 ReportOps — Deploying latest..."

# 1. Pull latest code
echo "📦 [1/5] Pulling latest code..."
git fetch origin main
git reset --hard origin/main

# 2. Install & build backend
echo "🔨 [2/5] Building backend..."
cd backend
npm ci --production=false
npx prisma generate
npx prisma db push --accept-data-loss || echo "⚠️ DB push had warnings"
npm run build

# 3. Restart API
echo "♻️ [3/5] Restarting API server..."
if pm2 describe reportops-api > /dev/null 2>&1; then
    pm2 restart reportops-api
else
    pm2 start ecosystem.config.js
fi
pm2 save

# 4. Update Docker services if needed
echo "🐳 [4/5] Updating Docker services..."
cd $APP_DIR/infra/onlyoffice
docker compose pull --quiet
docker compose up -d --remove-orphans

# 5. Health check
echo "🏥 [5/5] Running health check..."
sleep 5
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/auth/me --max-time 5 || echo "000")
OO_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/healthcheck --max-time 5 || echo "000")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Deployment Results                          ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  API Server:        HTTP $API_STATUS               ║"
echo "║  ONLYOFFICE:        HTTP $OO_STATUS               ║"
echo "╚══════════════════════════════════════════════╝"

if [ "$API_STATUS" = "401" ] || [ "$API_STATUS" = "200" ]; then
    echo "✅ API is healthy"
else
    echo "❌ API may have issues — check: pm2 logs reportops-api"
fi

if [ "$OO_STATUS" = "200" ]; then
    echo "✅ ONLYOFFICE is healthy"
else
    echo "⚠️ ONLYOFFICE may be starting up — check: docker compose logs onlyoffice"
fi
