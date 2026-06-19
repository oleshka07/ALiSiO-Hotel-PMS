import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { buildGiftCode, getGiftCardTemplate, calcExpiresAt, GIFT_CARD_TEMPLATES } from '@/lib/gift-card-builder';

// GET /api/gift-cards — список ваучерів
export async function GET(req: Request) {
  try {
    const db = getDb();
    const url = new URL(req.url);
    const propertyId = url.searchParams.get('propertyId') || url.searchParams.get('property_id');
    const siteId = url.searchParams.get('site_id');
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search') || '';

    let sql = `
      SELECT v.*,
             r.check_in, r.check_out, r.unit_id
      FROM gift_cards v
      LEFT JOIN reservations r ON v.reservation_id = r.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (propertyId) {
      sql += ' AND v.property_id = ?';
      params.push(propertyId);
    } else if (siteId) {
      sql += ' AND v.property_id = (SELECT property_id FROM booking_sites WHERE id = ?)';
      params.push(siteId);
    }
    if (status && status !== 'all') {
      sql += ' AND v.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (v.code LIKE ? OR v.name LIKE ? OR v.recipient_name LIKE ? OR v.buyer_name LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }

    sql += ' ORDER BY v.created_at DESC';

    const giftCards = db.prepare(sql).all(...params);

    // Auto-expire: оновити статус прострочених ваучерів
    db.prepare(`
      UPDATE gift_cards SET status = 'expired', updated_at = datetime('now')
      WHERE status IN ('active', 'paid')
        AND expires_at IS NOT NULL
        AND expires_at < date('now')
    `).run();

    return NextResponse.json({ gift_cards: giftCards, templates: GIFT_CARD_TEMPLATES });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/gift-cards error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/gift-cards — створити ваучер
export async function POST(req: Request) {
  try {
    const db = getDb();
    const body = await req.json();
    let { property_id } = body;
    const {
      site_id,
      template_id,
      name,
      type,
      value_type,
      face_value,
      currency,
      recipient_name,
      recipient_email,
      buyer_name,
      buyer_email,
      buyer_phone,
      message,
      expires_at,
      config_json,
      notes,
      status = 'active',
    } = body;

    // Resolve site_id to property_id if property_id is not directly provided
    if (!property_id && site_id) {
      const site = db.prepare('SELECT property_id FROM booking_sites WHERE id = ?').get(site_id) as { property_id: string } | undefined;
      if (site) property_id = site.property_id;
    }

    // Валідація
    if (!property_id) {
      return NextResponse.json({ error: 'property_id or valid site_id is required' }, { status: 400 });
    }

    // Визначаємо параметри з шаблону або з тіла запиту
    const tpl = template_id ? getGiftCardTemplate(template_id) : null;
    const resolvedName = name || tpl?.name || 'Ваучер';
    const resolvedType = type || tpl?.type || 'open_date';
    const resolvedValueType = value_type || tpl?.value_type || 'fixed_czk';
    const resolvedFaceValue = face_value ?? tpl?.face_value ?? 0;
    const resolvedCurrency = currency || tpl?.currency || 'CZK';
    const resolvedConfig = config_json ?? tpl?.config_json ?? {};
    const resolvedExpires = expires_at
      || (tpl ? calcExpiresAt(tpl.validityMonths) : calcExpiresAt(12));

    // Генерація унікального коду (retry до 5 спроб)
    let code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = buildGiftCode();
      const existing = db.prepare('SELECT id FROM gift_cards WHERE code = ?').get(candidate);
      if (!existing) { code = candidate; break; }
    }
    if (!code) {
      return NextResponse.json({ error: 'Failed to generate unique giftCard code' }, { status: 500 });
    }

    const id = db.prepare(`
      INSERT INTO gift_cards (
        property_id, code, template_id, name, type, value_type,
        face_value, currency, status,
        recipient_name, recipient_email,
        buyer_name, buyer_email, buyer_phone,
        message, expires_at, config_json, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).get(
      property_id, code, template_id || 'custom', resolvedName,
      resolvedType, resolvedValueType, resolvedFaceValue, resolvedCurrency,
      status, recipient_name || null, recipient_email || null,
      buyer_name || null, buyer_email || null, buyer_phone || null,
      message || null, resolvedExpires, JSON.stringify(resolvedConfig), notes || null,
    ) as { id: string };

    const gift_card = db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(id.id);
    return NextResponse.json({ giftCard: gift_card }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/gift-cards error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
