#!/bin/bash
# ALiSiO PMS — Safe Deploy Script
# Usage: bash /root/projects/alisio-pms/scripts/deploy-vps.sh
#
# Written after a deploy took the site down for hours. The old version did:
#
#     rm -rf node_modules .next     # working build destroyed FIRST
#     npm run build                 # 3 GB heap on a 4 GB box
#     systemctl start alisio-pms    # never reached, because `set -e`
#
# When the build was killed — and on this box it is killed, the heap ceiling is
# --max-old-space-size=3072 while the machine has 4 GB total — there was no
# .next left to serve, no node_modules to retry with, and the script exited
# before restarting the service. The site returned HTML with 500s on every JS
# chunk, which reads to a user as "everything is broken".
#
# Three rules now hold:
#   1. Never delete the working build until the new one succeeds.
#   2. Refuse to start if there is not enough memory to finish.
#   3. The service comes back up on EVERY exit path, including failure.

set -uo pipefail
cd /root/projects/alisio-pms

NEXT_DIR=".next"
PREV_DIR=".next.prev"
NEED_MB="${DEPLOY_NEED_MB:-3600}"
REINSTALL="${DEPLOY_REINSTALL:-0}"   # DEPLOY_REINSTALL=1 to wipe node_modules
STARTED=0

restore_and_start() {
  if [ "$STARTED" -eq 1 ]; then return; fi
  STARTED=1
  if [ -d "$PREV_DIR" ]; then
    echo "↩  Повертаю попередній робочий білд"
    rm -rf "$NEXT_DIR"
    mv "$PREV_DIR" "$NEXT_DIR"
  fi
  echo "=== Піднімаю сервіс ==="
  systemctl start alisio-pms || true
  sleep 3
  systemctl is-active --quiet alisio-pms \
    && echo "✅ Сервіс працює" \
    || echo "❌ Сервіс НЕ піднявся — journalctl -u alisio-pms -n 50"
}
# Any failure, Ctrl-C or OOM-kill of this script still restarts the service.
trap 'echo "⚠️  Деплой обірвано"; restore_and_start; exit 1' ERR INT TERM

echo "=== [0/7] Бекап перед будь-якими змінами ==="
bash /root/projects/alisio-pms/scripts/backup-all.sh --tag predeploy || {
  echo "❌ Бекап не вдався — ДЕПЛОЙ СКАСОВАНО. Спершу полагодь бекап."
  exit 1
}

echo "=== [1/7] Перевірка памʼяті ==="
# Every probe below must be incapable of failing. `ps -C <name>` exits 1 when
# nothing matches, and under `pipefail` that failed the assignment and fired the
# ERR trap — the deploy aborted before printing a single number, which looked
# like the memory check itself was broken. A diagnostic must never be the thing
# that stops the run.
meminfo_mb() { awk -v k="$1" '$1==k":"{print int($2/1024); f=1} END{if(!f) print 0}' /proc/meminfo 2>/dev/null || echo 0; }
AVAIL_MB=$(meminfo_mb MemAvailable)
SWAP_FREE_MB=$(meminfo_mb SwapFree)

# Identify the service by its systemd MainPID, not by process name: matching on
# a name risks counting an unrelated node process (a Claude Code session) as
# memory the deploy is about to get back.
SVC_MB=0
SVC_PID=$(systemctl show -p MainPID --value alisio-pms 2>/dev/null || echo 0)
if [ "${SVC_PID:-0}" -gt 0 ] 2>/dev/null; then
  SVC_MB=$(ps -o rss= -p "$SVC_PID" 2>/dev/null | awk '{print int($1/1024)}' || echo 0)
fi
[ -n "${SVC_MB:-}" ] || SVC_MB=0

USABLE=$(( AVAIL_MB + SWAP_FREE_MB + SVC_MB ))
echo "  вільно ${AVAIL_MB}MB + swap ${SWAP_FREE_MB}MB + сервіс поверне ${SVC_MB}MB = ${USABLE}MB (треба ${NEED_MB}MB)"

# Anything else large running — a Claude Code session, another build — competes
# for the same pool and is the usual reason the build gets killed.
OTHER=$(ps -eo rss=,comm= --sort=-rss 2>/dev/null | awk -v pid_mb="$SVC_MB" '$1>300000 && $2!="next-server"{printf "    %6dMB  %s\n", $1/1024, $2}' || true)
if [ -n "${OTHER:-}" ]; then
  echo "  ⚠️  інші великі процеси (конкурують за памʼять):"
  echo "$OTHER"
fi

if [ "$USABLE" -lt "$NEED_MB" ]; then
  echo "❌ Замало памʼяті для збірки. Нічого не чіпав, сайт працює."
  echo "   Закрий інші процеси або додай swap, і запусти знову."
  exit 1
fi

echo "=== [2/7] Зупиняю сервіс ==="
systemctl stop alisio-pms || true

echo "=== [3/7] Тягну код ==="
# `git reset --hard` + `git clean -fd` below erase uncommitted work without
# asking. A session working on the server leaves exactly that behind, so refuse
# rather than delete someone's unfinished feature.
if [ -n "$(git status --porcelain -- . ':!node_modules' ':!.next')" ]; then
  echo "❌ У робочій копії є незбережені зміни:"
  git status --short -- . ':!node_modules' ':!.next' | head -20
  echo
  echo "   Деплой стер би їх. Спершу збережи:"
  echo "     git add -A && git commit -m '...'      (і запуш у гілку)"
  echo "   або відклади:"
  echo "     git stash push -u -m 'before deploy'"
  echo "   Сайт не чіпав."
  systemctl start alisio-pms || true
  exit 1
fi
git fetch origin main
git reset --hard origin/main
git clean -fd \
  --exclude='src/assets/fonts/*.ttf' \
  --exclude='node_modules/'

echo "=== [4/7] Шрифти ==="
mkdir -p src/assets/fonts
for f in DejaVuSans.ttf DejaVuSans-Bold.ttf; do
  if [ ! -f "src/assets/fonts/$f" ]; then
    SRC="/usr/share/fonts/truetype/dejavu/$f"
    [ -f "$SRC" ] && cp "$SRC" "src/assets/fonts/$f" && echo "  скопійовано $f"
  else
    echo "  $f на місці"
  fi
done

echo "=== [5/7] Пакети ==="
# node_modules is NOT wiped by default: a failed reinstall used to leave the
# box with no way to build and no way to serve.
if [ "$REINSTALL" = "1" ] || [ ! -d node_modules ]; then
  echo "  повне перевстановлення"
  rm -rf node_modules
  npm install --ignore-scripts 2>&1 | tail -4
  chmod -R +x node_modules/.bin/ 2>/dev/null || true
  npm rebuild 2>&1 | tail -3
else
  npm install --ignore-scripts --no-audit --no-fund 2>&1 | tail -3
fi

echo "=== [6/7] Збірка (робочий білд поки недоторканий) ==="
rm -rf "$PREV_DIR"
[ -d "$NEXT_DIR" ] && mv "$NEXT_DIR" "$PREV_DIR"

if npm run build; then
  # BUILD_ID is written last. Without it the directory is a half-build that
  # serves pages while every JS chunk 500s — exactly the state that looked like
  # a dead site.
  if [ -f "$NEXT_DIR/BUILD_ID" ]; then
    echo "✅ Збірка завершена повністю"
    rm -rf "$PREV_DIR"
  else
    echo "❌ Збірка обірвалась (немає BUILD_ID) — швидше за все OOM"
    restore_and_start
    exit 1
  fi
else
  echo "❌ Збірка впала"
  restore_and_start
  exit 1
fi

echo "=== [7/7] Запуск ==="
trap - ERR INT TERM
STARTED=1
systemctl start alisio-pms
sleep 3
if systemctl is-active --quiet alisio-pms; then
  echo "✅ Деплой успішний"
else
  echo "❌ Сервіс не піднявся — journalctl -u alisio-pms -n 50"
  exit 1
fi
