#!/bin/bash
# ALiSiO PMS — Deploy to VPS
# Usage: bash deploy.sh

set -e

SERVER="root@46.225.132.220"
REMOTE_DIR="/root/projects/alisio-pms"
DOMAIN="alisio.swipescape.eu"

echo "🚀 Deploying ALiSiO PMS to $SERVER..."

# 1. Sync files (exclude heavy/local dirs)
echo "📦 Syncing files..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude data \
  --exclude .env.local \
  --exclude .gemini \
  --exclude .agent \
  -e ssh \
  ./ "$SERVER:$REMOTE_DIR/"

# 2. Remote: install, build, restart
echo "🔧 Building on server..."
ssh "$SERVER" << 'ENDSSH'
cd /root/projects/alisio-pms

# Ensure data dir exists
mkdir -p data

# Install dependencies
npm ci --production=false

# Kill any lingering next build processes and remove stale lock
pkill -f "next build" || true
rm -f .next/lock

# Build Next.js
npm run build

# Restart service
systemctl restart alisio-pms
echo "✅ Service restarted"
systemctl status alisio-pms --no-pager
ENDSSH

echo ""
echo "✅ Deploy complete!"
echo "🌐 https://$DOMAIN"
