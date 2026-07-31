#!/bin/bash
# ALiSiO PMS — Safe Deploy Script
# Usage: bash /root/projects/deploy.sh
# Run this on the VPS to deploy a clean, fresh build.

set -e
cd /root/projects/alisio-pms

echo "=== [0/7] Backup before touching anything ==="
# Never deploy without a restore point. If this fails, the deploy stops here.
bash /root/projects/alisio-pms/scripts/backup-all.sh --tag predeploy || {
  echo "❌ Backup failed — ABORTING deploy. Fix the backup first."
  exit 1
}

echo "=== [1/7] Stopping service ==="
systemctl stop alisio-pms || true

echo "=== [2/7] Pulling latest code ==="
git reset --hard origin/main
git clean -fd \
  --exclude='src/assets/fonts/*.ttf' \
  --exclude='node_modules/'

git pull --ff-only

echo "=== [3/7] Restoring fonts ==="
mkdir -p src/assets/fonts
for f in DejaVuSans.ttf DejaVuSans-Bold.ttf; do
  if [ ! -f "src/assets/fonts/$f" ]; then
    SRC="/usr/share/fonts/truetype/dejavu/$f"
    [ -f "$SRC" ] && cp "$SRC" "src/assets/fonts/$f" && echo "  copied $f"
  else
    echo "  $f already present"
  fi
done

echo "=== [4/7] Installing packages ==="
rm -rf node_modules .next
npm install --ignore-scripts 2>&1 | tail -4
chmod -R +x node_modules/.bin/ 2>/dev/null || true
npm rebuild 2>&1 | tail -3

echo "=== [5/7] Building ==="
npm run build

echo "=== [6/7] Starting service ==="
systemctl start alisio-pms
sleep 3
systemctl is-active alisio-pms && echo "✅ Deploy successful!" || echo "❌ Service failed to start"
