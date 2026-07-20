#!/usr/bin/env node
/* eslint-disable */
/**
 * diagnose-teya-payload.cjs — READ-ONLY, no charge.
 *
 * Reproduces the REAL app checkout payload against Teya and bisects fields to
 * find which one triggers the 403 <html>. Reads creds from .env.local. Prints
 * HTTP status + a snippet of the FULL body (so we can see who returns the HTML).
 *
 *   node diagnose-teya-payload.cjs            # uses camping creds (kemp path)
 *   node diagnose-teya-payload.cjs main       # uses main creds (alisio default)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const s = line.trim();
  if (!s || s.startsWith('#')) continue;
  const i = s.indexOf('='); if (i < 0) continue;
  let v = s.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[s.slice(0, i).trim()] = v;
}

const which = (process.argv[2] || 'camping');
const creds = which === 'main'
  ? { client_id: env.TEYA_CLIENT_ID, client_secret: env.TEYA_CLIENT_SECRET, store_id: env.TEYA_STORE_ID }
  : { client_id: env.TEYA_CAMPING_CLIENT_ID || env.TEYA_CLIENT_ID, client_secret: env.TEYA_CAMPING_CLIENT_SECRET || env.TEYA_CLIENT_SECRET, store_id: env.TEYA_CAMPING_STORE_ID || env.TEYA_STORE_ID };

const IS_PROD = (env.TEYA_ENVIRONMENT || 'staging') === 'production';
const API = IS_PROD ? 'https://api.teya.com' : 'https://api.teya.xyz';
const OAUTH = IS_PROD ? 'https://id.teya.com/oauth/v2/oauth-token' : 'https://id.teya.xyz/oauth/v2/oauth-token';

async function token() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: creds.client_id, client_secret: creds.client_secret, scope: 'checkout/sessions/create' });
  const r = await fetch(OAUTH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (!r.ok) throw new Error('OAuth failed ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return (await r.json()).access_token;
}

async function post(tok, payload, label) {
  const r = await fetch(`${API}/v2/checkout/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  const isHtml = /^\s*<(?:!doctype|html)/i.test(txt);
  const server = r.headers.get('server') || '';
  console.log(`\n[${label}] → HTTP ${r.status}` + (r.ok ? ' ✅' : ' ❌') + (server ? `  (server: ${server})` : ''));
  console.log('   body:', isHtml ? '[HTML] ' : '', txt.replace(/\s+/g, ' ').slice(0, 300));
  return r.status;
}

(async () => {
  console.log(`Store set: ${which} | ENV: ${env.TEYA_ENVIRONMENT} | API: ${API}`);
  console.log(`store_id: ${(creds.store_id || '').slice(0,6)}…  client_id: ${(creds.client_id || '').slice(0,6)}…`);
  const tok = await token();
  console.log('OAuth: ok (fresh token)');

  const store_id = creds.store_id;
  const origin = which === 'main' ? 'https://alisio.swipescape.eu' : 'https://www.kemp-carlsbad.cz';
  const resId = 'diagRES123';
  const returnTo = `${origin}/guest/${resId}`;
  const successUrl = `${origin}/api/booking/payment-return?status=success&reservation_id=${encodeURIComponent(resId)}&return=${encodeURIComponent(returnTo)}`;
  const cancelUrl  = `${origin}/api/booking/payment-return?status=cancel&reservation_id=${encodeURIComponent(resId)}&return=${encodeURIComponent(returnTo)}`;

  const base = { store_id, amount: { currency: 'CZK', value: 100 }, type: 'SALE', line_items: [{ description: 'DIAG (ignore)', quantity: 1, unit_price: 100 }] };

  // Baseline (matches --live) — expected 201
  await post(tok, base, 'P0 minimal');
  // + metadata
  await post(tok, { ...base, metadata: { reservation_id: resId, source: 'widget_service', site_id: '50aeb822f406ff264ac5c292d0d48926' } }, 'P1 +metadata');
  // + simple same-domain success/cancel (no nested return)
  await post(tok, { ...base, success_url: `${origin}/ok`, cancel_url: `${origin}/cancel` }, 'P2 +simple urls');
  // + real nested-encoded success/cancel (as the app builds them)
  await post(tok, { ...base, success_url: successUrl, cancel_url: cancelUrl }, 'P3 +nested return urls');
  // Full app-style payload (HTTPS)
  await post(tok, { ...base, metadata: { reservation_id: resId, source: 'widget_service', site_id: '50aeb822f406ff264ac5c292d0d48926' }, success_url: successUrl, cancel_url: cancelUrl }, 'P4 FULL https');

  // ── The suspected real cause: app builds origin from req.url (http, behind nginx) ──
  const httpLocal = 'http://localhost:3001';
  const httpHost  = `http://${new URL(origin).host}`;
  await post(tok, { ...base, success_url: `${httpLocal}/api/booking/payment-return?status=success&return=${encodeURIComponent(returnTo)}`, cancel_url: `${httpLocal}/api/booking/payment-return?status=cancel` }, 'P5 http://localhost:3001');
  await post(tok, { ...base, success_url: `${httpHost}/api/booking/payment-return?status=success&return=${encodeURIComponent(returnTo)}`,  cancel_url: `${httpHost}/api/booking/payment-return?status=cancel` },  'P6 http:// real host');

  console.log('\n══════ ЧИТАЙ ТАК ══════');
  console.log('Перший рядок з ❌ 403 показує, яке поле ламає. HTML-тіло + server: показує, ХТО ріже (Teya gateway / Cloudflare / nginx).');
})();
