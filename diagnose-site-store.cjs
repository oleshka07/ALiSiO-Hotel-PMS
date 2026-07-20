#!/usr/bin/env node
/* eslint-disable */
/**
 * diagnose-site-store.cjs — READ-ONLY.
 *
 * Читає TEYA_* з .env.local (як робить робочий сервіс), показує для кожного
 * booking_site, які Teya-креденшіали резолвляться, і чи спрацьовує fallback
 * для Kemp Carlsbad. Секрети НЕ друкуються — лише префікси та факт наявності.
 *
 * Запуск на сервері:
 *   cd /root/projects/alisio-pms
 *   node diagnose-site-store.cjs
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// ─── load .env.local (standalone node НЕ робить це сам) ───────────────
const env = {};
try {
  const envPath = path.join(process.cwd(), '.env.local');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[s.slice(0, i).trim()] = v;
  }
} catch (e) {
  console.log('⚠ Не зміг прочитати .env.local:', e.message, '\n');
}

const DB_PATH = path.join(process.cwd(), 'data', 'alisio.db');

function mask(v) {
  if (!v) return '(порожньо)';
  const s = String(v);
  return s.slice(0, 6) + '…(' + s.length + ' симв.)';
}

function envStore(key) {
  const map = {
    main: {
      client_id: env.TEYA_CLIENT_ID || '',
      client_secret: env.TEYA_CLIENT_SECRET || '',
      store_id: env.TEYA_STORE_ID || '',
    },
    camping: {
      client_id: env.TEYA_CAMPING_CLIENT_ID || env.TEYA_CLIENT_ID || '',
      client_secret: env.TEYA_CAMPING_CLIENT_SECRET || env.TEYA_CLIENT_SECRET || '',
      store_id: env.TEYA_CAMPING_STORE_ID || env.TEYA_STORE_ID || '',
    },
    glamping: {
      client_id: env.TEYA_GLAMPING_CLIENT_ID || env.TEYA_CLIENT_ID || '',
      client_secret: env.TEYA_GLAMPING_CLIENT_SECRET || env.TEYA_CLIENT_SECRET || '',
      store_id: env.TEYA_GLAMPING_STORE_ID || env.TEYA_STORE_ID || '',
    },
  };
  return map[key] || map.main;
}

// Дзеркалить resolveSiteCredentials + getDefaultStore з коду
function resolveSite(site) {
  let payCfg = {};
  try { payCfg = JSON.parse(site.payment_config || '{}'); } catch { return { how: 'НЕВАЛІДНИЙ payment_config JSON', creds: null }; }

  const enabled = payCfg.enabled && payCfg.provider === 'teya' && payCfg.teya && payCfg.teya.client_id;
  if (enabled) {
    return {
      how: 'per-site payment_config (booking_sites)',
      creds: { client_id: payCfg.teya.client_id, client_secret: payCfg.teya.client_secret, store_id: payCfg.teya.store_id },
    };
  }
  const siteSlug = site.slug || '';
  const isKemp =
    site.id === '2975fba30e3cd3a6f7df3092183e258a' ||
    site.id === '50aeb822f406ff264ac5c292d0d48926' ||
    siteSlug === 'kemp-carlsbad' ||
    siteSlug.includes('kemp-carlsbad');
  if (isKemp) {
    const c = envStore('camping');
    if (c.client_id) return { how: "ENV store 'camping' (fallback Kemp Carlsbad)", creds: c };
  }
  // /book при відсутності site-creds → getDefaultStore()
  const defKey = env.TEYA_STORE || 'main';
  const def = envStore(defKey);
  return { how: `default ENV store '${defKey}' (siteCreds відсутні)`, creds: def.client_id ? def : null };
}

console.log('=== ENV Teya stores (з .env.local; лише префікси) ===\n');
for (const key of ['main', 'camping', 'glamping']) {
  const c = envStore(key);
  console.log(`  [${key}]  client_id=${mask(c.client_id)}  store_id=${mask(c.store_id)}  secret=${c.client_secret ? 'встановлено' : '(порожньо)'}`);
}
console.log(`\n  TEYA_STORE (default) = ${env.TEYA_STORE || '(не задано → main)'}`);
console.log(`  TEYA_ENVIRONMENT     = ${env.TEYA_ENVIRONMENT || '(не задано → staging)'}`);
console.log(`  Окремі camping creds? ${env.TEYA_CAMPING_CLIENT_ID ? 'ТАК' : 'НІ (падає на main)'}`);
console.log(`  Окремі glamping creds? ${env.TEYA_GLAMPING_CLIENT_ID ? 'ТАК' : 'НІ (падає на main)'}\n`);

const db = new Database(DB_PATH, { readonly: true });
const sites = db.prepare('SELECT id, slug, site_url, payment_config FROM booking_sites ORDER BY slug').all();

console.log('=== booking_sites ===\n');
for (const s of sites) {
  const r = resolveSite(s);
  const isKemp = /kemp|carlsbad/i.test(s.slug || '');
  console.log(`• slug="${s.slug}"  id=${s.id}${isKemp ? '   ← схоже, Kemp Carlsbad' : ''}`);
  console.log(`    site_url: ${s.site_url || '(немає)'}`);
  console.log(`    резолв:   ${r.how}`);
  if (r.creds) console.log(`    creds:    client_id=${mask(r.creds.client_id)}  store_id=${mask(r.creds.store_id)}`);
  console.log('');
}
db.close();

// ─── Живий тест кредів (--live): OAuth + тимчасова OPEN checkout-сесія ─────────
// Без списання. Друкує лише HTTP-статус. Запуск: node diagnose-site-store.cjs --live
if (process.argv.includes('--live')) {
  const crypto = require('crypto');
  const IS_PROD = (env.TEYA_ENVIRONMENT || 'staging') === 'production';
  const API = IS_PROD ? 'https://api.teya.com' : 'https://api.teya.xyz';
  const OAUTH = IS_PROD ? 'https://id.teya.com/oauth/v2/oauth-token' : 'https://id.teya.xyz/oauth/v2/oauth-token';

  async function testCreds(label, c) {
    if (!c.client_id || !c.client_secret || !c.store_id) {
      console.log(`\n[${label}] пропуск — креди не повні`);
      return;
    }
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: c.client_id, client_secret: c.client_secret, scope: 'checkout/sessions/create' });
    const tr = await fetch(OAUTH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    if (!tr.ok) { console.log(`\n[${label}] OAuth → HTTP ${tr.status} ❌  ${(await tr.text()).slice(0, 200)}`); return; }
    const token = (await tr.json()).access_token;
    const cr = await fetch(`${API}/v2/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ store_id: c.store_id, amount: { currency: 'CZK', value: 100 }, type: 'SALE', line_items: [{ description: 'DIAG test (ignore)', quantity: 1, unit_price: 100 }] }),
    });
    const txt = await cr.text();
    console.log(`\n[${label}] checkout → HTTP ${cr.status}` + (cr.ok ? ' ✅ (креди робочі)' : ' ❌'));
    if (!cr.ok) console.log('   тіло:', txt.replace(/\s+/g, ' ').slice(0, 220));
  }

  (async () => {
    console.log('\n════════ ЖИВИЙ ТЕСТ КРЕДІВ (без списання) ════════');
    console.log('ENV:', env.TEYA_ENVIRONMENT || 'staging', '| API:', API);
    await testCreds('main', envStore('main'));
    const camp = envStore('camping');
    if (camp.client_id !== envStore('main').client_id) await testCreds('camping', camp);
    else console.log('\n[camping] = main (окремих кредів немає) — тест пропущено');
  })();
}
