/* eslint-disable @typescript-eslint/no-explicit-any */
// ════════════════════════════════════════════════════════════
// Canonical month money metrics — SINGLE DEFINITION of revenue/expenses
// for every cash-based report (overview, indicators, P&L, cashflow).
//
// Rules (cash basis, company currency CZK):
//   - only fin_operations with status='completed', op_type != 'transfer'
//   - REVENUE  = income excluding financing-classified categories,
//                minus refunds (expense ops with payment_subtype='refund')
//   - financing inflows (investor contributions, loans) are NOT revenue —
//     reported separately as financing_in
//   - EXPENSE buckets follow the category classifier, with std_group as
//     fallback for legacy rows; uncategorized spending is NEVER dropped —
//     it lands in the 'uncategorized' bucket
//   - CAPEX and financing outflows are separate buckets (not operating)
// ════════════════════════════════════════════════════════════

export interface MonthMoney {
  month: string;
  /** income (non-financing) minus refunds */
  revenue: number;
  /** gross income before netting refunds (non-financing) */
  gross_income: number;
  refunds: number;
  /** financing inflows: investor contributions, loans received */
  financing_in: number;
  /** operating expenses = cogs + variable + operational + other + uncategorized */
  expenses_operating: number;
  cogs: number;
  variable: number;
  operational: number;
  tax: number;
  other_expense: number;
  uncategorized_expense: number;
  capex_out: number;
  financing_out: number;
  /** revenue − expenses_operating (before tax) */
  ebitda: number;
}

const CLS_SQL = `
  LOWER(COALESCE(
    NULLIF(TRIM(COALESCE(ec.classifier, '')), ''),
    CASE ec.std_group
      WHEN 'COGS' THEN 'cogs'
      WHEN 'OPEX' THEN 'operational'
      WHEN 'Taxes' THEN 'tax'
      WHEN 'CAPEX' THEN 'capex'
      WHEN 'Financing' THEN 'financing'
      WHEN 'Revenue' THEN 'revenue'
      ELSE 'other'
    END,
    'uncategorized'
  ))
`;

export function getMonthMoney(db: any, month: string): MonthMoney {
  const rows = db.prepare(`
    SELECT o.op_type,
           CASE WHEN o.op_type = 'expense' AND COALESCE(o.payment_subtype, '') = 'refund'
                THEN 1 ELSE 0 END AS is_refund,
           CASE WHEN o.category_id IS NULL THEN 'uncategorized' ELSE ${CLS_SQL} END AS cls,
           COALESCE(SUM(o.amount_company), 0) AS total
    FROM fin_operations o
    LEFT JOIN expense_categories ec ON ec.id = o.category_id
    WHERE o.status = 'completed'
      AND o.op_type != 'transfer'
      AND strftime('%Y-%m', o.paid_at) = ?
    GROUP BY o.op_type, is_refund, cls
  `).all(month) as { op_type: string; is_refund: number; cls: string; total: number }[];

  const m: MonthMoney = {
    month,
    revenue: 0, gross_income: 0, refunds: 0, financing_in: 0,
    expenses_operating: 0, cogs: 0, variable: 0, operational: 0,
    tax: 0, other_expense: 0, uncategorized_expense: 0,
    capex_out: 0, financing_out: 0, ebitda: 0,
  };

  for (const r of rows) {
    if (r.op_type === 'income') {
      if (r.cls === 'financing') m.financing_in += r.total;
      else m.gross_income += r.total;
      continue;
    }
    // expense
    if (r.is_refund) { m.refunds += r.total; continue; }
    switch (r.cls) {
      case 'cogs':          m.cogs += r.total; break;
      case 'variable':      m.variable += r.total; break;
      case 'operational':   m.operational += r.total; break;
      case 'tax':           m.tax += r.total; break;
      case 'capex':         m.capex_out += r.total; break;
      case 'financing':     m.financing_out += r.total; break;
      case 'uncategorized': m.uncategorized_expense += r.total; break;
      default:              m.other_expense += r.total; break;
    }
  }

  m.revenue = m.gross_income - m.refunds;
  m.expenses_operating = m.cogs + m.variable + m.operational + m.other_expense + m.uncategorized_expense;
  m.ebitda = m.revenue - m.expenses_operating;
  return m;
}
