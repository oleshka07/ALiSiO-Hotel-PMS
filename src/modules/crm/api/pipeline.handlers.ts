/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export const CRM_STAGES = [
  { id: 'new', label: 'Новий', icon: '🆕', color: '#6b7280' },
  { id: 'inquiry', label: 'Запит', icon: '❓', color: '#8b5cf6' },
  { id: 'info_needed', label: 'Уточнення', icon: '📋', color: '#f59e0b' },
  { id: 'quote_sent', label: 'Ціна відправлена', icon: '💰', color: '#3b82f6' },
  { id: 'negotiation', label: 'Переговори', icon: '🤝', color: '#ec4899' },
  { id: 'deposit_paid', label: 'Передплата', icon: '💳', color: '#06b6d4' },
  { id: 'booked', label: 'Заброньовано', icon: '✅', color: '#22c55e' },
  { id: 'pre_stay', label: 'До заїзду', icon: '📋', color: '#14b8a6' },
  { id: 'check_in', label: 'Заселення', icon: '🏠', color: '#0ea5e9' },
  { id: 'in_stay', label: 'Перебування', icon: '🛏️', color: '#6366f1' },
  { id: 'check_out', label: 'Виселення', icon: '👋', color: '#a855f7' },
  { id: 'post_stay', label: 'Після', icon: '⭐', color: '#eab308' },
  { id: 'lost', label: 'Втрачено', icon: '❌', color: '#ef4444' },
  { id: 'spam', label: 'Спам', icon: '🚫', color: '#9ca3af' },
] as const;

export async function getPipeline() {
  try {
    const db = getDb();

    const leads = db.prepare(`
      SELECT
        l.*,
        g.first_name as guest_first_name,
        g.last_name as guest_last_name,
        g.email as guest_email,
        g.phone as guest_phone,
        r.status as reservation_status,
        r.payment_status,
        r.total_price as reservation_total,
        r.check_in as reservation_check_in,
        r.check_out as reservation_check_out,
        u.full_name as assigned_name,
        ch.name as channel_name,
        ch.channel_type
      FROM crm_leads l
      LEFT JOIN guests g ON g.id = l.guest_id
      LEFT JOIN reservations r ON r.id = l.reservation_id
      LEFT JOIN app_users u ON u.id = l.assigned_to
      LEFT JOIN crm_channels ch ON ch.id = l.channel_id
      ORDER BY
        CASE l.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END,
        l.updated_at DESC
    `).all();

    const stageCounts = db.prepare(`
      SELECT stage, COUNT(*) as count
      FROM crm_leads
      WHERE stage NOT IN ('lost', 'spam')
      GROUP BY stage
    `).all() as { stage: string; count: number }[];

    const countMap: Record<string, number> = {};
    for (const sc of stageCounts) {
      countMap[sc.stage] = sc.count;
    }

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_leads,
        SUM(CASE WHEN unread_count > 0 THEN 1 ELSE 0 END) as unread_leads,
        SUM(estimated_value) as total_value,
        SUM(CASE WHEN stage IN ('booked', 'pre_stay', 'check_in', 'in_stay') THEN 1 ELSE 0 END) as active_bookings,
        SUM(CASE WHEN stage = 'lost' THEN 1 ELSE 0 END) as lost_count
      FROM crm_leads
    `).get() as any;

    return NextResponse.json({
      stages: CRM_STAGES,
      leads,
      stageCounts: countMap,
      stats: {
        totalLeads: stats?.total_leads || 0,
        unreadLeads: stats?.unread_leads || 0,
        totalValue: stats?.total_value || 0,
        activeBookings: stats?.active_bookings || 0,
        lostCount: stats?.lost_count || 0,
      },
    });
  } catch (error: any) {
    console.error('[CRM Pipeline]', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
