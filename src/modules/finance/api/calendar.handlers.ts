/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { forecastUpcoming } from '../data/recurring-engine';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function daysInMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

export async function getCalendarMonth(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);
    const accountId = searchParams.get('account_id');

    const m = month.match(/^(\d{4})-(\d{2})$/);
    if (!m) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    const year = Number(m[1]);
    const monthIdx = Number(m[2]) - 1;
    const daysCount = daysInMonth(year, monthIdx);
    const firstDay = `${year}-${pad2(monthIdx + 1)}-01`;
    const lastDay = `${year}-${pad2(monthIdx + 1)}-${pad2(daysCount)}`;
    const today = new Date().toISOString().substring(0, 10);

    // 1) Fetch all operations in the month (completed + pending).
    const where: string[] = ['o.organization_id = ?', "o.paid_at BETWEEN ? AND ?"];
    const params: any[] = [orgId, firstDay, lastDay];
    if (accountId) {
      where.push('(o.account_from_id = ? OR o.account_to_id = ?)');
      params.push(accountId, accountId);
    }
    const ops = db.prepare(`
      SELECT o.*,
             ec.name  AS category_name, ec.icon AS category_icon,
             bu.name  AS project_name,
             cp.name  AS counterparty_name,
             afr.name AS account_from_name,
             ato.name AS account_to_name
      FROM fin_operations o
      LEFT JOIN expense_categories    ec  ON ec.id  = o.category_id
      LEFT JOIN business_units        bu  ON bu.id  = o.project_id
      LEFT JOIN finance_counterparties cp ON cp.id  = o.counterparty_id
      LEFT JOIN finance_accounts      afr ON afr.id = o.account_from_id
      LEFT JOIN finance_accounts      ato ON ato.id = o.account_to_id
      WHERE ${where.join(' AND ')}
      ORDER BY o.paid_at ASC
    `).all(...params) as any[];

    // 2) Forecast recurring ops (beyond existing) within the month
    const recurringPreview = forecastUpcoming(db, orgId, firstDay, lastDay);
    // Filter out recurring previews that already materialized (source_ref match)
    const materializedRefs = new Set(ops.filter((o) => o.source === 'recurring').map((o) => `${o.source_ref}_${o.paid_at.substring(0,10)}`));
    const upcomingRecurring = recurringPreview.filter((r) => !materializedRefs.has(`${r.template_id}_${r.date}`));

    // 3) Compute starting balance — sum across accounts (or specific account).
    const balanceWhere = accountId ? `fa.id = ?` : `fa.organization_id = ? AND fa.is_active = 1`;
    const balanceParams = accountId ? [accountId] : [orgId];
    const accountRows = db.prepare(`
      SELECT fa.id, fa.name, fa.currency,
        (
          fa.initial_balance
          + COALESCE((SELECT SUM(amount) FROM fin_operations
                       WHERE account_to_id = fa.id AND status = 'completed' AND paid_at < ?), 0)
          - COALESCE((SELECT SUM(amount) FROM fin_operations
                       WHERE account_from_id = fa.id AND status = 'completed' AND paid_at < ?), 0)
        ) AS starting_balance
      FROM finance_accounts fa
      WHERE ${balanceWhere}
    `).all(firstDay, firstDay, ...balanceParams) as any[];

    const startingBalance = accountRows.reduce((s, a) => s + (a.starting_balance || 0), 0);

    // 4) Build days array with per-day aggregates + running balance forecast
    const opsByDay = new Map<string, any[]>();
    for (const op of ops) {
      const key = op.paid_at.substring(0, 10);
      if (!opsByDay.has(key)) opsByDay.set(key, []);
      opsByDay.get(key)!.push(op);
    }
    const recurringByDay = new Map<string, any[]>();
    for (const r of upcomingRecurring) {
      if (!recurringByDay.has(r.date)) recurringByDay.set(r.date, []);
      recurringByDay.get(r.date)!.push(r);
    }

    const days: any[] = [];
    let runningBalance = startingBalance;
    let totalIncome = 0;
    let totalExpense = 0;

    for (let dNum = 1; dNum <= daysCount; dNum++) {
      const date = `${year}-${pad2(monthIdx + 1)}-${pad2(dNum)}`;
      const dayOps = opsByDay.get(date) || [];
      const dayRecurring = recurringByDay.get(date) || [];

      let dayIncome = 0;
      let dayExpense = 0;
      let dayPlannedIncome = 0;
      let dayPlannedExpense = 0;

      for (const op of dayOps) {
        const amt = Number(op.amount) || 0;
        if (op.op_type === 'transfer') continue;
        const isCompleted = op.status === 'completed' && !op.is_planned;
        if (op.op_type === 'income') {
          if (isCompleted) { dayIncome += amt; runningBalance += amt; }
          else dayPlannedIncome += amt;
        } else if (op.op_type === 'expense') {
          if (isCompleted) { dayExpense += amt; runningBalance -= amt; }
          else dayPlannedExpense += amt;
        }
      }
      // For forecast: apply planned + recurring beyond today
      if (date >= today) {
        runningBalance += dayPlannedIncome - dayPlannedExpense;
        for (const r of dayRecurring) {
          if (r.op_type === 'income') runningBalance += r.amount;
          else if (r.op_type === 'expense') runningBalance -= r.amount;
        }
      }

      totalIncome += dayIncome + dayPlannedIncome + dayRecurring.filter((r) => r.op_type === 'income').reduce((s, r) => s + r.amount, 0);
      totalExpense += dayExpense + dayPlannedExpense + dayRecurring.filter((r) => r.op_type === 'expense').reduce((s, r) => s + r.amount, 0);

      days.push({
        date,
        operations: dayOps,
        recurring_previews: dayRecurring,
        day_income: dayIncome,
        day_expense: dayExpense,
        day_planned_income: dayPlannedIncome,
        day_planned_expense: dayPlannedExpense,
        forecast_balance: +runningBalance.toFixed(2),
        cash_gap: runningBalance < 0,
        is_today: date === today,
        is_past: date < today,
      });
    }

    return NextResponse.json({
      month,
      starting_balance: +startingBalance.toFixed(2),
      ending_balance: days.length > 0 ? days[days.length - 1].forecast_balance : startingBalance,
      total_income: +totalIncome.toFixed(2),
      total_expense: +totalExpense.toFixed(2),
      days,
      accounts: accountRows,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
