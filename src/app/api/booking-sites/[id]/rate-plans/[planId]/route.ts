/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

// PATCH /api/booking-sites/[id]/rate-plans/[planId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(request.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, planId } = await params;
    const db = getDb();
    const body = await request.json();

    const plan = db.prepare('SELECT * FROM site_rate_plans WHERE id = ? AND site_id = ?').get(planId, id);
    if (!plan) return NextResponse.json({ error: 'Rate plan not found' }, { status: 404 });

    if (body.is_default) {
      db.prepare('UPDATE site_rate_plans SET is_default = 0 WHERE site_id = ?').run(id);
    }

    const jsonFields = ['payment_schedule', 'meals_included', 'applied_listings', 'valid_weekdays'];
    const allowed = [
      'name', 'is_default', 'cancellation_policy', 'payment_schedule',
      'meals_included', 'min_days_before_checkin', 'same_day_cutoff_hour',
      'min_stay', 'max_stay', 'pricing_mode', 'applied_listings', 'is_active',
      'pricing_modifier_percent', 'pricing_modifier_type', 'derived_from_plan_id',
      'valid_weekdays'
    ];

    const setClauses: string[] = ["updated_at = datetime('now')"];
    const values: any[] = [];

    for (const key of allowed) {
      if (key in body) {
        setClauses.push(`${key} = ?`);
        let val = body[key];
        // Normalise legacy 'derived' → 'dependent' (DB CHECK constraint)
        if (key === 'pricing_mode' && val === 'derived') val = 'dependent';
        values.push(jsonFields.includes(key) && typeof val !== 'string'
          ? JSON.stringify(val)
          : val ?? null);
      }
    }

    if (setClauses.length === 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(planId);
    db.prepare(`UPDATE site_rate_plans SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM site_rate_plans WHERE id = ?').get(planId) as any;
    try { updated.payment_schedule = JSON.parse(updated.payment_schedule); } catch { /* */ }
    try { updated.meals_included = JSON.parse(updated.meals_included); } catch { /* */ }
    try { updated.applied_listings = JSON.parse(updated.applied_listings); } catch { /* */ }
    try { updated.valid_weekdays = updated.valid_weekdays ? JSON.parse(updated.valid_weekdays) : null; } catch { /* */ }

    return NextResponse.json({ plan: updated });
  } catch (error: any) {
    console.error('PATCH rate-plan error:', error?.message);
    return NextResponse.json({ error: 'Failed to update rate plan' }, { status: 500 });
  }
}

// DELETE /api/booking-sites/[id]/rate-plans/[planId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, planId } = await params;
    const db = getDb();

    const plan = db.prepare('SELECT id FROM site_rate_plans WHERE id = ? AND site_id = ?').get(planId, id);
    if (!plan) return NextResponse.json({ error: 'Rate plan not found' }, { status: 404 });

    db.prepare("UPDATE site_rate_plans SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(planId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE rate-plan error:', error?.message);
    return NextResponse.json({ error: 'Failed to delete rate plan' }, { status: 500 });
  }
}

export { PATCH as PUT };
