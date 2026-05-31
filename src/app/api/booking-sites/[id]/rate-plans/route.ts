/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

// GET /api/booking-sites/[id]/rate-plans
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const db = getDb();

    const site = db.prepare("SELECT id FROM booking_sites WHERE id = ? AND status != 'deleted'").get(id);
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    const plans = db.prepare(`
      SELECT * FROM site_rate_plans
      WHERE site_id = ? AND is_active = 1
      ORDER BY is_default DESC, created_at ASC
    `).all(id) as any[];

    for (const plan of plans) {
      try { plan.payment_schedule = JSON.parse(plan.payment_schedule); } catch { /* */ }
      try { plan.meals_included = JSON.parse(plan.meals_included); } catch { /* */ }
      try { plan.applied_listings = JSON.parse(plan.applied_listings); } catch { /* */ }
      try { plan.valid_weekdays = plan.valid_weekdays ? JSON.parse(plan.valid_weekdays) : null; } catch { /* */ }
    }

    return NextResponse.json({ plans });
  } catch (error: any) {
    console.error('GET rate-plans error:', error?.message);
    return NextResponse.json({ error: 'Failed to fetch rate plans' }, { status: 500 });
  }
}

// POST /api/booking-sites/[id]/rate-plans
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(request.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const site = db.prepare("SELECT id FROM booking_sites WHERE id = ? AND status != 'deleted'").get(id);
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    const {
      name,
      is_default = 0,
      cancellation_policy = 'non_refundable',
      payment_schedule = [{ percent: 100, trigger: 'on_booking' }],
      meals_included = [],
      min_days_before_checkin = 0,
      same_day_cutoff_hour = null,
      min_stay = 1,
      max_stay = 999,
      pricing_mode = 'independent',
      pricing_modifier_percent = null,
      pricing_modifier_type = 'less',
      derived_from_plan_id = null,
      valid_weekdays = null,
      applied_listings = [],
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Назва тарифу обовʼязкова' }, { status: 400 });
    }

    const validPolicies = ['non_refundable', 'full_refund', 'flexible'];
    if (!validPolicies.includes(cancellation_policy)) {
      return NextResponse.json({ error: 'Невірна політика скасування' }, { status: 400 });
    }

    if (is_default) {
      db.prepare('UPDATE site_rate_plans SET is_default = 0 WHERE site_id = ?').run(id);
    }

    // Normalise legacy 'derived' value → 'dependent' (DB CHECK constraint)
    const safePricingMode = pricing_mode === 'derived' ? 'dependent' : pricing_mode;

    const result = db.prepare(`
      INSERT INTO site_rate_plans (
        site_id, name, is_default, cancellation_policy, payment_schedule,
        meals_included, min_days_before_checkin, same_day_cutoff_hour,
        min_stay, max_stay, pricing_mode, applied_listings,
        pricing_modifier_percent, pricing_modifier_type, derived_from_plan_id, valid_weekdays
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name.trim(), is_default ? 1 : 0, cancellation_policy,
      JSON.stringify(payment_schedule),
      JSON.stringify(meals_included),
      min_days_before_checkin, same_day_cutoff_hour,
      min_stay, max_stay, safePricingMode,
      JSON.stringify(applied_listings),
      pricing_modifier_percent, pricing_modifier_type, derived_from_plan_id,
      valid_weekdays ? JSON.stringify(valid_weekdays) : null
    );


    const plan = db.prepare('SELECT * FROM site_rate_plans WHERE rowid = ?').get(result.lastInsertRowid) as any;
    try { plan.payment_schedule = JSON.parse(plan.payment_schedule); } catch { /* */ }
    try { plan.meals_included = JSON.parse(plan.meals_included); } catch { /* */ }
    try { plan.applied_listings = JSON.parse(plan.applied_listings); } catch { /* */ }
    try { plan.valid_weekdays = plan.valid_weekdays ? JSON.parse(plan.valid_weekdays) : null; } catch { /* */ }

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error: any) {
    console.error('POST rate-plans error:', error?.message);
    return NextResponse.json({ error: 'Failed to create rate plan' }, { status: 500 });
  }
}
