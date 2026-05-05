# Deploy Safety

Захисні механізми, що НЕ дають зламати продакшн через одну помилку в коді.

---

## Що в нас є

### 1. Pre-commit hook (локально, опційно)

**Файл:** [.githooks/pre-commit](.githooks/pre-commit)

Перед кожним `git commit` запускає `tsc --noEmit` і шукає **синтаксичні помилки** (TS1xxx — несхожі лапки, зламаний JSX, тощо). Якщо знайде — коміт блокується. Семантичні помилки (TS2xxx) не блокують, бо їх багато з періоду міграції.

**Активувати один раз після клону:**

```bash
# Linux/macOS/Git Bash
bash scripts/setup-hooks.sh

# Windows cmd
scripts\setup-hooks.cmd
```

**Скасувати:**

```bash
git config --unset core.hooksPath
```

**Обхід в надзвичайних випадках:** `git commit --no-verify` — не зловживати.

### 2. CI на GitHub Actions

**Файл:** [.github/workflows/ci.yml](.github/workflows/ci.yml)

Запускається на:
- кожен Pull Request у `main`
- push у будь-яку гілку, крім `main`

Робить:
- `npm ci` — встановлює залежності
- `npx tsc --noEmit` — TS перевірка (блокує тільки на TS1xxx)
- `npm run build` — повний Next.js білд. **Якщо падає — merge в main забороняється.**

Це найважливіший бар'єр. Якщо CI зелений, код точно компілюється.

### 3. Захищений деплой

**Файл:** [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

Деплой тригериться на push у `main`. Захист:
- `set -euo pipefail` — будь-яка помилка зупиняє деплой
- Білд **перед** перезапуском сервісу. Якщо `npm run build` падає, `systemctl restart` НЕ викликається — стара версія продовжує працювати.
- Після рестарту перевіряється `systemctl is-active`. Якщо не активний — автоматичний rollback на попередній коміт.

---

## Що ПОТРІБНО налаштувати на GitHub (10 хвилин, ручні кліки)

Без цього кроку CI існує, але прямий push у `main` все ще можливий — а значить можна обійти всі гарантії.

### Branch protection для `main`

1. Відкрий: **GitHub → Settings → Branches → Add branch ruleset** (або `Branches → Add rule` у класичному UI).
2. Branch name pattern: `main`
3. Увімкни:
   - ✅ **Require a pull request before merging**
     - Required approvals: 0 (можеш мерджити сам, але через PR)
   - ✅ **Require status checks to pass before merging**
     - Search and add: **`build`** (це job із ci.yml)
     - ✅ Require branches to be up to date before merging
   - ✅ **Do not allow bypassing the above settings** — це КРИТИЧНО. Без цієї галочки навіть admin (тобто ти і всі AI-агенти, що пушать від твого імені — AntiGravity, Claude) можуть обходити правила. У термінах API це поле називається `enforce_admins: true`.
   - ❌ Дозволити force push — НЕ вмикати
   - ❌ Дозволити deletion — НЕ вмикати
4. Save.

**Перевірка** через GitHub CLI:
```bash
"/c/Program Files/GitHub CLI/gh.exe" api repos/oleshka07/ALiSiO-Hotel-PMS/branches/main/protection \
  --jq '{enforce_admins: .enforce_admins.enabled, status_checks: .required_status_checks.contexts}'
```
Має повернути `{"enforce_admins": true, "status_checks": ["build"]}`.

### Як виглядає робочий процес після цього

```
1. git checkout -b fix/quote-issue
2. <правки>
3. git commit         ← pre-commit hook ловить syntax errors локально
4. git push origin fix/quote-issue
5. <відкрити PR на GitHub>
6. <CI зелений>       ← npm run build пройшов
7. <merge через PR>
8. → автоматичний deploy.yml на VPS
9. → set -e + build guard ловить помилки якщо CI пропустив
```

**Без branch protection** усе це зайве — людина (або AntiGravity) може просто `git push origin main`.

---

## Якщо щось зламалось ПРЯМО ЗАРАЗ

```bash
# 1. Знайти останній зелений коміт у git log
git log --oneline -20

# 2. На VPS відкотитись на нього
cd /root/projects/alisio-pms
git reset --hard <commit_sha>
npm ci --production=false
npm run build
systemctl restart alisio-pms
systemctl status alisio-pms
```

---

## TODO (наступні кроки)

Це базовий рівень. Що ще варто додати з часом:
- Staging-середовище (порт 3002) — тестувати перед merge у `main`
- Smoke-тести після deploy: автоматично пинговати `/api/health`, `/`, `/guest/<test_token>`
- Health endpoint `/api/health` що перевіряє БД + критичні сервіси
- React Error Boundaries у дашборді — щоб одна сторінка не валила весь UI
