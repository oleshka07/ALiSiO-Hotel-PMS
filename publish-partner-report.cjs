#!/usr/bin/env node
/**
 * Публікує партнерський звіт: створює таблицю, якщо її ще немає, кладе HTML і
 * повертає посилання з токеном.
 *
 *   node publish-partner-report.cjs <файл.html> "Назва" 2026-07 [--apply]
 */
const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [file, title, period] = process.argv.slice(2).filter((a) => a !== '--apply');
const APPLY = process.argv.includes('--apply');
if (!file || !title) {
  console.error('використання: node publish-partner-report.cjs <файл.html> "Назва" [період] [--apply]');
  process.exit(1);
}
if (!fs.existsSync(file)) { console.error(`немає файлу: ${file}`); process.exit(1); }

const html = fs.readFileSync(file, 'utf8');
if (!/<html/i.test(html)) { console.error('це не схоже на HTML-документ'); process.exit(1); }

const db = new Database(path.join(__dirname, 'data/alisio.db'));
db.pragma('busy_timeout = 15000');

// Та сама схема, що в міграції src/lib/db.ts — щоб застосувати до перезапуску.
db.exec(`
  CREATE TABLE IF NOT EXISTS partner_reports (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    period TEXT,
    html TEXT NOT NULL,
    is_published INTEGER NOT NULL DEFAULT 1,
    view_count INTEGER NOT NULL DEFAULT 0,
    last_viewed_at TEXT,
    created_by TEXT REFERENCES app_users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_partner_reports_token ON partner_reports(token);
  CREATE INDEX IF NOT EXISTS idx_partner_reports_period ON partner_reports(organization_id, period DESC);
`);

const org = db.prepare('SELECT id FROM organizations LIMIT 1').get().id;
const imgs = (html.match(/data:image\//g) || []).length;

console.log(`файл:    ${path.basename(file)}`);
console.log(`розмір:  ${(html.length / 1024 / 1024).toFixed(2)} МБ`);
console.log(`фото:    ${imgs} вбудованих base64`);
console.log(`назва:   ${title}`);
console.log(`період:  ${period || '—'}`);

if (!APPLY) { console.log('\nПробний прогін. Для публікації — з --apply'); process.exit(0); }

const id = `prep_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const token = crypto.randomBytes(32).toString('hex');
db.prepare(`INSERT INTO partner_reports (id, organization_id, token, title, period, html, is_published)
            VALUES (?, ?, ?, ?, ?, ?, 1)`).run(id, org, token, title, period || null, html);

console.log(`\n✅ опубліковано`);
console.log(`   id:  ${id}`);
console.log(`   URL: https://alisio.swipescape.eu/report/${token}`);
db.close();
