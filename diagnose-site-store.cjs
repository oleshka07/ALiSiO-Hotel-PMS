#!/usr/bin/env node
/**
 * diagnose-site-store.cjs — READ-ONLY.
 *
 * Показує для кожного booking_site: slug, id, site_url, і що резолвиться
 * як Teya-креденшіали (per-site payment_config чи ENV-store).
 * Секрети НЕ друкуються — лише назви змінних, префікси (перші 6 символів)
 * та чи вони встановлені.
 *
 * Запуск на сервері:
 *   cd /root/projects/alisio-pms
 *   node diagnose-site-store.cjs
 */
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data', 'alisio.db');

function mask(v) {
  if (!v) return '(порожньо)';
  const s = String(v);
  return s.slice(0, 6) + '…(' + s.length + ' симв.)';
}

function envStore(key) {
  const map = {
    main: {
      client_id: process.env.TEYA_CLIENT_ID || '',
      client_secret: process.env.TEYA_CLIENT_SECRET || '',
      store_id: process.env.TEYA_STORE_ID || '',
    },
    camping: {
      client_id: process.env.TEYA_CAMPING_CLIENT_ID || process.env.TEYA_CLIENT_ID || '',
      client_secret: process.env.TEYA_CAMPING_CLIENT_SECRET || process.env.TEYA_CLIENT_SECRET || '',
      store_id: process.env.TEYA_CAMPING_STORE_ID || process.env.TEYA_STORE_ID || '',
    },
    glamping: {
      client_id: process.env.TEYA_GLAMPING_CLIENT_ID || process.env.TEYA_CLIENT_ID || '',
      client_secret: process.env.TEYA_GLAMPING_CLIENT_SECRET || process.env.TEYA_CLIENT_SECRET || '',
      store_id: process.env.TEYA_GLAMPING_STORE_ID || process.env.TEYA_STORE_ID || '',
    },
  };
  return map[key] || map.main;
}

function resolveSite(site) {
  let payCfg = {};
  try { payCfg = JSON.parse(site.payment_config || '{}'); } catch { return { how: 'НЕВАЛІДНИЙ payment_config JSON', creds: null }; }

  const enabled = payCfg.enabled && payCfg.provider === 'teya' && payCfg.teya && payCfg.teya.client_id;
  if (enabled) {
    return {
      how: 'per-site payment_config (booking_sites)',
      creds: {
        client_id: payCfg.teya.client_id,
        client_secret: payCfg.teya.client_secret,
        store_id: payCfg.teya.store_id,
      },
    };
  }
  if (site.id === '2975fba30e3cd3a6f7df3092183e258a' || site.slug === 'kemp-carlsbad') {
    const c = envStore('camping');
    if (c.client_id) return { how: "ENV store 'camping' (fallback Kemp Carlsbad)", creds: c };
  }
  return { how: 'per-site НЕ налаштовано → у /book піде default TEYA_STORE або creds не задано', creds: null };
}

console.log('=== ENV Teya stores (лише назви/префікси, без секретів) ===\n');
for (const key of ['main', 'camping', 'glamping']) {
  const c = envStore(key);
  console.log(`  [${key}]  client_id=${mask(c.client_id)}  store_id=${mask(c.store_id)}  secret=${c.client_secret ? 'встановлено' : '(порожньо)'}`);
}
console.log(`\n  TEYA_STORE (default) = ${process.env.TEYA_STORE || '(не задано → main)'}`);
console.log(`  TEYA_ENVIRONMENT     = ${process.env.TEYA_ENVIRONMENT || '(не задано → staging)'}`);
console.log(`  Окремі camping creds задані? ${process.env.TEYA_CAMPING_CLIENT_ID ? 'ТАК' : 'НІ (падає на main)'}`);
console.log(`  Окремі glamping creds задані? ${process.env.TEYA_GLAMPING_CLIENT_ID ? 'ТАК' : 'НІ (падає на main)'}\n`);

const db = new Database(DB_PATH, { readonly: true });
const sites = db.prepare('SELECT id, slug, site_url, payment_config FROM booking_sites ORDER BY slug').all();

console.log('=== booking_sites ===\n');
for (const s of sites) {
  const r = resolveSite(s);
  console.log(`• slug="${s.slug}"  id=${s.id}`);
  console.log(`    site_url: ${s.site_url || '(немає)'}`);
  console.log(`    резолв:   ${r.how}`);
  if (r.creds) {
    console.log(`    creds:    client_id=${mask(r.creds.client_id)}  store_id=${mask(r.creds.store_id)}  secret=${r.creds.client_secret ? 'встановлено' : '(порожньо)'}`);
  }
  console.log('');
}

const alisio = sites.find(s => (s.site_url || '').includes('alisio.swipescape.eu') || s.slug === 'alisio');
console.log('=== Висновок для alisio.swipescape.eu ===');
if (alisio) {
  const r = resolveSite(alisio);
  console.log(`  Сайт: slug="${alisio.slug}"  id=${alisio.id}`);
  console.log(`  Резолв креденшіалів: ${r.how}`);
} else {
  console.log('  Сайт із site_url alisio.swipescape.eu НЕ знайдено — можливо, /book бере глобальні env creds напряму.');
}
db.close();
