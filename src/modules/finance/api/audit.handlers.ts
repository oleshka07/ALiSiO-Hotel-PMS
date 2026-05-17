/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Read-only financial audit. Pure SELECT, no mutations.
// Surfaces inconsistencies between the various money ledgers so the
// operator can decide what's a real problem vs noise BEFORE we touch
// any code that changes behaviour.
//
// Powers /finance/audit (hidden UI).
//
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

function orgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

interface SectionResult {
  key: string;
  title: string;
  severity: 'green' | 'yellow' | 'red' | 'info';
  headline: string;
  metric_label?: string;
  metric_value?: string;
  details?: any[];
  description?: string;
}

function safeRun<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export async function getFinanceAudit(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const sections: SectionResult[] = [];

    // ─── 1. Multi-currency leak: amount vs amount_company ──────
    {
      const rows = safeRun(() => db.prepare(`
        SELECT op_type, currency,
               COUNT(*) AS ops,
               ROUND(SUM(amount), 2) AS sum_amount,
               ROUND(SUM(amount_company), 2) AS sum_company,
               ROUND(SUM(amount_company) - SUM(amount), 2) AS hidden_delta_czk
        FROM fin_operations
        WHERE currency != 'CZK' AND status = 'completed' AND organization_id = ?
        GROUP BY op_type, currency
        ORDER BY ABS(SUM(amount_company) - SUM(amount)) DESC
      `).all(org), [] as any[]);

      const totalHidden = rows.reduce((s: number, r: any) => s + Math.abs(r.hidden_delta_czk || 0), 0);
      const totalOps = rows.reduce((s: number, r: any) => s + (r.ops || 0), 0);

      sections.push({
        key: 'fx_leak',
        title: 'Multi-currency витік у звітах',
        severity: totalHidden > 10000 ? 'red' : totalHidden > 0 ? 'yellow' : 'green',
        headline: rows.length === 0
          ? 'Немає валютних операцій — усе в CZK'
          : `${totalOps} операцій у валюті ≠ CZK. Прихована різниця: ${Math.round(totalHidden).toLocaleString('cs-CZ')} CZK`,
        metric_label: 'Прихована різниця (CZK)',
        metric_value: Math.round(totalHidden).toLocaleString('cs-CZ'),
        description: 'Деякі звіти (cashflow inflows, buBreakdown) сумують поле `amount` замість `amount_company`. Якщо є EUR-дохід — він залічений у звіті у валюті оригіналу, не в CZK. Це і є реальна різниця.',
        details: rows,
      });
    }

    // ─── 2. Phantom paid reservations ──────────────────────────
    {
      const rows = safeRun(() => db.prepare(`
        SELECT r.id, r.source, r.payment_status, r.is_prepaid,
               r.total_price, r.currency, r.check_in, r.check_out,
               COALESCE(g.first_name, '') || ' ' || COALESCE(g.last_name, '') AS guest_name,
               COALESCE((SELECT SUM(amount) FROM fin_operations
                          WHERE reservation_id = r.id AND op_type='income' AND status='completed'), 0) AS real_income,
               COALESCE((SELECT SUM(amount) FROM fin_operations
                          WHERE reservation_id = r.id AND op_type='expense'
                            AND payment_subtype='refund' AND status='completed'), 0) AS real_refund
        FROM reservations r
        LEFT JOIN guests g ON g.id = r.guest_id
        WHERE r.payment_status = 'paid'
          AND r.is_prepaid = 0
          AND r.status IN ('confirmed','checked_in','checked_out')
          AND NOT EXISTS (
            SELECT 1 FROM fin_operations
            WHERE reservation_id = r.id AND status = 'completed'
          )
        ORDER BY r.check_in DESC
        LIMIT 50
      `).all(), [] as any[]);

      const totalMissing = rows.reduce((s: number, r: any) => s + (r.total_price || 0), 0);

      sections.push({
        key: 'phantom_paid',
        title: 'Фантомні «paid» резервації',
        severity: rows.length > 20 ? 'red' : rows.length > 0 ? 'yellow' : 'green',
        headline: rows.length === 0
          ? 'Усі «paid» резервації мають реальні fin_operations'
          : `${rows.length} резервацій помічені paid, але fin_operation немає`,
        metric_label: 'Сумарно зниклих грошей (CZK)',
        metric_value: Math.round(totalMissing).toLocaleString('cs-CZ'),
        description: 'Резервація має payment_status=paid, is_prepaid=0, але в fin_operations немає жодної completed-операції. Можливо: marker без bank-confirmation, або очищене Teya-webhook-ом але fin_operation видалилась через cascade.',
        details: rows.slice(0, 20),
      });
    }

    // ─── 3. CapEx potential duplicates ─────────────────────────
    {
      const rows = safeRun(() => db.prepare(`
        SELECT ci.id AS capex_id, ci.name, ci.amount AS capex_amount,
               ci.month, ci.fin_operation_id AS linked_op,
               fo.id AS suspect_op_id, fo.amount AS op_amount, fo.paid_at,
               fo.comment AS op_comment
        FROM capex_items ci
        JOIN fin_operations fo
          ON fo.organization_id = ci.organization_id
          AND fo.op_type = 'expense'
          AND fo.category_id = 'ec_capex'
          AND substr(fo.paid_at, 1, 7) = ci.month
          AND ABS(fo.amount - ci.amount) < 1
        WHERE ci.fin_operation_id IS NULL OR ci.fin_operation_id != fo.id
        ORDER BY ci.month DESC
        LIMIT 30
      `).all(), [] as any[]);

      sections.push({
        key: 'capex_dup',
        title: 'CapEx дублікати',
        severity: rows.length > 0 ? 'yellow' : 'green',
        headline: rows.length === 0
          ? 'Немає підозрілих дублів CapEx ↔ fin_operations'
          : `${rows.length} підозрілих пар: CapEx-запис + окрема fin_operation з тією ж сумою`,
        description: 'capex_items і fin_operations можуть зберегти одну й ту ж покупку двічі — звіти показуватимуть подвійну витрату. Перевір вручну.',
        details: rows,
      });
    }

    // ─── 4. Stale pending operations ───────────────────────────
    {
      const rows = safeRun(() => db.prepare(`
        SELECT id, op_type, amount, currency, paid_at, source, comment,
               reservation_id, source_ref
        FROM fin_operations
        WHERE status = 'pending'
          AND organization_id = ?
          AND paid_at < date('now', '-7 days')
        ORDER BY paid_at ASC
        LIMIT 50
      `).all(org), [] as any[]);

      const totalAmount = rows.reduce((s: number, r: any) => s + (r.amount || 0), 0);

      sections.push({
        key: 'stale_pending',
        title: 'Pending операції старші 7 днів',
        severity: rows.length > 5 ? 'red' : rows.length > 0 ? 'yellow' : 'green',
        headline: rows.length === 0
          ? 'Немає застарілих pending-операцій'
          : `${rows.length} операцій залишилися у статусі pending більше тижня`,
        metric_label: 'Сума',
        metric_value: Math.round(totalAmount).toLocaleString('cs-CZ'),
        description: 'Pending не потрапляють у звіти. Якщо webhook загубився — гроші невидимі. Треба або completed, або failed, або видалити.',
        details: rows.slice(0, 20),
      });
    }

    // ─── 5. Orphan receivables ─────────────────────────────────
    {
      const rows = safeRun(() => db.prepare(`
        SELECT rcv.id, rcv.channel_source, rcv.external_reservation_id,
               rcv.gross_amount, rcv.currency, rcv.check_in, rcv.check_out,
               rcv.status, fa.name AS clearing_account
        FROM fin_channel_receivables rcv
        LEFT JOIN finance_accounts fa ON fa.id = rcv.clearing_account_id
        WHERE rcv.organization_id = ?
          AND rcv.reservation_id IS NULL
        ORDER BY rcv.check_in DESC
        LIMIT 30
      `).all(org), [] as any[]);

      sections.push({
        key: 'orphan_recv',
        title: 'Orphan receivables (без PMS-броні)',
        severity: rows.length > 10 ? 'yellow' : 'info',
        headline: rows.length === 0
          ? 'Усі receivable-и прив’язані до резервацій'
          : `${rows.length} receivable-ів без зв’язку з PMS-бронюванням`,
        description: 'Statement з Booking/Airbnb принесли оплати, але PMS-резервацію не знайдено (можливо, Hostex sync пропустив, або бронь видалена). Гроші є, на що — не зрозуміло.',
        details: rows,
      });
    }

    // ─── 6. Accruals неоплачені, але місяць давно минув ────────
    {
      const rows = safeRun(() => db.prepare(`
        SELECT id, description, amount, month, accrual_type, status,
               business_unit_id, category_id
        FROM accruals
        WHERE organization_id = ?
          AND status = 'pending'
          AND month < strftime('%Y-%m', date('now', '-2 months'))
        ORDER BY month ASC
        LIMIT 50
      `).all(org), [] as any[]);

      const total = rows.reduce((s: number, r: any) => s + Math.abs(r.amount || 0), 0);

      sections.push({
        key: 'stale_accruals',
        title: 'Прострочені нарахування',
        severity: rows.length > 0 ? 'yellow' : 'green',
        headline: rows.length === 0
          ? 'Усі accruals або оплачені, або з поточних місяців'
          : `${rows.length} нарахувань pending з місяців старших 2-х місяців`,
        metric_label: 'Сума',
        metric_value: Math.round(total).toLocaleString('cs-CZ'),
        description: 'Pending accrual завищує expenses у звітах, бо додається окремо до fin_operations. Якщо платіж пройшов — статус треба перевести у paid.',
        details: rows.slice(0, 20),
      });
    }

    // ─── 7. Cascade-delete risk ────────────────────────────────
    {
      const row = safeRun(() => db.prepare(`
        SELECT COUNT(*) AS ops, COALESCE(SUM(amount_company), 0) AS sum_czk
        FROM fin_operations
        WHERE reservation_id IS NOT NULL
          AND status = 'completed'
          AND organization_id = ?
      `).get(org) as any, { ops: 0, sum_czk: 0 });

      sections.push({
        key: 'cascade_risk',
        title: 'Cascade-delete ризик',
        severity: row.ops > 100 ? 'yellow' : 'info',
        headline: `${row.ops} fin_operations прив’язані до резервацій (${Math.round(row.sum_czk).toLocaleString('cs-CZ')} CZK)`,
        description: 'fin_operations.reservation_id має ON DELETE CASCADE — якщо хтось видалить резервацію, ВСІ її платежі зникнуть з ledger-у. Це задизайн помилка. Виправляється зміною на SET NULL.',
        metric_label: 'Сумарна експозиція',
        metric_value: Math.round(row.sum_czk).toLocaleString('cs-CZ') + ' CZK',
      });
    }

    // ─── 8. Bank reconciliation gap ────────────────────────────
    {
      const unmatched = safeRun(() => db.prepare(`
        SELECT COUNT(*) AS n FROM bank_transactions WHERE matched_operation_id IS NULL
      `).get() as any, { n: 0 });
      const total = safeRun(() => db.prepare(`
        SELECT COUNT(*) AS n FROM bank_transactions
      `).get() as any, { n: 0 });
      const pct = total.n > 0 ? Math.round((unmatched.n / total.n) * 100) : 0;

      sections.push({
        key: 'bank_recon',
        title: 'Bank reconciliation',
        severity: pct > 30 ? 'red' : pct > 10 ? 'yellow' : 'green',
        headline: `${unmatched.n} з ${total.n} bank_transactions не зматчені (${pct}%)`,
        description: 'Незматчені банк-транзакції = реальні гроші, які прийшли на рахунок, але не привʼязані до жодної fin_operation. Може бути нормально (поточні нові надходження), але високий відсоток означає, що auto-matcher не справляється.',
        metric_label: 'Не зматчено',
        metric_value: `${pct}%`,
      });
    }

    // ─── 9. needs_review queue ─────────────────────────────────
    {
      const row = safeRun(() => db.prepare(`
        SELECT COUNT(*) AS n, COALESCE(SUM(amount_company), 0) AS sum_czk
        FROM fin_operations
        WHERE needs_review = 1 AND organization_id = ?
      `).get(org) as any, { n: 0, sum_czk: 0 });

      sections.push({
        key: 'needs_review',
        title: 'Черга admin-тріажу',
        severity: row.n > 50 ? 'red' : row.n > 10 ? 'yellow' : 'green',
        headline: `${row.n} операцій помічені needs_review`,
        description: 'Account resolver не зміг точно визначити рахунок і вибрав fallback. Адмін має переглянути і перепризначити рахунок або категорію.',
        metric_label: 'Сума',
        metric_value: Math.round(row.sum_czk).toLocaleString('cs-CZ') + ' CZK',
      });
    }

    // ─── 10. Loose fin_operation_audit consistency ─────────────
    {
      const row = safeRun(() => db.prepare(`
        SELECT COUNT(DISTINCT a.operation_id) AS audited_ops,
               (SELECT COUNT(*) FROM fin_operations) AS total_ops
        FROM fin_operation_audit a
        WHERE a.action = 'create'
      `).get() as any, { audited_ops: 0, total_ops: 0 });

      const coverage = row.total_ops > 0 ? Math.round((row.audited_ops / row.total_ops) * 100) : 0;

      sections.push({
        key: 'audit_coverage',
        title: 'Audit log coverage',
        severity: 'info',
        headline: `${row.audited_ops} з ${row.total_ops} операцій мають create-запис в audit (${coverage}%)`,
        description: 'Старі операції (до W4) аудит не мають — це нормально. Нові мають усі. Якщо різко зростає число без аудиту — щось пише в fin_operations повз createOperationInTx.',
        metric_label: 'Покриття',
        metric_value: `${coverage}%`,
      });
    }

    // ─── 11. Totals summary ────────────────────────────────────
    const totals = safeRun(() => db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM fin_operations WHERE organization_id = ?) AS total_ops,
        (SELECT COUNT(*) FROM fin_operations WHERE status='completed' AND organization_id = ?) AS completed_ops,
        (SELECT COUNT(*) FROM finance_accounts WHERE organization_id = ? AND is_active=1) AS active_accounts,
        (SELECT COUNT(*) FROM fin_channel_receivables WHERE organization_id = ?) AS receivables,
        (SELECT COUNT(*) FROM bank_transactions) AS bank_tx,
        (SELECT COUNT(*) FROM reservations) AS reservations
    `).get(org, org, org, org) as any, {});

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      totals,
      sections,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
