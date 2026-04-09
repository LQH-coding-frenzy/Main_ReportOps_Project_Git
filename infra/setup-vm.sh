#!/bin/bash
# ═══════════════════════════════════════════════════
# ReportOps — GCP VM Setup Script (Production)
# Run this on a fresh GCP Compute Engine VM
#
# VM Specs:
#   - Machine type: e2-small (2GB RAM, ~$13/mo) recommended
#   - OS: Debian 12 or Ubuntu 22.04
#   - Region: asia-southeast1 (Singapore, closest to VN)
#   - Boot disk: 30GB standard
#   - Firewall: Allow HTTP (80) and HTTPS (443)
#
# Usage:
#   chmod +x setup-vm.sh
#   sudo ./setup-vm.sh
# ═══════════════════════════════════════════════════

set -euo pipefail

DOMAIN_API="api.automatedprogram.app"
DOMAIN_DOCS="docs.automatedprogram.app"
APP_DIR="/opt/reportops"
CERTBOT_EMAIL="lqh.coding@gmail.com"  # TODO: Change to your email

echo "╔══════════════════════════════════════════════╗"
echo "║   ReportOps — Production VM Setup            ║"
echo "╚══════════════════════════════════════════════╝"

# ── 1. System Updates ──
echo "📦 [1/8] Updating system packages..."
apt-get update && apt-get upgrade -y
apt-get install -y curl git jq

# ── 2. Add Swap (critical for small VMs) ──
echo "💾 [2/8] Setting up 2GB swap..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    sysctl -p
    echo "  ✅ Swap created and enabled"
else
    echo "  ✅ Swap already exists"
fi

# ── 3. Install Docker ──
echo "🐳 [3/8] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker $SUDO_USER 2>/dev/null || true
    systemctl enable docker
    systemctl start docker
    echo "  ✅ Docker installed"
else
    echo "  ✅ Docker already installed ($(docker --version))"
fi

# ── 4. Install Docker Compose ──
echo "🐳 [4/8] Installing Docker Compose plugin..."
if ! docker compose version &> /dev/null 2>&1; then
    apt-get install -y docker-compose-plugin
    echo "  ✅ Docker Compose installed"
else
    echo "  ✅ Docker Compose already installed"
fi

# ── 5. Install Node.js 20 ──
echo "📗 [5/8] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo "  ✅ Node.js $(node --version) installed"
else
    echo "  ✅ Node.js $(node --version) already installed"
fi

# ── 6. Install PM2 ──
echo "⚙️ [6/8] Installing PM2..."
npm install -g pm2
pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER 2>/dev/null || true
echo "  ✅ PM2 installed"

# ── 7. Setup App Directory ──
echo "📁 [7/8] Setting up app directory..."
mkdir -p $APP_DIR
cd $APP_DIR

if [ ! -d ".git" ]; then
    echo "  📥 Cloning repository..."
    git clone https://github.com/LQH-coding-frenzy/Main_ReportOps_Project_Git.git .
else
    echo "  ✅ Repository already cloned"
fi

# ── 8. Initial SSL Certificate Setup ──
echo "🔐 [8/8] Setting up SSL certificates..."

# First, start nginx without SSL to serve ACME challenges
cat > /tmp/nginx-init.conf << 'NGINX_INIT'
events { worker_connections 128; }
http {
    server {
        listen 80;
        server_name api.automatedprogram.app docs.automatedprogram.app;
        location /.well-known/acme-challenge/ { root /var/www/certbot; }
        location / { return 200 'ReportOps initializing...'; add_header Content-Type text/plain; }
    }
}
NGINX_INIT

# Create certbot webroot
mkdir -p /var/www/certbot

# Start temporary nginx for ACME
docker run -d --name nginx-init \
    -p 80:80 \
    -v /tmp/nginx-init.conf:/etc/nginx/nginx.conf:ro \
    -v /var/www/certbot:/var/www/certbot \
    nginx:alpine 2>/dev/null || true

sleep 3

# Request SSL certificates
echo "  📜 Requesting SSL certificates from Let's Encrypt..."
docker run --rm \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/www/certbot:/var/www/certbot \
    certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    --email $CERTBOT_EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN_API \
    -d $DOMAIN_DOCS \
    --non-interactive || echo "  ⚠️ SSL cert request failed — ensure DNS is pointing to this VM's IP"

# Cleanup temp nginx
docker rm -f nginx-init 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       ✅ Base Setup Complete!                 ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  Next steps (run manually):                  ║"
echo "║                                              ║"
echo "║  1. Configure backend environment:           ║"
echo "║     cd $APP_DIR/backend                      ║"
echo "║     cp .env.example .env                     ║"
echo "║     nano .env  # Fill in your secrets        ║"
echo "║                                              ║"
echo "║  2. Install & setup backend:                 ║"
echo "║     npm install                              ║"
echo "║     npx prisma generate                      ║"
echo "║     npx prisma db push                       ║"
echo "║     npm run db:seed                          ║"
echo "║     npm run build                            ║"
echo "║                                              ║"
echo "║  3. Start backend with PM2:                  ║"
echo "║     pm2 start dist/index.js \\                ║"
echo "║       --name reportops-api                   ║"
echo "║     pm2 save                                 ║"
echo "║                                              ║"
echo "║  4. Start ONLYOFFICE + Nginx:                ║"
echo "║     cd $APP_DIR/infra/onlyoffice             ║"
echo "║     docker compose up -d                     ║"
echo "║     # Wait ~2 min for initialization         ║"
echo "║                                              ║"
echo "║  5. Verify:                                  ║"
echo "║     curl https://api.automatedprogram.app    ║"
echo "║     curl https://docs.automatedprogram.app   ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
