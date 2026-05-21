// Sync script: Send summary of all current service orders to Telegram
var https = require('https');
var db = require(process.cwd() + '/node_modules/better-sqlite3')('data/alisio.db');

var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
var CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  // Try to read from .env.local
  try {
    var fs = require('fs');
    var envContent = fs.readFileSync('.env.local', 'utf8');
    envContent.split('\n').forEach(function(line) {
      var match = line.match(/^(\w+)=(.+)$/);
      if (match) {
        if (match[1] === 'TELEGRAM_BOT_TOKEN') BOT_TOKEN = match[2].trim();
        if (match[1] === 'TELEGRAM_CHAT_ID') CHAT_ID = match[2].trim();
      }
    });
  } catch(e) { console.error('Failed to read .env.local:', e.message); }
}

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
  process.exit(1);
}

function sendTG(text) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify({ chat_id: CHAT_ID, text: text, parse_mode: 'HTML', disable_web_page_preview: true });
    var options = {
      hostname: 'api.telegram.org',
      path: '/bot' + BOT_TOKEN + '/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() { 
        if (res.statusCode === 200) resolve(body);
        else reject(new Error('TG ' + res.statusCode + ': ' + body));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

var esc = function(s) { return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; };

async function main() {
  // 1. All real paid service orders
  var paid = db.prepare(`
    SELECT so.id, so.reservation_id, so.service_id, so.quantity, so.total_price,
           so.status, so.payment_status, so.service_date, so.notes,
           ads.name_en, ads.service_type,
           g.first_name, g.last_name, u.name as unit_name,
           r.check_in, r.check_out, r.currency
    FROM service_orders so
    JOIN additional_services ads ON so.service_id = ads.id
    LEFT JOIN reservations r ON so.reservation_id = r.id
    LEFT JOIN guests g ON r.guest_id = g.id
    LEFT JOIN units u ON r.unit_id = u.id
    WHERE so.payment_status = 'paid'
      AND so.status NOT IN ('cancelled')
      AND so.total_price > 0
      AND so.id NOT LIKE 'so_bundle_%'
    ORDER BY so.service_date ASC, so.created_at DESC
  `).all();

  // 2. Pending orders
  var pending = db.prepare(`
    SELECT so.id, so.reservation_id, so.service_id, so.quantity, so.total_price,
           so.status, so.payment_status, so.service_date, so.notes,
           ads.name_en, ads.service_type,
           g.first_name, g.last_name, u.name as unit_name,
           r.check_in, r.check_out, r.currency
    FROM service_orders so
    JOIN additional_services ads ON so.service_id = ads.id
    LEFT JOIN reservations r ON so.reservation_id = r.id
    LEFT JOIN guests g ON r.guest_id = g.id
    LEFT JOIN units u ON r.unit_id = u.id
    WHERE so.payment_status = 'pending'
      AND so.status NOT IN ('cancelled')
      AND so.total_price > 0
      AND so.id NOT LIKE 'so_bundle_%'
    ORDER BY so.service_date ASC
  `).all();

  // 3. Bundle orders with known guests (future dates)
  var bundles = db.prepare(`
    SELECT so.id, so.reservation_id, so.service_id, so.service_date,
           ads.name_en,
           g.first_name, g.last_name, u.name as unit_name,
           r.check_in, r.check_out
    FROM service_orders so
    JOIN additional_services ads ON so.service_id = ads.id
    LEFT JOIN reservations r ON so.reservation_id = r.id
    LEFT JOIN guests g ON r.guest_id = g.id
    LEFT JOIN units u ON r.unit_id = u.id
    WHERE so.id LIKE 'so_bundle_%'
      AND g.first_name IS NOT NULL
      AND r.check_in >= date('now')
    ORDER BY r.check_in ASC
  `).all();

  // Format one order line
  function formatOrder(o) {
    var name = esc(o.name_en || o.service_name || '?');
    var guest = esc((o.first_name || '?') + ' ' + (o.last_name || ''));
    var unit = esc(o.unit_name || '?');
    var date = o.service_date || 'TBD';
    var timeTag = '';
    if (o.notes && o.service_type === 'slot_booking') {
      try {
        var n = JSON.parse(o.notes);
        if (n.startHour != null) timeTag = ' ' + String(n.startHour).padStart(2,'0') + ':00–' + String(n.startHour + (n.hours || 1)).padStart(2,'0') + ':00';
      } catch(e) {}
    }
    return '  • ' + name + ' — 👤 ' + guest + ' 🏠 ' + unit + '\n    📅 ' + date + timeTag + ' · 💰 ' + (o.total_price || 0) + ' ' + (o.currency || 'CZK');
  }

  // Build message
  var lines = [];
  lines.push('📋 <b>Зведення замовлень послуг</b>');
  lines.push('');

  if (paid.length > 0) {
    lines.push('✅ <b>Оплачені (' + paid.length + '):</b>');
    paid.forEach(function(o) { lines.push(formatOrder(o)); });
    lines.push('');
  }

  if (pending.length > 0) {
    lines.push('⏳ <b>Очікують оплати (' + pending.length + '):</b>');
    pending.forEach(function(o) { lines.push(formatOrder(o)); });
    lines.push('');
  }

  if (bundles.length > 0) {
    lines.push('🎁 <b>Включені в пакет (VIP):</b>');
    bundles.forEach(function(o) {
      var name = esc(o.name_en || '?');
      var guest = esc((o.first_name || '?') + ' ' + (o.last_name || ''));
      var unit = esc(o.unit_name || '?');
      lines.push('  • ' + name + ' — 👤 ' + guest + ' 🏠 ' + unit);
      lines.push('    📅 Заїзд: ' + o.check_in + ' → ' + o.check_out);
    });
    lines.push('');
  }

  var totalPaid = paid.reduce(function(s, o) { return s + (o.total_price || 0); }, 0);
  var totalPending = pending.reduce(function(s, o) { return s + (o.total_price || 0); }, 0);
  lines.push('💰 Оплачено: ' + totalPaid + ' CZK | Очікує: ' + totalPending + ' CZK');

  var text = lines.join('\n');
  console.log('Sending to TG...');
  console.log(text);
  
  try {
    await sendTG(text);
    console.log('\n✅ Sent to Telegram successfully!');
  } catch(e) {
    console.error('\n❌ TG send failed:', e.message);
  }
}

main();
