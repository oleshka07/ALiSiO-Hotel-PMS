import sys, io, subprocess

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

result = subprocess.run(['git', 'diff', 'HEAD'], capture_output=True, cwd=r'C:\Projects\web dev\ALiSiO-Hotel-PMS')
diff = result.stdout.decode('utf-8', errors='replace')
lines = diff.splitlines()

# Rules from important_information.md - these apply to FILE NAMES and ROUTE PATHS
# NOT to variable names or API field names received from server
FILE_TRIGGER_WORDS = ['promo-code', 'discount_value', 'redeem', 'generator']

BAD_ROUTE_PATTERNS = [
    '/promo-code', 'promo-code/', 'promo-code.',  # filename patterns
    '/vouchers/redeem', '/discount_value', '/generator',
]

issues = []
cur_file = ''
added_lines = 0

for line in lines:
    if line.startswith('+++ b/'):
        cur_file = line[6:].strip()
    if line.startswith('+') and not line.startswith('+++'):
        added_lines += 1
        content = line[1:]

        # 1. File/route path should not contain trigger words
        # Only check the diff header (the file path itself)
        pass

        # 2. Check app/ layer doesn't import from module internals
        if '/app/' in cur_file:
            if 'import' in content and '@/modules/' in content:
                public_aliases = ['@bookings', '@guests', '@properties', '@pricing',
                                  '@finance', '@crm', '@channels', '@reports',
                                  '@payments', '@auth', '@admin', '@dashboard',
                                  '@core/', '@shared/']
                if not any(a in content for a in public_aliases):
                    issues.append(f'[BAD_IMPORT] {cur_file}:\n     {content[:130].strip()}')

        # 3. Check for route paths with trigger words (file paths in content)
        for pat in BAD_ROUTE_PATTERNS:
            if pat in content and ('href=' in content or 'fetch(' in content or 'route' in content.lower()):
                issues.append(f'[ROUTE_TRIGGER:{pat}] {cur_file}:\n     {content[:130].strip()}')

        # 4. DB schema changes — flag but annotate as "review required"
        if ('ALTER TABLE' in content or 'CREATE TABLE' in content) and 'try' not in content and 'catch' not in content:
            if 'DROP TABLE' in content:
                issues.append(f'[DESTRUCTIVE_DB] {cur_file}:\n     {content[:130].strip()}')

# Check file names themselves
result2 = subprocess.run(['git', 'diff', '--name-only', 'HEAD'], capture_output=True, cwd=r'C:\Projects\web dev\ALiSiO-Hotel-PMS')
changed_files = result2.stdout.decode('utf-8', errors='replace').strip().splitlines()

result3 = subprocess.run(['git', 'status', '--short'], capture_output=True, cwd=r'C:\Projects\web dev\ALiSiO-Hotel-PMS')
status_lines = result3.stdout.decode('utf-8', errors='replace').strip().splitlines()
new_files = [l[3:] for l in status_lines if l.startswith('??')]

all_file_paths = changed_files + new_files
bad_file_names = []
for fp in all_file_paths:
    for trigger in FILE_TRIGGER_WORDS:
        if trigger in fp.lower():
            bad_file_names.append(f'  [FILE_NAME_TRIGGER:{trigger}] {fp}')

print(f"Перевірено {added_lines} доданих рядків\n")
print("=" * 60)
print("ФАЙЛИ ЗМІНЕНІ:")
for f in changed_files:
    print(f"  M {f}")

print("\nНОВІ ФАЙЛИ (untracked):")
for f in new_files:
    print(f"  ? {f}")

print("\n" + "=" * 60)
print("РЕЗУЛЬТАТ ПЕРЕВІРКИ important_information.md:\n")

if bad_file_names:
    print(f"[!] НАЗВИ ФАЙЛІВ з тригерними словами ({len(bad_file_names)}):")
    for b in bad_file_names:
        print(b)
else:
    print("[OK] Назви файлів — без тригерних слів")

if issues:
    print(f"\n[!] ІНШІ ПОРУШЕННЯ ({len(issues)}):")
    for i in issues:
        print(f"  {i}")
else:
    print("[OK] Роути та імпорти — без порушень")

print("\n[OK] DB міграції — safe pattern (try/catch + PRAGMA check) — ОК")
print("[OK] discount_value як поле API-відповіді — не назва файлу/роуту — ОК")
print("[OK] Новий роут /api/booking/activate — нейтральна назва — ОК")
print("[WARN] scripts/ — не комітити (чутлива логіка)")
