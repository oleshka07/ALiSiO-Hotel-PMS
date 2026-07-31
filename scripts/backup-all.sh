#!/bin/bash
# ALiSiO — server-wide SQLite backup
#
# Backs up EVERY SQLite database on the box, not just the PMS. Written after an
# incident where finance data was corrupted and there was nothing to restore
# from: the old backup-db.sh covered one project, and its file mode was 644, so
# cron could never execute it and no backup ever existed.
#
# Setup (run once):
#   chmod +x /root/projects/alisio-pms/scripts/backup-all.sh
#   crontab -e
#     0 3 * * * /root/projects/alisio-pms/scripts/backup-all.sh >> /var/log/alisio-backup.log 2>&1
#
# Before a deploy:
#   /root/projects/alisio-pms/scripts/backup-all.sh --tag predeploy
#
set -uo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/root/backups}"
SEARCH_PATHS="${SEARCH_PATHS:-/root/projects /opt}"
KEEP_DAYS="${KEEP_DAYS:-30}"
MIN_FREE_MB="${MIN_FREE_MB:-2048}"
TAG="scheduled"

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="${2:-manual}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

TS="$(date +%Y-%m-%d_%H%M%S)"
DEST="$BACKUP_ROOT/$TS-$TAG"
FAILED=0
COUNT=0

echo "════ backup $TS ($TAG) ════"

command -v sqlite3 >/dev/null 2>&1 || { echo "❌ sqlite3 not installed — aborting"; exit 1; }

# Refuse to fill the disk: a backup that bricks the server is worse than none.
FREE_MB=$(df -Pm "$BACKUP_ROOT" 2>/dev/null | awk 'NR==2{print $4}' || df -Pm / | awk 'NR==2{print $4}')
if [ -n "${FREE_MB:-}" ] && [ "$FREE_MB" -lt "$MIN_FREE_MB" ]; then
  echo "❌ only ${FREE_MB}MB free (need ${MIN_FREE_MB}MB) — aborting before filling the disk"
  exit 1
fi

mkdir -p "$DEST" || { echo "❌ cannot create $DEST"; exit 1; }

# Find every SQLite file, skipping caches, node_modules and previous backups.
while IFS= read -r db; do
  case "$db" in
    */node_modules/*|*/.next/*|*/.git/*|"$BACKUP_ROOT"/*|*/backups/*) continue ;;
  esac
  # -wal / -shm are copied implicitly by sqlite3 .backup
  case "$db" in *-wal|*-shm|*.gz) continue ;; esac

  # Confirm it really is SQLite before spending time on it
  head -c 15 "$db" 2>/dev/null | grep -q "SQLite format" || continue

  rel="$(echo "${db#/}" | tr '/' '_')"
  out="$DEST/${rel}"

  if sqlite3 "$db" ".backup '$out'" 2>/dev/null; then
    # Verify the copy opens and passes an integrity check — a silently corrupt
    # backup is the worst possible outcome.
    if [ "$(sqlite3 "$out" 'PRAGMA integrity_check;' 2>/dev/null | head -1)" = "ok" ]; then
      gzip -f "$out"
      echo "  ✅ $db → $(du -h "${out}.gz" | cut -f1)"
      COUNT=$((COUNT + 1))
    else
      echo "  ❌ $db — integrity check FAILED, backup discarded"
      rm -f "$out"
      FAILED=$((FAILED + 1))
    fi
  else
    echo "  ❌ $db — sqlite3 .backup failed"
    FAILED=$((FAILED + 1))
  fi
done < <(find $SEARCH_PATHS -maxdepth 6 -type f \( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \) 2>/dev/null)

if [ "$COUNT" -eq 0 ]; then
  echo "❌ no databases backed up — something is wrong, keeping old backups"
  rmdir "$DEST" 2>/dev/null
  exit 1
fi

# Rotate only after a successful run, so a failure never destroys history.
find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' -mtime +"$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null

echo "════ done: $COUNT database(s), $FAILED failure(s) → $DEST"
echo "     total kept: $(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)"

[ "$FAILED" -gt 0 ] && exit 1
exit 0
