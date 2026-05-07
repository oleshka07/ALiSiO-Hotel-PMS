/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Reconciliation dashboard data — synthesises tasks, exceptions, and
// status from existing finance subsystems (clearing receivables, statement
// uploads, receipt inbox, Teya sync, bank inbox, recurring suggestions).
//
// Single GET endpoint that returns everything the /finance/reconcile page
// renders. No new tables — just queries.
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

const STATEMENT_OVERDUE_DAYS: Record<string, number> = {
  booking: 8,    // weekly + 1 day grace
  airbnb: 35,    // monthly + grace
  vrbo: 35,
};

const LARGE_EXPENSE_NO_RECEIPT_THRESHOLD = 1000; // CZK

export async function getReconcileDashboard(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);

    // ─── TASKS ────────────────────────────────────────────────────
    const tasks: any[] = [];

    // 1. Statement uploads overdue per channel
    const lastUpload = db.prepare(`
      SELECT channel, MAX(created_at) AS last_at, COUNT(*) AS cnt
      FROM fin_statement_uploads
      WHERE organization_id = ?
      GROUP BY channel
    `).all(orgId) as any[];
    const uploadByChannel = new Map(lastUpload.map((r) => [r.channel, r]));

    for (const channel of ['booking', 'airbnb', 'vrbo']) {
      const overdueDays = STATEMENT_OVERDUE_DAYS[channel];
      const last = uploadByChannel.get(channel);
      const lastAt = last?.last_at ? new Date(last.last_at) : null;
      const daysSince = lastAt ? Math.floor((Date.now() - lastAt.getTime()) / (24 * 3600 * 1000)) : 999;
      // Show the task only if there are receivables for this channel (else no point)
      const hasReceivables = db.prepare(`
        SELECT 1 FROM fin_channel_receivables WHERE organization_id = ? AND channel_source = ? LIMIT 1
      `).get(orgId, channel);
      if (!hasReceivables) continue;
      if (daysSince > overdueDays) {
        tasks.push({
          id: `upload-${channel}`,
          severity: 'task',
          icon: 'upload',
          title: `Завантажити виписку ${channel}`,
          description: lastAt
            ? `Остання виписка ${daysSince} дн. тому (${lastAt.toISOString().substring(0, 10)})`
            : 'Виписку не завантажували жодного разу',
          action_label: 'Завантажити',
          action_href: '/finance/clearing',
        });
      }
    }

    // 2. Pending receipts awaiting linking
    const pendingReceiptsRow = db.prepare(`
      SELECT COUNT(*) AS cnt FROM fin_pending_receipts
      WHERE organization_id = ? AND status IN ('pending', 'matched')
    `).get(orgId) as { cnt: number };
    if (pendingReceiptsRow.cnt > 0) {
      tasks.push({
        id: 'pending-receipts',
        severity: 'task',
        icon: 'mail',
        title: `${pendingReceiptsRow.cnt} чек(ів) у пошті чекає привʼязки`,
        description: 'Перейди й привʼяжи кожен до операції — або auto-match підтвердь',
        action_label: 'Розібрати',
        action_href: '/finance/receipts',
      });
    }

    // 3. Pending recurring suggestions
    const recurringSugRow = db.prepare(`
      SELECT COUNT(*) AS cnt FROM fin_operations
      WHERE organization_id = ? AND suggested_recurring_id IS NOT NULL
    `).get(orgId) as { cnt: number };
    if (recurringSugRow.cnt > 0) {
      tasks.push({
        id: 'recurring-suggestions',
        severity: 'task',
        icon: 'repeat',
        title: `${recurringSugRow.cnt} операц(ій) з recurring-suggestion`,
        description: 'Bank inbox знайшов схожість — підтверди прив\'язку до шаблону або відхили',
        action_label: 'Переглянути',
        action_href: '/finance/operations',
      });
    }

    // ─── EXCEPTIONS ──────────────────────────────────────────────
    const exceptions: any[] = [];

    // 1. Orphan receivables (no PMS reservation)
    const orphansRow = db.prepare(`
      SELECT COUNT(*) AS cnt, channel_source FROM fin_channel_receivables
      WHERE organization_id = ? AND reservation_id IS NULL AND status != 'cancelled'
      GROUP BY channel_source
    `).all(orgId) as any[];
    for (const o of orphansRow) {
      exceptions.push({
        id: `orphan-${o.channel_source}`,
        severity: 'warn',
        icon: 'alert',
        title: `${o.cnt} orphan receivable(s) у ${o.channel_source}`,
        description: 'Бронювання у виписці є, але в PMS немає (Hostex sync gap)',
        action_label: 'Дивитися',
        action_href: `/finance/clearing?orphan=1`,
      });
    }

    // 2. Receivables in_statement >7 days without bank settlement
    const stuckRow = db.prepare(`
      SELECT COUNT(*) AS cnt, currency, COALESCE(SUM(actual_net), 0) AS total
      FROM fin_channel_receivables
      WHERE organization_id = ? AND status = 'in_statement'
        AND statement_payout_date IS NOT NULL
        AND julianday('now') - julianday(statement_payout_date) > 7
      GROUP BY currency
    `).all(orgId) as any[];
    for (const s of stuckRow) {
      exceptions.push({
        id: `stuck-${s.currency}`,
        severity: 'warn',
        icon: 'clock',
        title: `${s.cnt} payout(s) у ${s.currency} >7 днів без зарахування`,
        description: `Очікується ${s.total.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} ${s.currency} — перевір банк`,
        action_label: 'Дивитися',
        action_href: '/finance/clearing?status=in_statement',
      });
    }

    // 3. Large expenses without receipts
    const largeNoReceiptRow = db.prepare(`
      SELECT COUNT(*) AS cnt FROM fin_operations o
      LEFT JOIN fin_operation_attachments a ON a.operation_id = o.id
      WHERE o.organization_id = ?
        AND o.op_type = 'expense'
        AND o.amount >= ?
        AND o.paid_at >= date('now', '-90 days')
        AND a.id IS NULL
    `).get(orgId, LARGE_EXPENSE_NO_RECEIPT_THRESHOLD) as { cnt: number };
    if (largeNoReceiptRow.cnt > 0) {
      exceptions.push({
        id: 'no-receipt',
        severity: 'warn',
        icon: 'paperclip',
        title: `${largeNoReceiptRow.cnt} витрат(и) ≥${LARGE_EXPENSE_NO_RECEIPT_THRESHOLD} CZK без чеку (90д)`,
        description: 'Прикріпи фактуру / чек, або підтвердь що документ не потрібен',
        action_label: 'Знайти',
        action_href: '/finance/operations',
      });
    }

    // 4. Inbox last_error (bank or receipt)
    const inboxErrors = db.prepare(`
      SELECT 'bank' AS kind, name, last_error FROM fin_bank_inboxes
      WHERE organization_id = ? AND last_error IS NOT NULL AND last_error != '' AND is_active = 1
      UNION ALL
      SELECT 'receipt' AS kind, name, last_error FROM fin_receipt_inboxes
      WHERE organization_id = ? AND last_error IS NOT NULL AND last_error != '' AND is_active = 1
    `).all(orgId, orgId) as any[];
    for (const ie of inboxErrors) {
      exceptions.push({
        id: `inbox-err-${ie.kind}-${ie.name}`,
        severity: 'error',
        icon: 'mail',
        title: `${ie.kind === 'bank' ? 'Банк-приймач' : 'Receipt inbox'} «${ie.name}» — помилка`,
        description: String(ie.last_error).slice(0, 120),
        action_label: 'Перевірити',
        action_href: '/finance/settings',
      });
    }

    // ─── STATUS ──────────────────────────────────────────────────
    const status: any = {};

    // Outstanding receivables per currency
    const outstandingRow = db.prepare(`
      SELECT currency, COUNT(*) AS cnt,
             COALESCE(SUM(COALESCE(actual_net, expected_net)), 0) AS total
      FROM fin_channel_receivables
      WHERE organization_id = ? AND status IN ('expected', 'in_statement')
      GROUP BY currency
    `).all(orgId) as any[];
    status.outstanding = outstandingRow;

    // Last sync timestamps
    const lastTicks = db.prepare(`
      SELECT key, value, updated_at FROM fin_system_state
      WHERE key IN ('last_bank_inbox_tick', 'last_receipt_inbox_tick', 'last_teya_sync_tick', 'teya_sync_last_run')
    `).all() as any[];
    const tickMap: Record<string, any> = {};
    for (const t of lastTicks) tickMap[t.key] = t;
    status.last_sync = {
      bank_inbox: tickMap.last_bank_inbox_tick?.updated_at || null,
      receipt_inbox: tickMap.last_receipt_inbox_tick?.updated_at || null,
      teya: tickMap.last_teya_sync_tick?.updated_at || null,
      teya_result: tickMap.teya_sync_last_run ? safeParse(tickMap.teya_sync_last_run.value) : null,
    };

    // Current month KPIs.
    const monthStr = new Date().toISOString().substring(0, 7);
    const monthKpi = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN op_type = 'income' THEN amount_company ELSE 0 END), 0) AS income_czk,
        COALESCE(SUM(CASE WHEN op_type = 'expense' THEN amount_company ELSE 0 END), 0) AS expense_czk,
        COUNT(*) AS op_count
      FROM fin_operations
      WHERE organization_id = ? AND status = 'completed'
        AND strftime('%Y-%m', paid_at) = ?
    `).get(orgId, monthStr) as any;
    status.month = {
      month: monthStr,
      income_czk: monthKpi.income_czk,
      expense_czk: monthKpi.expense_czk,
      net_czk: monthKpi.income_czk - monthKpi.expense_czk,
      op_count: monthKpi.op_count,
    };

    return NextResponse.json({ tasks, exceptions, status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function safeParse(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
