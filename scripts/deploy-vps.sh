#!/bin/bash
# ALiSiO PMS — Safe Deploy Script
# Usage: bash /root/projects/deploy.sh
# Run this on the VPS to deploy a clean, fresh build.

set -e
cd /root/projects/alisio-pms

echo "=== [1/6] Stopping service ==="
systemctl stop alisio-pms || true

echo "=== [2/6] Pulling latest code ==="
git reset --hard origin/main
git clean -fd \
  --exclude='src/assets/fonts/*.ttf' \
  --exclude='node_modules/'

git pull --ff-only

echo "=== [3/6] Restoring fonts ==="
mkdir -p src/assets/fonts
for f in DejaVuSans.ttf DejaVuSans-Bold.ttf; do
  if [ ! -f "src/assets/fonts/$f" ]; then
    SRC="/usr/share/fonts/truetype/dejavu/$f"
    [ -f "$SRC" ] && cp "$SRC" "src/assets/fonts/$f" && echo "  copied $f"
  else
    echo "  $f already present"
  fi
done

echo "=== [4/6] Installing packages ==="
rm -rf node_modules .next
npm install --ignore-scripts 2>&1 | tail -4
chmod -R +x node_modules/.bin/ 2>/dev/null || true
npm rebuild 2>&1 | tail -3

echo "=== [5/6] Building ==="
npm run build

echo "=== [6/6] Starting service ==="
systemctl start alisio-pms
sleep 3
systemctl is-active alisio-pms && echo "✅ Deploy successful!" || echo "❌ Service failed to start"
