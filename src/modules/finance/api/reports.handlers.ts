/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { getMonthMoney } from '../data/money-metrics';

// Helpers: SQL fragments that filter fin_operations by semantic slice.
// A "payment" operation = income or refund tied to a reservation (source IN ('booking_widget','teia','hostex','manual') with reservation_id).
// A "regular expense" = op_type='expense' without payment_subtype (not a refund).
//
// The is_pms_signal filter that used to live here is gone — channel
// prepayments aren't recorded as fin_operations any more (see PR
// clean-1/2/3). Every row in the table is real money.

// All cross-currency aggregations sum amount_company (CZK base) so a
// future EUR / USD operation does not silently under-report by ~25×.
// computeAmountCompany locks the rate at op-creation time, so historical
// figures stay stable even if FX moves.

// Canonical revenue/expense definitions live in data/money-metrics.ts —
// every cash report must use them so the numbers agree across pages.
// revenue = income (non-financing) − refunds; expenses include tax and
// uncategorized spending, exclude capex/financing (separate buckets).
function monthRevenueSql(month: string, db: any): number {
  return getMonthMoney(db, month).revenue;
}

function monthExpensesSql(month: string, db: any): number {
  const m = getMonthMoney(db, month);
  return m.expenses_operating + m.tax;
}

export async function getFinanceOverview(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    const revenue = monthRevenueSql(month, db);
    const expenses = monthExpensesSql(month, db);

    const capexRow = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM capex_items WHERE month = ?`).get(month) as any;
    const pendingAccruals = db.prepare(`
      SELECT COALESCE(SUM(ABS(a.amount)), 0) as total, COUNT(*) as cnt
      FROM accruals a WHERE a.month = ? AND a.status = 'pending'
    `).get(month) as any;
    const depRow = db.prepare(`
      SELECT COALESCE(SUM(depreciation_monthly), 0) as total
      FROM capex_items WHERE status = 'active' AND depreciation_monthly > 0
    `).get() as any;

    const ebitda = revenue - expenses - pendingAccruals.total;
    const margin = revenue > 0 ? ((ebitda / revenue) * 100) : 0;

    const months: string[] = [];
    const now = new Date(month + '-01');
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().substring(0, 7));
    }

    const monthlyData = months.map(m => {
      const rev = monthRevenueSql(m, db);
      const exp = monthExpensesSql(m, db);
      return { month: m, revenue: rev, expenses: exp, ebitda: rev - exp };
    });

    const buBreakdown = db.prepare(`
      SELECT bu.id, bu.name,
             COALESCE(SUM(CASE WHEN o.op_type = 'income' AND COALESCE(ec.classifier, ec.std_group) NOT IN ('financing', 'Financing') THEN o.amount_company
                              WHEN o.op_type = 'expense' AND COALESCE(o.payment_subtype,'') = 'refund' THEN -o.amount_company
                              ELSE 0 END), 0) as revenue,
             COALESCE(SUM(CASE WHEN o.op_type = 'expense' AND COALESCE(o.payment_subtype,'') != 'refund'
                                AND COALESCE(ec.is_capex, 0) = 0
                                AND COALESCE(ec.classifier, ec.std_group, 'x') NOT IN ('financing', 'Financing', 'capex', 'CAPEX')
                               THEN o.amount_company ELSE 0 END), 0) as expenses,
             COALESCE(SUM(CASE WHEN o.op_type = 'expense' AND ec.is_capex = 1 THEN o.amount_company ELSE 0 END), 0) as capex
      FROM business_units bu
      LEFT JOIN fin_operations o ON o.project_id = bu.id AND strftime('%Y-%m', o.paid_at) = ? AND o.status = 'completed'
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
      WHERE bu.is_active = 1 AND bu.is_shared = 0
      GROUP BY bu.id ORDER BY bu.sort_order
    `).all(month) as any[];

    // Only PENDING accruals are added on top of cash expenses. Paid accruals
    // are already (or will be) real fin_operations — adding them here counted
    // the same expense twice.
    const buAccruals = db.prepare(`
      SELECT a.business_unit_id, COALESCE(SUM(ABS(a.amount)), 0) as total
      FROM accruals a WHERE a.month = ? AND a.status = 'pending' GROUP BY a.business_unit_id
    `).all(month) as any[];
    for (const acc of buAccruals) {
      const bu = buBreakdown.find((b: any) => b.id === acc.business_unit_id);
      if (bu) bu.expenses += acc.total;
    }

    const noProjectRows = db.prepare(`
      SELECT COUNT(*) as cnt FROM fin_operations
      WHERE op_type = 'expense' AND project_id IS NULL
    `).get() as any;
    const totalExpRows = db.prepare(`
      SELECT COUNT(*) as cnt FROM fin_operations WHERE op_type = 'expense'
    `).get() as any;

    // Expected payments (unpaid confirmed reservations)
    const expectedRow = db.prepare(`
      SELECT COALESCE(SUM(
        r.total_price
        - COALESCE((SELECT SUM(amount) FROM fin_operations
                     WHERE reservation_id = r.id AND op_type = 'income' AND status = 'completed'), 0)
        + COALESCE((SELECT SUM(amount) FROM fin_operations
                     WHERE reservation_id = r.id AND op_type = 'expense' AND payment_subtype = 'refund' AND status = 'completed'), 0)
      ), 0) as total,
      COUNT(*) as cnt
      FROM reservations r
      WHERE r.status IN ('confirmed', 'checked_in', 'tentative') AND r.payment_status != 'paid'
        AND r.total_price > (
          COALESCE((SELECT SUM(amount) FROM fin_operations
                     WHERE reservation_id = r.id AND op_type = 'income' AND status = 'completed'), 0)
          - COALESCE((SELECT SUM(amount) FROM fin_operations
                     WHERE reservation_id = r.id AND op_type = 'expense' AND payment_subtype = 'refund' AND status = 'completed'), 0)
        )
    `).get() as any;

    const alerts = [
      { metric: 'Транзакцій без BU', value: noProjectRows.cnt, threshold: Math.max(1, totalExpRows.cnt * 0.03), status: noProjectRows.cnt > totalExpRows.cnt * 0.03 ? 'RED' : 'GREEN' },
      { metric: 'Pending accruals', value: pendingAccruals.cnt, threshold: 0, status: pendingAccruals.cnt > 0 ? 'YELLOW' : 'GREEN' },
      { metric: 'Неоплачені бронювання', value: expectedRow.cnt, threshold: 0, status: expectedRow.cnt > 0 ? 'YELLOW' : 'GREEN' },
    ];

    const recent = db.prepare(`
      SELECT o.*,
             ec.name as category_name, ec.icon as category_icon, ec.color as category_color,
             bu.name as bu_name
      FROM fin_operations o
      LEFT JOIN expense_categories ec ON o.category_id = ec.id
      LEFT JOIN business_units bu ON o.project_id = bu.id
      WHERE o.op_type = 'expense' AND COALESCE(o.payment_subtype,'') != 'refund'
      ORDER BY o.paid_at DESC, o.created_at DESC LIMIT 10
    `).all();

    return NextResponse.json({
      month,
      kpi: {
        revenue,
        expenses: expenses + pendingAccruals.total,
        ebitda, margin: Math.round(margin * 10) / 10,
        capex: capexRow.total, depreciation: depRow.total,
        pendingAccruals: pendingAccruals.total, expectedPayments: expectedRow.total,
      },
      monthlyData, buBreakdown, alerts, recentTransactions: recent,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const PNL_LINES = [
  { section: 'Revenue', line: 'Проживання', type: 'direct', key: 'Проживання' },
  { section: 'Revenue', line: 'Сауна', type: 'direct', key: 'Сауна' },
  { section: 'Revenue', line: 'Ресторан', type: 'direct', key: 'Ресторан' },
  { section: 'Revenue', line: 'Сніданки', type: 'direct', key: 'Сніданки' },
  { section: 'Revenue', line: 'Інші доходи', type: 'direct', key: 'Інші доходи' },
  { section: 'Revenue', line: 'Всього виручка', type: 'total_revenue', key: '' },
  { section: 'Variable', line: 'Продукти', type: 'direct', key: 'Продукти' },
  { section: 'Variable', line: 'Харчування', type: 'direct', key: 'Харчування' },
  { section: 'Variable', line: 'Змінні витрати', type: 'direct', key: 'Змінні витрати' },
  { section: 'Variable', line: 'Всього змінні витрати', type: 'total_variable', key: '' },
  { section: 'Margin', line: 'Валовий прибуток', type: 'gross_profit', key: '' },
  { section: 'OPEX direct', line: 'Зарплати (direct)', type: 'direct', key: 'Зарплати' },
  { section: 'OPEX direct', line: 'Маркетинг (direct)', type: 'direct', key: 'Маркетинг' },
  { section: 'OPEX direct', line: 'Оренда (direct)', type: 'direct', key: 'Оренда' },
  { section: 'OPEX direct', line: 'Комунальні (direct)', type: 'direct', key: 'Комунальні' },
  { section: 'OPEX direct', line: 'Профпослуги (direct)', type: 'direct', key: 'Профпослуги' },
  { section: 'OPEX direct', line: 'Інші витрати (direct)', type: 'direct', key: 'Інші витрати' },
  { section: 'OPEX direct', line: 'Розхідники (direct)', type: 'direct', key: 'Розхідники' },
  { section: 'OPEX alloc', line: 'Алокація оренди', type: 'alloc', key: 'RENT' },
  { section: 'OPEX alloc', line: 'Алокація комунальних', type: 'alloc', key: 'UTILITIES' },
  { section: 'OPEX alloc', line: 'Алокація shared payroll', type: 'alloc', key: 'SHARED_PAYROLL' },
  { section: 'OPEX alloc', line: 'Алокація HQ/загальних', type: 'alloc', key: 'HQ' },
  { section: 'Result', line: 'EBITDA', type: 'ebitda', key: '' },
  { section: 'Taxes', line: 'Податки', type: 'direct', key: 'Податки' },
  { section: 'Result', line: 'Net result', type: 'net', key: '' },
  { section: 'CAPEX', line: 'CAPEX spend', type: 'capex', key: '' },
  { section: 'CAPEX', line: 'Амортизація', type: 'depreciation', key: '' },
];

export async function getPnl(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    const bus = db.prepare(`
      SELECT id, name FROM business_units
      WHERE is_active = 1 AND is_shared = 0 AND name != 'На перегляд'
      ORDER BY sort_order
    `).all() as any[];

    // All operations grouped by pnl_line × project_id (using fin_operations)
    const opsByLineAndBU = db.prepare(`
      SELECT ec.pnl_line, o.project_id AS business_unit_id, o.op_type, COALESCE(o.payment_subtype, '') as payment_subtype, SUM(o.amount_company) as total
      FROM fin_operations o LEFT JOIN expense_categories ec ON o.category_id = ec.id
      WHERE o.status = 'completed'
        AND strftime('%Y-%m', o.paid_at) = ?
      GROUP BY ec.pnl_line, o.project_id, o.op_type, COALESCE(o.payment_subtype, '')
    `).all(month) as any[];

    // Only PENDING accruals overlay the cash figures: a paid accrual is (or
    // will be) a real fin_operation — counting both doubled the expense.
    const accrualsByLineAndBU = db.prepare(`
      SELECT ec.pnl_line, a.business_unit_id, SUM(a.amount) as total
      FROM accruals a LEFT JOIN expense_categories ec ON a.category_id = ec.id
      WHERE a.month = ? AND a.status = 'pending' GROUP BY ec.pnl_line, a.business_unit_id
    `).all(month) as any[];

    for (const acc of accrualsByLineAndBU) {
      const existing = opsByLineAndBU.find((e: any) => e.pnl_line === acc.pnl_line && e.business_unit_id === acc.business_unit_id && e.op_type === 'expense' && e.payment_subtype === '');
      if (existing) existing.total += acc.total;
      else opsByLineAndBU.push({ pnl_line: acc.pnl_line, business_unit_id: acc.business_unit_id, op_type: 'expense', payment_subtype: '', total: acc.total });
    }

    const sharedByAllocMethod = db.prepare(`
      SELECT ec.alloc_method, SUM(o.amount_company) as total
      FROM fin_operations o JOIN expense_categories ec ON o.category_id = ec.id
      WHERE o.op_type = 'expense' AND COALESCE(o.payment_subtype, '') != 'refund'
        AND strftime('%Y-%m', o.paid_at) = ? AND o.project_id = 'bu_shared'
        AND ec.alloc_method NOT IN ('DIRECT', 'NONE')
      GROUP BY ec.alloc_method
    `).all(month) as any[];

    const sharedAccrualsByMethod = db.prepare(`
      SELECT ec.alloc_method, SUM(a.amount) as total
      FROM accruals a LEFT JOIN expense_categories ec ON a.category_id = ec.id
      WHERE a.month = ? AND a.business_unit_id = 'bu_shared' AND a.status = 'pending'
            AND ec.alloc_method NOT IN ('DIRECT', 'NONE')
      GROUP BY ec.alloc_method
    `).all(month) as any[];

    for (const acc of sharedAccrualsByMethod) {
      const existing = sharedByAllocMethod.find((s: any) => s.alloc_method === acc.alloc_method);
      if (existing) existing.total += acc.total;
      else sharedByAllocMethod.push(acc);
    }

    const allocRules = db.prepare(`
      SELECT alloc_method, business_unit_id, percentage FROM cost_allocations
      WHERE month = COALESCE(
        (SELECT MAX(month) FROM cost_allocations WHERE month <= ?),
        (SELECT MIN(month) FROM cost_allocations)
      )
    `).all(month) as any[];

    const allocMap: Record<string, Record<string, number>> = {};
    for (const rule of allocRules) {
      if (!allocMap[rule.alloc_method]) allocMap[rule.alloc_method] = {};
      allocMap[rule.alloc_method][rule.business_unit_id] = rule.percentage / 100;
    }

    const rows = PNL_LINES.map(line => {
      const buValues: Record<string, number> = {};
      let total = 0;

      if (line.type === 'direct' && line.section === 'Revenue') {
        for (const bu of bus) {
          let val = 0;
          for (const op of opsByLineAndBU) {
            const mappedLine = op.pnl_line || 'Інші доходи';
            if (mappedLine === line.key && op.business_unit_id === bu.id) {
              if (op.op_type === 'income') val += op.total;
              else if (op.op_type === 'expense' && op.payment_subtype === 'refund') val -= op.total;
            }
          }
          buValues[bu.id] = val;
          total += val;
        }
      } else if (line.type === 'direct' && (line.section === 'Variable' || line.section === 'OPEX direct' || line.section === 'Taxes')) {
        for (const bu of bus) {
          let val = 0;
          for (const op of opsByLineAndBU) {
            if (op.pnl_line === line.key && op.business_unit_id === bu.id) {
              if (op.op_type === 'expense' && op.payment_subtype !== 'refund') val += op.total;
            }
          }
          buValues[bu.id] = -val;
          total += buValues[bu.id];
        }
      } else if (line.type === 'alloc') {
        const sharedTotal = sharedByAllocMethod.find((s: any) => s.alloc_method === line.key)?.total || 0;
        for (const bu of bus) {
          const pct = allocMap[line.key]?.[bu.id] || 0;
          buValues[bu.id] = -Math.round(sharedTotal * pct);
          total += buValues[bu.id];
        }
      } else if (line.type === 'capex') {
        for (const bu of bus) {
          const capex = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM capex_items WHERE month = ? AND business_unit_id = ?`).get(month, bu.id) as any;
          buValues[bu.id] = -(capex.total);
          total += buValues[bu.id];
        }
      } else if (line.type === 'depreciation') {
        for (const bu of bus) {
          const dep = db.prepare(`SELECT COALESCE(SUM(depreciation_monthly), 0) as total FROM capex_items WHERE status = 'active' AND depreciation_monthly > 0 AND business_unit_id = ?`).get(bu.id) as any;
          buValues[bu.id] = -(dep.total);
          total += buValues[bu.id];
        }
      } else {
        for (const bu of bus) buValues[bu.id] = 0;
      }

      return { ...line, buValues, total };
    });

    const getRowTotal = (key: string, buId: string): number => rows.find(r => r.key === key && r.type === 'direct')?.buValues[buId] || 0;

    const trRow = rows.find(r => r.type === 'total_revenue');
    if (trRow) {
      for (const bu of bus) {
        trRow.buValues[bu.id] = ['Проживання', 'Сауна', 'Ресторан', 'Сніданки', 'Інші доходи'].reduce((sum, key) => sum + getRowTotal(key, bu.id), 0);
        trRow.total += trRow.buValues[bu.id];
      }
    }

    const tvRow = rows.find(r => r.type === 'total_variable');
    if (tvRow) {
      for (const bu of bus) {
        tvRow.buValues[bu.id] = ['Продукти', 'Харчування', 'Змінні витрати'].reduce((sum, key) => sum + getRowTotal(key, bu.id), 0);
        tvRow.total += tvRow.buValues[bu.id];
      }
    }

    const gpRow = rows.find(r => r.type === 'gross_profit');
    if (gpRow && trRow && tvRow) {
      for (const bu of bus) {
        gpRow.buValues[bu.id] = (trRow.buValues[bu.id] || 0) + (tvRow.buValues[bu.id] || 0);
        gpRow.total += gpRow.buValues[bu.id];
      }
    }

    const ebitdaRow = rows.find(r => r.type === 'ebitda');
    if (ebitdaRow && gpRow) {
      const opexRows = rows.filter(r => r.section === 'OPEX direct' || r.section === 'OPEX alloc');
      for (const bu of bus) {
        const totalOpex = opexRows.reduce((sum, r) => sum + (r.buValues[bu.id] || 0), 0);
        ebitdaRow.buValues[bu.id] = (gpRow.buValues[bu.id] || 0) + totalOpex;
        ebitdaRow.total += ebitdaRow.buValues[bu.id];
      }
    }

    const netRow = rows.find(r => r.type === 'net');
    if (netRow && ebitdaRow) {
      const taxRow = rows.find(r => r.key === 'Податки');
      for (const bu of bus) {
        netRow.buValues[bu.id] = (ebitdaRow.buValues[bu.id] || 0) + (taxRow?.buValues[bu.id] || 0);
        netRow.total += netRow.buValues[bu.id];
      }
    }

    return NextResponse.json({ month, businessUnits: bus, rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getCashflow(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    const months: string[] = [];
    const now = new Date(month + '-01');
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().substring(0, 7));
    }

    const inflows = months.map(m => {
      const row = db.prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN op_type = 'income' THEN amount_company
               WHEN op_type = 'expense' AND payment_subtype = 'refund' THEN -amount_company
               ELSE 0 END
        ), 0) as total
        FROM fin_operations
        WHERE status = 'completed'
          AND strftime('%Y-%m', paid_at) = ?
      `).get(m) as any;
      return { month: m, amount: row.total };
    });

    const outflows = months.map(m => {
      const row = db.prepare(`
        SELECT COALESCE(SUM(o.amount_company), 0) as total
        FROM fin_operations o LEFT JOIN expense_categories ec ON o.category_id = ec.id
        WHERE o.op_type = 'expense' AND COALESCE(o.payment_subtype,'') != 'refund'
          AND o.status = 'completed'
          AND strftime('%Y-%m', o.paid_at) = ?
          AND COALESCE(ec.include_in_cash, 1) = 1
      `).get(m) as any;
      return { month: m, amount: row.total };
    });

    const inflowsBySource = db.prepare(`
      SELECT o.method, COUNT(*) as count,
             SUM(CASE WHEN op_type = 'income' THEN amount_company
                      WHEN op_type = 'expense' AND payment_subtype = 'refund' THEN -amount_company
                      ELSE 0 END) as total
      FROM fin_operations o
      WHERE o.status = 'completed' AND (o.op_type = 'income' OR (o.op_type = 'expense' AND o.payment_subtype = 'refund'))
        AND strftime('%Y-%m', o.paid_at) = ?
      GROUP BY o.method
    `).all(month) as any[];

    const outflowsByCategory = db.prepare(`
      SELECT COALESCE(ec.name, 'Без категорії') as name, ec.icon, ec.color,
             COALESCE(SUM(o.amount_company), 0) as total
      FROM fin_operations o LEFT JOIN expense_categories ec ON o.category_id = ec.id
      WHERE o.op_type = 'expense' AND COALESCE(o.payment_subtype,'') != 'refund'
        AND o.status = 'completed'
        AND strftime('%Y-%m', o.paid_at) = ?
        AND COALESCE(ec.include_in_cash, 1) = 1
      GROUP BY o.category_id ORDER BY total DESC
    `).all(month) as any[];

    const outflowsByBU = db.prepare(`
      SELECT bu.name, COALESCE(SUM(o.amount_company), 0) as total
      FROM fin_operations o LEFT JOIN expense_categories ec ON o.category_id = ec.id
      LEFT JOIN business_units bu ON o.project_id = bu.id
      WHERE o.op_type = 'expense' AND COALESCE(o.payment_subtype,'') != 'refund'
        AND o.status = 'completed'
        AND strftime('%Y-%m', o.paid_at) = ?
        AND COALESCE(ec.include_in_cash, 1) = 1
      GROUP BY o.project_id ORDER BY total DESC
    `).all(month) as any[];

    const currentInflow = inflows.find(i => i.month === month)?.amount || 0;
    const currentOutflow = outflows.find(o => o.month === month)?.amount || 0;

    return NextResponse.json({
      month,
      kpi: { inflows: currentInflow, outflows: currentOutflow, netCashFlow: currentInflow - currentOutflow },
      monthlyData: months.map((m, i) => ({ month: m, inflows: inflows[i].amount, outflows: outflows[i].amount, net: inflows[i].amount - outflows[i].amount })),
      inflowsBySource, outflowsByCategory, outflowsByBU,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════
// PR #9: Matrix reports (category × month) with drill-down
// ═══════════════════════════════════════════════════════

interface MatrixRow {
  category_id: string | null;
  category_name: string;
  category_icon: string | null;
  classifier: string | null;
  parent_id: string | null;
  op_type: string;
  months: Record<string, number>;  // YYYY-MM → amount
  total: number;
  children?: MatrixRow[];
}

function generateMonthList(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const result: string[] = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

function orgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

export async function getCashflowMatrix(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const { searchParams } = new URL(request.url);
    const today = new Date();
    const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const defaultFromDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const defaultFrom = `${defaultFromDate.getFullYear()}-${String(defaultFromDate.getMonth() + 1).padStart(2, '0')}`;

    const from = searchParams.get('from') || defaultFrom;
    const to = searchParams.get('to') || defaultTo;
    const basis = searchParams.get('basis') === 'accrued' ? 'accrued_at' : 'paid_at';
    const accountId = searchParams.get('account_id');
    const projectId = searchParams.get('project_id');
    const tagIds = (searchParams.get('tag_ids') || '').split(',').map((s) => s.trim()).filter(Boolean);

    const months = generateMonthList(from, to);
    const fromDate = `${from}-01`;
    const toDate = `${to}-31`;

    const where: string[] = [
      "o.status = 'completed'",
      `strftime('%Y-%m', o.${basis}) BETWEEN ? AND ?`,
      'o.organization_id = ?',
    ];
    const params: any[] = [from, to, org];
    if (accountId) { where.push('(o.account_from_id = ? OR o.account_to_id = ?)'); params.push(accountId, accountId); }
    if (projectId) { where.push('o.project_id = ?'); params.push(projectId); }
    if (tagIds.length > 0) {
      where.push(`o.id IN (SELECT operation_id FROM fin_operation_tags WHERE tag_id IN (${tagIds.map(() => '?').join(',')}))`);
      params.push(...tagIds);
    }

    const rows = db.prepare(`
      SELECT
        ec.id AS cat_id, ec.name AS cat_name, ec.icon AS cat_icon,
        ec.classifier, ec.op_type AS cat_op_type, ec.parent_id,
        o.op_type, strftime('%Y-%m', o.${basis}) AS month,
        SUM(o.amount_company) AS total
      FROM fin_operations o
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
      WHERE ${where.join(' AND ')}
        AND o.op_type != 'transfer'
      GROUP BY COALESCE(ec.id, ''), o.op_type, month
    `).all(...params) as any[];

    // Build category tree + month data
    const categoryMap = new Map<string, MatrixRow>();
    for (const r of rows) {
      const key = r.cat_id || `_uncategorized_${r.op_type}`;
      if (!categoryMap.has(key)) {
        categoryMap.set(key, {
          category_id: r.cat_id,
          category_name: r.cat_name || 'Без категорії',
          category_icon: r.cat_icon,
          classifier: r.classifier,
          parent_id: r.parent_id,
          op_type: r.op_type,
          months: {},
          total: 0,
        });
      }
      const row = categoryMap.get(key)!;
      row.months[r.month] = (row.months[r.month] || 0) + r.total;
      row.total += r.total;
    }

    // Group into tree (root + children)
    const categories = [...categoryMap.values()];
    const roots = categories.filter((c) => !c.parent_id);
    const children = categories.filter((c) => c.parent_id);
    for (const root of roots) {
      root.children = children.filter((c) => c.parent_id === root.category_id).sort((a, b) => b.total - a.total);
    }

    // Split by op_type
    const incomeRoots = roots.filter((c) => c.op_type === 'income').sort((a, b) => b.total - a.total);
    const expenseRoots = roots.filter((c) => c.op_type === 'expense').sort((a, b) => b.total - a.total);

    // Compute monthly totals
    const incomeByMonth: Record<string, number> = {};
    const expenseByMonth: Record<string, number> = {};
    let totalIncome = 0;
    let totalExpense = 0;
    for (const m of months) { incomeByMonth[m] = 0; expenseByMonth[m] = 0; }
    for (const r of incomeRoots) { for (const m of months) incomeByMonth[m] += r.months[m] || 0; totalIncome += r.total; }
    for (const r of expenseRoots) { for (const m of months) expenseByMonth[m] += r.months[m] || 0; totalExpense += r.total; }

    const netByMonth: Record<string, number> = {};
    for (const m of months) netByMonth[m] = incomeByMonth[m] - expenseByMonth[m];

    // Opening/ending balances (sum across all accounts) per month
    const accountsRows = db.prepare(`
      SELECT id, initial_balance FROM finance_accounts WHERE organization_id = ? AND is_active = 1
    `).all(org) as { id: string; initial_balance: number }[];
    const accountIds = accountsRows.map((a) => a.id);
    const initialBalSum = accountsRows.reduce((s, a) => s + (a.initial_balance || 0), 0);

    // Balances always live on the PAID basis (money on accounts is a cash
    // fact) — independent of the flows basis above, so "ending = opening +
    // net" stays true only when basis='paid'; on accrued basis the balance
    // rows still show real account state instead of a fictional equation.
    const monthBalances: Record<string, { opening: number; ending: number }> = {};
    let runningBalance = initialBalSum;
    const paidDeltaByMonth: Record<string, number> = {};
    for (const m of months) paidDeltaByMonth[m] = 0;
    if (accountIds.length > 0) {
      const plh = accountIds.map(() => '?').join(',');
      const prior = db.prepare(`
        SELECT
          COALESCE((SELECT SUM(amount_company) FROM fin_operations WHERE account_to_id IN (${plh}) AND status='completed' AND paid_at < ?), 0)
          - COALESCE((SELECT SUM(amount_company) FROM fin_operations WHERE account_from_id IN (${plh}) AND status='completed' AND paid_at < ?), 0)
          AS delta
      `).get(...accountIds, fromDate, ...accountIds, fromDate) as { delta: number };
      runningBalance += prior.delta;

      const deltas = db.prepare(`
        SELECT strftime('%Y-%m', paid_at) AS m,
          COALESCE(SUM(CASE WHEN account_to_id IN (${plh}) THEN amount_company ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN account_from_id IN (${plh}) THEN amount_company ELSE 0 END), 0) AS delta
        FROM fin_operations
        WHERE status = 'completed' AND strftime('%Y-%m', paid_at) BETWEEN ? AND ?
        GROUP BY strftime('%Y-%m', paid_at)
      `).all(...accountIds, ...accountIds, months[0], months[months.length - 1]) as { m: string; delta: number }[];
      for (const d of deltas) if (d.m in paidDeltaByMonth) paidDeltaByMonth[d.m] = d.delta;
    }
    for (const m of months) {
      monthBalances[m] = { opening: runningBalance, ending: runningBalance + paidDeltaByMonth[m] };
      runningBalance = monthBalances[m].ending;
    }

    return NextResponse.json({
      months,
      basis,
      income: { roots: incomeRoots, byMonth: incomeByMonth, total: totalIncome },
      expense: { roots: expenseRoots, byMonth: expenseByMonth, total: totalExpense },
      netByMonth, netTotal: totalIncome - totalExpense,
      monthBalances,
      summary: { totalIncome, totalExpense, netFlow: totalIncome - totalExpense },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getPnlMatrix(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const { searchParams } = new URL(request.url);
    const today = new Date();
    const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const defaultFromDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const defaultFrom = `${defaultFromDate.getFullYear()}-${String(defaultFromDate.getMonth() + 1).padStart(2, '0')}`;

    const from = searchParams.get('from') || defaultFrom;
    const to = searchParams.get('to') || defaultTo;
    const basis = searchParams.get('basis') === 'paid' ? 'paid_at' : 'accrued_at';
    const tagIds = (searchParams.get('tag_ids') || '').split(',').map((s) => s.trim()).filter(Boolean);

    const months = generateMonthList(from, to);

    const tagFilter = tagIds.length > 0
      ? `AND o.id IN (SELECT operation_id FROM fin_operation_tags WHERE tag_id IN (${tagIds.map(() => '?').join(',')}))`
      : '';

    const rows = db.prepare(`
      SELECT
        ec.id AS cat_id, ec.name AS cat_name, ec.icon AS cat_icon,
        COALESCE(ec.classifier, 'other') AS classifier,
        ec.op_type AS cat_op_type, ec.parent_id,
        o.op_type, strftime('%Y-%m', o.${basis}) AS month,
        SUM(o.amount_company) AS total
      FROM fin_operations o
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
      WHERE o.status = 'completed'
        AND strftime('%Y-%m', o.${basis}) BETWEEN ? AND ?
        AND o.organization_id = ?
        AND o.op_type != 'transfer'
        ${tagFilter}
      GROUP BY COALESCE(ec.id, ''), o.op_type, month
    `).all(from, to, org, ...tagIds) as any[];

    // Classify
    const byClassifier: Record<string, MatrixRow[]> = {
      revenue: [], cogs: [], variable: [], operational: [],
      tax: [], capex: [], financing: [], other: [],
    };

    const catMap = new Map<string, MatrixRow>();
    for (const r of rows) {
      const key = r.cat_id || `_uncat_${r.op_type}`;
      if (!catMap.has(key)) {
        catMap.set(key, {
          category_id: r.cat_id,
          category_name: r.cat_name || 'Без категорії',
          category_icon: r.cat_icon,
          classifier: r.classifier,
          parent_id: r.parent_id,
          op_type: r.op_type,
          months: {},
          total: 0,
        });
      }
      const row = catMap.get(key)!;
      row.months[r.month] = (row.months[r.month] || 0) + r.total;
      row.total += r.total;
    }

    const categories = [...catMap.values()];
    const roots = categories.filter((c) => !c.parent_id);
    const children = categories.filter((c) => c.parent_id);
    for (const root of roots) {
      root.children = children.filter((c) => c.parent_id === root.category_id).sort((a, b) => b.total - a.total);
    }

    // Bucket into classifier sections. Financing inflows (investor
    // contributions, loans) are NOT revenue — they get their own section.
    const financingIncome: MatrixRow[] = [];
    for (const r of roots) {
      if (r.op_type === 'income') {
        if ((r.classifier || '') === 'financing') financingIncome.push(r);
        else byClassifier.revenue.push(r);
      } else {
        const cls = r.classifier || 'other';
        if (byClassifier[cls]) byClassifier[cls].push(r);
        else byClassifier.other.push(r);
      }
    }

    for (const arr of Object.values(byClassifier)) arr.sort((a, b) => b.total - a.total);

    function sumByMonth(rs: MatrixRow[]): { byMonth: Record<string, number>; total: number } {
      const byMonth: Record<string, number> = {};
      for (const m of months) byMonth[m] = 0;
      let total = 0;
      for (const r of rs) {
        for (const m of months) byMonth[m] += r.months[m] || 0;
        total += r.total;
      }
      return { byMonth, total };
    }

    const revSum = sumByMonth(byClassifier.revenue);
    const cogsSum = sumByMonth(byClassifier.cogs);
    const variableSum = sumByMonth(byClassifier.variable);
    const opSum = sumByMonth(byClassifier.operational);
    const taxSum = sumByMonth(byClassifier.tax);
    const capexSum = sumByMonth(byClassifier.capex);
    const finSum = sumByMonth(byClassifier.financing);
    const otherSum = sumByMonth(byClassifier.other);

    function subtract(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
      const out: Record<string, number> = {};
      for (const m of months) out[m] = (a[m] || 0) - (b[m] || 0);
      return out;
    }

    const finInSum = sumByMonth(financingIncome);

    const gpByMonth = subtract(revSum.byMonth, cogsSum.byMonth);
    const gpTotal = revSum.total - cogsSum.total;
    const miByMonth = subtract(gpByMonth, variableSum.byMonth);
    const miTotal = gpTotal - variableSum.total;
    const ebitdaByMonth = subtract(miByMonth, opSum.byMonth);
    const ebitdaTotal = miTotal - opSum.total;
    // P&L net result: EBITDA − taxes − other. CapEx and financing are NOT
    // P&L lines — they feed the separate cash result below.
    const netByMonth = subtract(subtract(ebitdaByMonth, taxSum.byMonth), otherSum.byMonth);
    const netTotal = ebitdaTotal - taxSum.total - otherSum.total;
    // Cash result: what actually stayed in the till after capex & financing.
    const cashByMonth: Record<string, number> = {};
    for (const m of months) {
      cashByMonth[m] = (netByMonth[m] || 0) - (capexSum.byMonth[m] || 0)
        - (finSum.byMonth[m] || 0) + (finInSum.byMonth[m] || 0);
    }
    const cashTotal = netTotal - capexSum.total - finSum.total + finInSum.total;

    const pct = (v: number, base: number) => base > 0 ? Math.round((v / base) * 1000) / 10 : null;

    return NextResponse.json({
      months, basis,
      sections: [
        { key: 'revenue',     name: 'Виручка',              rows: byClassifier.revenue,     byMonth: revSum.byMonth,     total: revSum.total,     isTotal: true },
        { key: 'cogs',        name: 'COGS',                 rows: byClassifier.cogs,        byMonth: cogsSum.byMonth,    total: cogsSum.total,    sign: -1 },
        { key: 'gross',       name: 'Валовий прибуток',     byMonth: gpByMonth,             total: gpTotal,              margin_pct: pct(gpTotal, revSum.total), isDerived: true },
        { key: 'variable',    name: 'Змінні',               rows: byClassifier.variable,    byMonth: variableSum.byMonth,total: variableSum.total,sign: -1 },
        { key: 'marginal',    name: 'Маржинальний дохід',   byMonth: miByMonth,             total: miTotal,              margin_pct: pct(miTotal, revSum.total), isDerived: true },
        { key: 'operational', name: 'Операційні',           rows: byClassifier.operational, byMonth: opSum.byMonth,      total: opSum.total,      sign: -1 },
        { key: 'ebitda',      name: 'EBITDA',               byMonth: ebitdaByMonth,         total: ebitdaTotal,          margin_pct: pct(ebitdaTotal, revSum.total), isDerived: true, highlight: true },
        { key: 'tax',         name: 'Податки',              rows: byClassifier.tax,         byMonth: taxSum.byMonth,     total: taxSum.total,     sign: -1 },
        { key: 'other',       name: 'Інше',                 rows: byClassifier.other,       byMonth: otherSum.byMonth,   total: otherSum.total,   sign: -1 },
        { key: 'net',         name: 'Чистий результат',     byMonth: netByMonth,            total: netTotal,             margin_pct: pct(netTotal, revSum.total), isDerived: true, highlight: true },
        { key: 'capex',       name: 'CapEx',                rows: byClassifier.capex,       byMonth: capexSum.byMonth,   total: capexSum.total,   sign: -1 },
        { key: 'financing',   name: 'Фінансові (виплати)',  rows: byClassifier.financing,   byMonth: finSum.byMonth,     total: finSum.total,     sign: -1 },
        { key: 'financing_in',name: 'Фінансові (надходження)', rows: financingIncome,       byMonth: finInSum.byMonth,   total: finInSum.total },
        { key: 'cash_result', name: 'Грошовий результат',   byMonth: cashByMonth,           total: cashTotal,            isDerived: true, highlight: true },
      ],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getFinancialIndicators(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    // Canonical definitions (money-metrics): revenue nets refunds and
    // excludes financing inflows — same number as the overview shows.
    const mm = getMonthMoney(db, month);
    const revenue = mm.revenue;
    const cogs = mm.cogs;
    const variable = mm.variable;
    const operational = mm.operational + mm.other_expense + mm.uncategorized_expense;

    const grossProfit = revenue - cogs;
    const marginalIncome = grossProfit - variable;
    const ebitda = marginalIncome - operational;
    const marginPct = revenue > 0 ? Math.round((ebitda / revenue) * 1000) / 10 : null;
    const grossMarginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : null;

    return NextResponse.json({
      month, revenue, cogs, variable, operational,
      gross_profit: grossProfit, marginal_income: marginalIncome, ebitda,
      margin_pct: marginPct, gross_margin_pct: grossMarginPct,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════
// PR #10: Additional reports — Balance, Projects, Statement, Plan/Fact
// ═══════════════════════════════════════════════════════

export async function getBalanceSheet(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get('as_of') || new Date().toISOString().substring(0, 10);

    const accounts = db.prepare(`
      SELECT fa.id, fa.name, fa.type, fa.currency, fa.credit_limit, fa.color, fa.initial_balance,
        (
          fa.initial_balance
          + COALESCE((SELECT SUM(
              CASE
                WHEN o.op_type = 'transfer' AND o.currency_to IS NOT NULL AND o.currency_to = fa.currency
                  THEN COALESCE(o.amount_to, o.amount)
                WHEN o.currency = fa.currency THEN o.amount
                ELSE o.amount_company
              END
            ) FROM fin_operations o
            WHERE o.account_to_id = fa.id AND o.status = 'completed' AND o.paid_at <= ?), 0)
          - COALESCE((SELECT SUM(
              CASE WHEN o.currency = fa.currency THEN o.amount ELSE o.amount_company END
            ) FROM fin_operations o
            WHERE o.account_from_id = fa.id AND o.status = 'completed' AND o.paid_at <= ?), 0)
        ) AS balance
      FROM finance_accounts fa
      WHERE fa.organization_id = ? AND fa.is_active = 1
      ORDER BY fa.type, fa.sort_order, fa.name
    `).all(asOf, asOf, org) as any[];

    const assets = accounts.filter((a) => a.type !== 'card').map((a) => ({ ...a, section: 'assets' }));
    const liabilities = accounts.filter((a) => a.type === 'card').map((a) => {
      const debt = a.balance < 0 ? Math.abs(a.balance) : 0;
      const available = (a.credit_limit || 0) + a.balance;
      return { ...a, section: 'liabilities', debt, available };
    });

    // OTA receivables: money the platforms owe us (CZK)
    const otaReceivables = db.prepare(`
      SELECT COALESCE(SUM(COALESCE(expected_net, expected_gross, 0)), 0) AS total, COUNT(*) AS cnt
      FROM fin_channel_receivables
      WHERE status IN ('expected', 'in_statement')
    `).get() as { total: number; cnt: number };

    // Guest prepayments for FUTURE stays: money received, service not yet
    // delivered — a liability until check-in (CZK)
    const guestPrepayments = db.prepare(`
      SELECT COALESCE(SUM(o.amount_company), 0) AS total, COUNT(DISTINCT o.reservation_id) AS cnt
      FROM fin_operations o
      JOIN reservations r ON r.id = o.reservation_id
      WHERE o.op_type = 'income' AND o.status = 'completed'
        AND o.paid_at <= ? AND r.check_in > ?
        AND r.status IN ('confirmed', 'tentative')
    `).get(asOf, asOf) as { total: number; cnt: number };

    // Fixed assets: capex purchase cost minus straight-line depreciation
    const fixedAssets = db.prepare(`
      SELECT COALESCE(SUM(MAX(0, amount - COALESCE(depreciation_monthly, 0) *
        MAX(0, (julianday(?) - julianday(month || '-01')) / 30.44))), 0) AS total,
        COUNT(*) AS cnt
      FROM capex_items WHERE status = 'active'
    `).get(asOf) as { total: number; cnt: number };

    const byCurrency: Record<string, { assets: number; liabilities: number; net: number }> = {};
    for (const a of assets) {
      if (!byCurrency[a.currency]) byCurrency[a.currency] = { assets: 0, liabilities: 0, net: 0 };
      byCurrency[a.currency].assets += Math.max(0, a.balance);
    }
    for (const l of liabilities) {
      if (!byCurrency[l.currency]) byCurrency[l.currency] = { assets: 0, liabilities: 0, net: 0 };
      byCurrency[l.currency].liabilities += l.debt;
    }
    if (!byCurrency['CZK']) byCurrency['CZK'] = { assets: 0, liabilities: 0, net: 0 };
    byCurrency['CZK'].assets += otaReceivables.total + fixedAssets.total;
    byCurrency['CZK'].liabilities += guestPrepayments.total;
    for (const cur of Object.keys(byCurrency)) {
      byCurrency[cur].net = byCurrency[cur].assets - byCurrency[cur].liabilities;
    }

    return NextResponse.json({
      as_of: asOf, assets, liabilities, byCurrency,
      ota_receivables: { total: otaReceivables.total, count: otaReceivables.cnt, currency: 'CZK' },
      guest_prepayments: { total: guestPrepayments.total, count: guestPrepayments.cnt, currency: 'CZK' },
      fixed_assets: { total: fixedAssets.total, count: fixedAssets.cnt, currency: 'CZK' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getProjectProfitability(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const { searchParams } = new URL(request.url);
    const today = new Date();
    const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const defaultFromDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const defaultFrom = `${defaultFromDate.getFullYear()}-${String(defaultFromDate.getMonth() + 1).padStart(2, '0')}`;
    const from = searchParams.get('from') || defaultFrom;
    const to = searchParams.get('to') || defaultTo;
    const basis = searchParams.get('basis') === 'accrued' ? 'accrued_at' : 'paid_at';

    const months = generateMonthList(from, to);

    // Operating view: refunds net against income; CapEx and financing flows
    // are separated so a build-out year doesn't read as operating loss.
    const rows = db.prepare(`
      SELECT bu.id AS project_id, bu.name AS project_name, bu.is_shared,
             CASE
               WHEN o.op_type = 'income' AND COALESCE(ec.classifier, '') = 'financing' THEN 'financing_in'
               WHEN o.op_type = 'income' THEN 'income'
               WHEN COALESCE(o.payment_subtype, '') = 'refund' THEN 'refund'
               WHEN COALESCE(ec.classifier, '') IN ('capex', 'financing') OR COALESCE(ec.is_capex, 0) = 1 THEN 'capex_fin'
               ELSE 'expense'
             END AS bucket,
             strftime('%Y-%m', o.${basis}) AS month, SUM(o.amount_company) AS total
      FROM fin_operations o
      JOIN business_units bu ON bu.id = o.project_id
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
      WHERE o.status = 'completed' AND o.organization_id = ?
        AND strftime('%Y-%m', o.${basis}) BETWEEN ? AND ?
        AND o.op_type != 'transfer'
      GROUP BY bu.id, bucket, month
    `).all(org, from, to) as any[];

    const projectMap = new Map<string, any>();
    for (const r of rows) {
      if (!projectMap.has(r.project_id)) {
        projectMap.set(r.project_id, {
          project_id: r.project_id, project_name: r.project_name, is_shared: r.is_shared,
          income_by_month: {}, expense_by_month: {},
          income_total: 0, expense_total: 0,
          capex_fin_total: 0, financing_in_total: 0,
        });
      }
      const p = projectMap.get(r.project_id)!;
      if (r.bucket === 'income') {
        p.income_by_month[r.month] = (p.income_by_month[r.month] || 0) + r.total;
        p.income_total += r.total;
      } else if (r.bucket === 'refund') {
        p.income_by_month[r.month] = (p.income_by_month[r.month] || 0) - r.total;
        p.income_total -= r.total;
      } else if (r.bucket === 'expense') {
        p.expense_by_month[r.month] = (p.expense_by_month[r.month] || 0) + r.total;
        p.expense_total += r.total;
      } else if (r.bucket === 'capex_fin') {
        p.capex_fin_total += r.total;
      } else if (r.bucket === 'financing_in') {
        p.financing_in_total += r.total;
      }
    }

    const projects = [...projectMap.values()].map((p) => {
      const profit_by_month: Record<string, number> = {};
      for (const m of months) profit_by_month[m] = (p.income_by_month[m] || 0) - (p.expense_by_month[m] || 0);
      const profit_total = p.income_total - p.expense_total;
      const margin_pct = p.income_total > 0 ? Math.round((profit_total / p.income_total) * 1000) / 10 : null;
      return { ...p, profit_by_month, profit_total, margin_pct };
    }).sort((a, b) => b.profit_total - a.profit_total);

    const totals = { income: 0, expense: 0, profit: 0 };
    for (const p of projects) {
      totals.income += p.income_total; totals.expense += p.expense_total; totals.profit += p.profit_total;
    }

    return NextResponse.json({ months, projects, totals, basis });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getAccountStatement(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    if (!accountId) return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    const from = searchParams.get('from') || '2000-01-01';
    const to = searchParams.get('to') || new Date().toISOString().substring(0, 10);

    const account = db.prepare(`SELECT * FROM finance_accounts WHERE id = ? AND organization_id = ?`).get(accountId, org) as any;
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const openingRow = db.prepare(`
      SELECT ? + COALESCE((SELECT SUM(
              CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END
            ) FROM fin_operations o
            WHERE o.account_to_id = ? AND o.status = 'completed' AND o.paid_at < ?), 0)
               - COALESCE((SELECT SUM(
              CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END
            ) FROM fin_operations o
            WHERE o.account_from_id = ? AND o.status = 'completed' AND o.paid_at < ?), 0) AS bal
    `).get(account.initial_balance, account.currency, accountId, from, account.currency, accountId, from) as { bal: number };
    const opening = Number(openingRow.bal) || 0;

    const ops = db.prepare(`
      SELECT o.*,
             CASE
               WHEN o.op_type = 'transfer' AND o.account_from_id = ? THEN -(CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END)
               WHEN o.op_type = 'transfer' AND o.account_to_id = ? THEN (CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END)
               WHEN o.op_type = 'income' THEN (CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END)
               WHEN o.op_type = 'expense' THEN -(CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END)
               ELSE 0
             END AS signed_amount,
             ec.name AS category_name, ec.icon AS category_icon,
             bu.name AS project_name, cp.name AS counterparty_name
      FROM fin_operations o
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
      LEFT JOIN business_units bu ON bu.id = o.project_id
      LEFT JOIN finance_counterparties cp ON cp.id = o.counterparty_id
      WHERE o.status = 'completed' AND o.organization_id = ?
        AND (o.account_from_id = ? OR o.account_to_id = ?)
        AND o.paid_at BETWEEN ? AND ?
      ORDER BY o.paid_at ASC, o.created_at ASC
    `).all(accountId, account.currency, accountId, account.currency, account.currency, account.currency, org, accountId, accountId, from, to) as any[];

    let running = opening;
    const items = ops.map((o) => {
      running += o.signed_amount;
      return { ...o, running_balance: +running.toFixed(2) };
    });
    const closing = running;

    const totalIn = items.filter((o) => o.signed_amount > 0).reduce((s, o) => s + o.signed_amount, 0);
    const totalOut = items.filter((o) => o.signed_amount < 0).reduce((s, o) => s - o.signed_amount, 0);

    return NextResponse.json({ account, from, to, opening, closing, totalIn, totalOut, items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getPlanFactReport(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year') || new Date().getFullYear());
    const month = Number(searchParams.get('month') || new Date().getMonth() + 1);
    const by = searchParams.get('by') === 'project' ? 'project' : 'category';
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const budgets = db.prepare(`SELECT * FROM fin_budgets WHERE organization_id = ? AND year = ? AND month = ?`).all(org, year, month) as any[];
    // Facts on child categories roll up to their root parent so they match the
    // root-level budget rows (entities below are parent_id IS NULL only).
    const facts = by === 'project'
      ? db.prepare(`
          SELECT o.project_id AS key, o.op_type, SUM(o.amount_company) AS total
          FROM fin_operations o
          WHERE o.status = 'completed' AND o.organization_id = ?
            AND strftime('%Y-%m', o.paid_at) = ? AND o.op_type != 'transfer'
          GROUP BY o.project_id, o.op_type
        `).all(org, monthStr) as any[]
      : db.prepare(`
          SELECT COALESCE(ec.parent_id, o.category_id) AS key, o.op_type, SUM(o.amount_company) AS total
          FROM fin_operations o
          LEFT JOIN expense_categories ec ON o.category_id = ec.id
          WHERE o.status = 'completed' AND o.organization_id = ?
            AND strftime('%Y-%m', o.paid_at) = ? AND o.op_type != 'transfer'
          GROUP BY COALESCE(ec.parent_id, o.category_id), o.op_type
        `).all(org, monthStr) as any[];

    const factMap = new Map<string, { income: number; expense: number }>();
    for (const f of facts) {
      const k = f.key || '_uncategorized';
      if (!factMap.has(k)) factMap.set(k, { income: 0, expense: 0 });
      const entry = factMap.get(k)!;
      if (f.op_type === 'income') entry.income += f.total;
      if (f.op_type === 'expense') entry.expense += f.total;
    }

    const entities = by === 'project'
      ? db.prepare("SELECT id, name, unit_type AS description FROM business_units WHERE organization_id = ? AND is_active = 1 ORDER BY sort_order").all(org) as any[]
      : db.prepare("SELECT id, name, icon, op_type FROM expense_categories WHERE organization_id = ? AND is_active = 1 AND parent_id IS NULL ORDER BY sort_order").all(org) as any[];

    const budgetMap = new Map<string, { id: string; amount: number }>();
    for (const b of budgets) {
      const k = by === 'project' ? b.project_id : b.category_id;
      if (k) budgetMap.set(k, { id: b.id, amount: (budgetMap.get(k)?.amount || 0) + b.planned_amount });
    }

    const rows = entities.map((e: any) => {
      const budget = budgetMap.get(e.id);
      const planned = budget?.amount || 0;
      const fact = factMap.get(e.id) || { income: 0, expense: 0 };
      let actual = 0;
      if (by === 'project') actual = fact.income - fact.expense;
      else if (e.op_type === 'income') actual = fact.income;
      else actual = fact.expense;

      const variance = actual - planned;
      const variance_pct = planned > 0 ? Math.round((actual / planned) * 1000) / 10 : null;
      return {
        id: e.id, name: e.name, icon: e.icon || null, op_type: e.op_type || null,
        planned, actual, variance, variance_pct, budget_id: budget?.id || null,
      };
    });

    return NextResponse.json({ year, month, by, rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- original drill-down handler below ---
export async function getOperationsForDrillDown(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const categoryId = searchParams.get('category_id');
    const opType = searchParams.get('op_type');
    const basis = searchParams.get('basis') === 'paid' ? 'paid_at' : 'accrued_at';

    const where: string[] = ["o.status = 'completed'", 'o.organization_id = ?'];
    const params: any[] = [org];
    if (month) { where.push(`strftime('%Y-%m', o.${basis}) = ?`); params.push(month); }
    if (categoryId === 'null' || categoryId === '_uncategorized') {
      where.push('o.category_id IS NULL');
    } else if (categoryId) {
      where.push('(o.category_id = ? OR o.category_id IN (SELECT id FROM expense_categories WHERE parent_id = ?))');
      params.push(categoryId, categoryId);
    }
    if (opType) { where.push('o.op_type = ?'); params.push(opType); }
    const tagIds = (searchParams.get('tag_ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (tagIds.length > 0) {
      where.push(`o.id IN (SELECT operation_id FROM fin_operation_tags WHERE tag_id IN (${tagIds.map(() => '?').join(',')}))`);
      params.push(...tagIds);
    }

    const rows = db.prepare(`
      SELECT o.*, ec.name AS category_name, ec.icon AS category_icon,
             bu.name AS project_name, cp.name AS counterparty_name,
             afr.name AS account_from_name, ato.name AS account_to_name
      FROM fin_operations o
      LEFT JOIN expense_categories ec ON ec.id = o.category_id
      LEFT JOIN business_units bu ON bu.id = o.project_id
      LEFT JOIN finance_counterparties cp ON cp.id = o.counterparty_id
      LEFT JOIN finance_accounts afr ON afr.id = o.account_from_id
      LEFT JOIN finance_accounts ato ON ato.id = o.account_to_id
      WHERE ${where.join(' AND ')}
      ORDER BY o.${basis} DESC
      LIMIT 500
    `).all(...params);
    return NextResponse.json({ operations: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getExpectedPayments(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('from') || new Date().toISOString().substring(0, 10);
    const toDate = searchParams.get('to') || (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().substring(0, 10);
    })();

    const bookings = db.prepare(`
      SELECT r.id, r.check_in, r.check_out, r.nights, r.adults, r.children,
             r.status, r.payment_status, r.total_price, r.source, r.currency, r.commission_amount,
             g.first_name, g.last_name, g.email,
             u.name as unit_name, c.type as category_type, c.name as category_name,
             COALESCE(bs.name, r.source) as source_name, COALESCE(bs.commission_percent, 0) as commission_percent,
             COALESCE((SELECT SUM(amount) FROM fin_operations
                       WHERE reservation_id = r.id AND op_type = 'income' AND status = 'completed'), 0) as paid_amount,
             COALESCE((SELECT SUM(amount) FROM fin_operations
                       WHERE reservation_id = r.id AND op_type = 'expense' AND payment_subtype = 'refund' AND status = 'completed'), 0) as refunded_amount
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id JOIN units u ON r.unit_id = u.id JOIN categories c ON u.category_id = c.id
      LEFT JOIN booking_sources bs ON r.source = bs.code
      WHERE r.status IN ('confirmed', 'checked_in', 'tentative') AND r.payment_status != 'paid'
        AND r.check_in >= ? AND r.check_in <= ?
      ORDER BY r.check_in ASC
    `).all(fromDate, toDate) as any[];

    const items = bookings.map(b => {
      const netPaid = b.paid_amount - b.refunded_amount;
      // Channel-collect OTAs pay out NET of their commission — expecting the
      // gross total_price overstated the forecast by the commission amount.
      const commission = b.commission_amount || (b.total_price * (b.commission_percent || 0) / 100);
      const expectedTotal = b.total_price - commission;
      const outstanding = expectedTotal - netPaid;
      const daysUntilCheckIn = Math.ceil((new Date(b.check_in).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      let urgency: 'overdue' | 'urgent' | 'soon' | 'upcoming' = 'upcoming';
      if (daysUntilCheckIn < 0) urgency = 'overdue';
      else if (daysUntilCheckIn <= 3) urgency = 'urgent';
      else if (daysUntilCheckIn <= 14) urgency = 'soon';
      return {
        ...b, guest_name: `${b.first_name} ${b.last_name}`, net_paid: netPaid,
        commission, expected_total: expectedTotal, outstanding,
        days_until: daysUntilCheckIn, urgency,
      };
    }).filter(b => b.outstanding > 0);

    const summary = {
      total_expected: items.reduce((s, b) => s + b.outstanding, 0),
      total_bookings: items.length,
      overdue: items.filter(b => b.urgency === 'overdue').reduce((s, b) => s + b.outstanding, 0),
      overdue_count: items.filter(b => b.urgency === 'overdue').length,
      urgent: items.filter(b => b.urgency === 'urgent').reduce((s, b) => s + b.outstanding, 0),
      urgent_count: items.filter(b => b.urgency === 'urgent').length,
      soon: items.filter(b => b.urgency === 'soon').reduce((s, b) => s + b.outstanding, 0),
      soon_count: items.filter(b => b.urgency === 'soon').length,
      upcoming: items.filter(b => b.urgency === 'upcoming').reduce((s, b) => s + b.outstanding, 0),
      upcoming_count: items.filter(b => b.urgency === 'upcoming').length,
    };

    const weekMap = new Map<string, { amount: number; count: number }>();
    for (const b of items) {
      const d = new Date(b.check_in);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1);
      const key = weekStart.toISOString().substring(0, 10);
      const existing = weekMap.get(key) || { amount: 0, count: 0 };
      existing.amount += b.outstanding; existing.count += 1;
      weekMap.set(key, existing);
    }
    const timeline = [...weekMap.entries()].map(([week, data]) => ({ week, ...data })).sort((a, b) => a.week.localeCompare(b.week));

    const byCategory: Record<string, { name: string; amount: number; count: number }> = {};
    for (const b of items) {
      if (!byCategory[b.category_type]) byCategory[b.category_type] = { name: b.category_name, amount: 0, count: 0 };
      byCategory[b.category_type].amount += b.outstanding;
      byCategory[b.category_type].count += 1;
    }

    return NextResponse.json({ items, summary, timeline, byCategory: Object.values(byCategory) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
