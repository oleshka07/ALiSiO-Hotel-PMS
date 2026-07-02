/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Public endpoint — called by the JS collector widget embedded on partner sites.
 * No authentication. Validated by site_id + Origin header against allowed_domains.
 * Intentionally kept simple: no external deps, synchronous SQLite.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { executeCreateLead, executeCreateMessage } from '@crm';

// Honeypot field name injected by collector.js — bots fill it, humans don't.
const HONEYPOT_FIELD = '_hp_trap';

// Simple rate-limit store: ip → { count, resetAt }
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

function sanitize(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  return val.replace(/<[^>]*>/g, '').trim().slice(0, 1000) || null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Smart-map: guess field purpose by name / type hint
function extractLeadFields(data: Record<string, unknown>) {
  let fullName: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let message: string | null = null;

  const NAME_KEYS = ['name', 'full_name', 'fullname', 'jmeno', 'meno', 'ime', 'vorname', 'nachname', 'surname', 'firstname', 'lastname', 'first_name', 'last_name'];
  const EMAIL_KEYS = ['email', 'mail', 'e_mail', 'email_address', 'user_email'];
  const PHONE_KEYS = ['phone', 'tel', 'telephone', 'mobile', 'mobil', 'phone_number', 'telefon'];
  const MSG_KEYS = ['message', 'msg', 'comment', 'note', 'text', 'zprava', 'sprava', 'nachricht'];

  for (const [key, val] of Object.entries(data)) {
    const k = key.toLowerCase().replace(/[-\s]/g, '_');
    const v = sanitize(val);
    if (!v) continue;
    if (!email && EMAIL_KEYS.some(ek => k.includes(ek))) { email = v; continue; }
    if (!phone && PHONE_KEYS.some(pk => k.includes(pk))) { phone = v; continue; }
    if (!message && MSG_KEYS.some(mk => k.includes(mk))) { message = v; continue; }
    if (!fullName && NAME_KEYS.some(nk => k.includes(nk))) { fullName = v; continue; }
  }
  return { fullName, email, phone, message };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Honeypot check
  if (body[HONEYPOT_FIELD]) {
    return NextResponse.json({ ok: true }); // silently drop bots
  }

  const siteId = sanitize(body.siteId ?? body.site_id);
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const db = getDb();

  // Validate site exists and is active
  const site = db.prepare(`SELECT id, allowed_domains, status FROM booking_sites WHERE id = ?`).get(siteId) as any;
  if (!site || site.status !== 'active') {
    return NextResponse.json({ error: 'Site not found or inactive' }, { status: 403 });
  }

  // CORS / origin validation
  const origin = req.headers.get('origin') ?? '';
  if (site.allowed_domains) {
    const allowed: string[] = JSON.parse(site.allowed_domains ?? '[]');
    if (allowed.length > 0) {
      const originHost = (() => { try { return new URL(origin).hostname; } catch { return ''; } })();
      const ok = allowed.some(d => originHost === d || originHost.endsWith('.' + d));
      if (!ok) {
        return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
      }
    }
  }

  // Find active script for this site
  const script = db.prepare(`SELECT id FROM site_capture_scripts WHERE site_id = ? AND is_active = 1 LIMIT 1`).get(siteId) as any;
  const scriptId = script?.id ?? null;

  // Extract lead fields (smart mapping)
  const { fullName, email, phone, message } = extractLeadFields(body as Record<string, unknown>);

  // At least email or phone required
  if (!email && !phone) {
    return NextResponse.json({ error: 'Email or phone required' }, { status: 422 });
  }
  if (email && !isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 422 });
  }

  const sourceUrl = sanitize(body.sourceUrl ?? body.source_url ?? body.url);
  const rawData = JSON.stringify(body).slice(0, 4000);

  db.prepare(`
    INSERT INTO site_incoming_leads (site_id, script_id, full_name, email, phone, message, source_url, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(siteId, scriptId, fullName, email, phone, message, sourceUrl, rawData);

  let outLeadId: string | undefined;
  let outConvId: string | undefined;

  // ── Create or merge into existing CRM lead ──
  try {
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
    if (org) {
      // Parse name into first/last
      const nameParts = (fullName ?? '').trim().split(/\s+/);
      const firstName = nameParts[0] || email?.split('@')[0] || phone || 'Гість';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

      // Site name for context
      const siteName = (db.prepare('SELECT name FROM booking_sites WHERE id = ?').get(siteId) as any)?.name ?? '';

      // ── Try to find existing lead by email or phone ──
      let existingLead: any = null;
      if (email) {
        existingLead = db.prepare('SELECT * FROM crm_leads WHERE email = ? COLLATE NOCASE').get(email);
      }
      if (!existingLead && phone && phone.length >= 8) {
        // Normalize phone for matching: strip spaces and leading +
        const phoneDigits = phone.replace(/[\s\-()]/g, '');
        existingLead = db.prepare(
          'SELECT * FROM crm_leads WHERE phone = ? OR phone = ? OR whatsapp = ? OR whatsapp = ?'
        ).get(phone, phoneDigits, phone, phoneDigits);
      }

      let lead: any;
      let conversationId: string;

      if (existingLead) {
        // ── MERGE: use existing lead ──
        lead = existingLead;
        console.log(`[capture] Merging into existing lead ${lead.id} (${lead.first_name} ${lead.email || lead.phone})`);

        // Enrich lead with missing data
        const updates: string[] = [];
        const updateVals: any[] = [];
        if (!lead.email && email) { updates.push('email = ?'); updateVals.push(email); }
        if (!lead.phone && phone) { updates.push('phone = ?'); updateVals.push(phone); }
        if (!lead.last_name && lastName) { updates.push('last_name = ?'); updateVals.push(lastName); }
        if (updates.length > 0) {
          updates.push("updated_at = datetime('now')");
          db.prepare(`UPDATE crm_leads SET ${updates.join(', ')} WHERE id = ?`).run(...updateVals, lead.id);
        }

        // Find existing conversation
        const conv = db.prepare('SELECT id FROM crm_conversations WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1').get(lead.id) as any;
        if (conv) {
          conversationId = conv.id;
        } else {
          // Create conversation if somehow missing
          const convId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
          const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
          db.prepare(`INSERT INTO crm_conversations (id, lead_id, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`)
            .run(convId, lead.id, `${lead.first_name} ${lead.last_name || ''} — повторна заявка`.trim(), now, now);
          conversationId = convId;
        }
      } else {
        // ── NEW LEAD ──
        const leadData = {
          firstName,
          lastName,
          email: email ?? undefined,
          phone: phone ?? undefined,
          source: 'web_form',
          notes: message ? `Повідомлення: ${message}${siteName ? `\n\nДжерело: ${siteName}` : ''}` : (siteName ? `Джерело: ${siteName}` : null),
        };
        const result = executeCreateLead(db, leadData);
        lead = result.lead;
        conversationId = result.conversationId;
      }

      outLeadId = lead.id;
      outConvId = conversationId;

      // ── Add message to the conversation ──
      const lines: string[] = [];
      if (existingLead) lines.push('🔄 Повторна заявка з сайту');
      if (fullName) lines.push(`👤 Ім'я: ${fullName}`);
      if (email) lines.push(`✉️ Email: ${email}`);
      if (phone) lines.push(`📞 Телефон: ${phone}`);
      if (message) lines.push(`💬 Повідомлення: ${message}`);
      if (sourceUrl) lines.push(`🔗 Сторінка: ${sourceUrl}`);
      if (siteName) lines.push(`🌍 Сайт: ${siteName}`);
      const msgContent = lines.join('\n') || 'Заявка з сайту (без деталей)';

      const createdMessage = await executeCreateMessage(db, conversationId, {
        channelType: 'web_form',
        direction: 'inbound',
        senderType: 'guest',
        senderName: firstName,
        content: msgContent,
        contentType: 'text'
      });

      // ── Trigger AI Auto-Response (only for new leads) ──
      if (!existingLead && email && process.env.OPENAI_API_KEY) {
        import('@/lib/ai/auto-response').then(({ generateAutoResponse }) => {
          generateAutoResponse({
            messageId: createdMessage.id,
            conversationId,
            leadId: lead.id,
            accountId: 'gmail',
            guestName: fullName || firstName,
            guestEmail: email,
            subject: 'Заявка з сайту / Форма зворотного зв\'язку',
            content: msgContent,
            language: 'uk',
          }).catch(err => console.error('[capture] AutoResponse error:', err.message));
        });
      }
    }
  } catch (crmErr: any) {
    console.error('[capture] CRM lead creation failed:', crmErr?.message);
  }

  const headers = new Headers({ 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  return NextResponse.json({ ok: true, leadId: outLeadId, conversationId: outConvId }, { headers });
}

// Handle CORS preflight
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
