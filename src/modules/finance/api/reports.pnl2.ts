import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

function orgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

export async function getPnl2(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    const bus = db.prepare(`
      SELECT id, name FROM business_units
      WHERE is_active = 1 AND is_shared = 0 AND name != 'На перегляд' AND organization_id = ?
      ORDER BY sort_order
    `).all(org) as any[];

    // Fetch operations
    const ops = db.prepare(`
      SELECT o.amount_company, o.op_type, o.payment_subtype, o.project_id,
             ec.id as cat_id, ec.name as cat_name, COALESCE(ec.classifier, 'other') as classifier, ec.std_group
      FROM fin_operations o
      LEFT JOIN expense_categories ec ON o.category_id = ec.id
      WHERE o.status = 'completed' AND o.organization_id = ?
        AND strftime('%Y-%m', o.paid_at) = ?
    `).all(org, month) as any[];

    // Fetch capex depreciation
    const depRows = db.prepare(`
      SELECT business_unit_id, SUM(depreciation_monthly) as total
      FROM capex_items
      WHERE status = 'active' AND depreciation_monthly > 0 AND organization_id = ?
      GROUP BY business_unit_id
    `).all(org) as any[];
    
    // We'll return an array of rows
    const createRow = (key: string, name: string, type: 'data' | 'calc' | 'calc_pct', isSubrow = false) => {
      const buValues: Record<string, number> = {};
      bus.forEach(bu => buValues[bu.id] = 0);
      return { key, name, type, buValues, total: 0, isSubrow, details: {} as Record<string, Record<string, number>> };
    };

    const r_rev = createRow('revenue', 'Общая выручка', 'data');
    const r_var = createRow('variable', 'Переменные расходы', 'data');
    const r_fixed = createRow('fixed', 'Постоянные расходы', 'data');
    const r_mgmt = createRow('mgmt', 'Управляющая компания', 'data');
    const r_prof = createRow('prof', 'Professional services', 'data');
    const r_taxes = createRow('taxes', 'Налоги', 'data');
    const r_loans = createRow('loans', 'Кредиты', 'data');
    const r_invest = createRow('invest', 'Инвест доход', 'data');
    const r_capex = createRow('capex', 'Капитальные затраты', 'data');
    const r_amort = createRow('amort', 'Амортизация', 'data');

    // Add depreciation
    for (const d of depRows) {
      if (r_amort.buValues[d.business_unit_id] !== undefined) {
        r_amort.buValues[d.business_unit_id] += d.total;
        r_amort.total += d.total;
      }
    }

    for (const op of ops) {
      const buId = op.project_id;
      if (!buId || r_rev.buValues[buId] === undefined) continue;

      const amt = op.amount_company;
      const cname = (op.cat_name || 'Інше').trim();
      const cnameLower = cname.toLowerCase();

      // Income
      if (op.op_type === 'income') {
        if (cnameLower.includes('інвест') || cnameLower.includes('invest') || cnameLower.includes('дофінансування')) {
          r_invest.buValues[buId] += amt;
          r_invest.total += amt;
        } else {
          r_rev.buValues[buId] += amt;
          r_rev.total += amt;
          r_rev.details[cname] = r_rev.details[cname] || {};
          r_rev.details[cname][buId] = (r_rev.details[cname][buId] || 0) + amt;
        }
      } 
      // Refunds
      else if (op.op_type === 'expense' && op.payment_subtype === 'refund') {
        r_rev.buValues[buId] -= amt;
        r_rev.total -= amt;
        r_rev.details['Повернення'] = r_rev.details['Повернення'] || {};
        r_rev.details['Повернення'][buId] = (r_rev.details['Повернення'][buId] || 0) - amt;
      }
      // Expenses
      else if (op.op_type === 'expense') {
        let targetRow = null;
        
        if (cnameLower.includes('управл')) targetRow = r_mgmt;
        else if (cnameLower.includes('professional') || cnameLower.includes('консалтинг') || cnameLower.includes('аудит') || cnameLower.includes('юрист')) targetRow = r_prof;
        else if (op.classifier === 'tax' || op.std_group === 'Taxes') targetRow = r_taxes;
        else if (op.classifier === 'financing' || cnameLower.includes('кредит')) targetRow = r_loans;
        else if (op.classifier === 'capex') targetRow = r_capex;
        else if (op.classifier === 'variable' || op.std_group === 'COGS') targetRow = r_var;
        else targetRow = r_fixed;

        if (targetRow) {
          targetRow.buValues[buId] += amt;
          targetRow.total += amt;
          targetRow.details[cname] = targetRow.details[cname] || {};
          targetRow.details[cname][buId] = (targetRow.details[cname][buId] || 0) + amt;
        }
      }
    }

    const rows = [];
    
    rows.push(r_rev);

    const r_var_calc = createRow('calc_var', 'Переменные расходы', 'data');
    r_var_calc.buValues = r_var.buValues;
    r_var_calc.total = r_var.total;
    r_var_calc.details = r_var.details;
    rows.push(r_var_calc);

    const r_royalty = createRow('royalty', 'Роялти=30%', 'calc');
    for (const bu of bus) {
      r_royalty.buValues[bu.id] = Math.round(r_rev.buValues[bu.id] * 0.3);
      r_royalty.total += r_royalty.buValues[bu.id];
    }
    rows.push(r_royalty);

    const r_margin = createRow('margin', 'Маржинальная прибыль', 'calc');
    for (const bu of bus) {
      r_margin.buValues[bu.id] = r_rev.buValues[bu.id] - r_var.buValues[bu.id] - r_royalty.buValues[bu.id];
      r_margin.total += r_margin.buValues[bu.id];
    }
    rows.push(r_margin);

    const r_margin_pct = createRow('margin_pct', 'Маржинальность, %', 'calc_pct');
    for (const bu of bus) {
      r_margin_pct.buValues[bu.id] = r_rev.buValues[bu.id] ? Math.round((r_margin.buValues[bu.id] / r_rev.buValues[bu.id]) * 100) : 0;
    }
    r_margin_pct.total = r_rev.total ? Math.round((r_margin.total / r_rev.total) * 100) : 0;
    rows.push(r_margin_pct);

    rows.push(r_fixed);

    const r_store_ebitda = createRow('store_ebitda', 'Store-level EBITDA', 'calc');
    for (const bu of bus) {
      r_store_ebitda.buValues[bu.id] = r_margin.buValues[bu.id] - r_fixed.buValues[bu.id];
      r_store_ebitda.total += r_store_ebitda.buValues[bu.id];
    }
    rows.push(r_store_ebitda);

    rows.push(r_mgmt);
    rows.push(r_prof);

    const r_ebitda = createRow('ebitda', 'Операционная прибыль (EBITDA)', 'calc');
    for (const bu of bus) {
      r_ebitda.buValues[bu.id] = r_store_ebitda.buValues[bu.id] - r_mgmt.buValues[bu.id] - r_prof.buValues[bu.id];
      r_ebitda.total += r_ebitda.buValues[bu.id];
    }
    rows.push(r_ebitda);

    rows.push(r_taxes);
    rows.push(r_loans);
    rows.push(r_amort);

    const r_net = createRow('net', 'Чистая прибыль за период', 'calc');
    for (const bu of bus) {
      r_net.buValues[bu.id] = r_ebitda.buValues[bu.id] - r_taxes.buValues[bu.id] - r_loans.buValues[bu.id] - r_amort.buValues[bu.id];
      r_net.total += r_net.buValues[bu.id];
    }
    rows.push(r_net);

    const r_net_pct = createRow('net_pct', 'Рентабельность по операционной прибыли, %', 'calc_pct');
    for (const bu of bus) {
      r_net_pct.buValues[bu.id] = r_rev.buValues[bu.id] ? Math.round((r_ebitda.buValues[bu.id] / r_rev.buValues[bu.id]) * 100) : 0;
    }
    r_net_pct.total = r_rev.total ? Math.round((r_ebitda.total / r_rev.total) * 100) : 0;
    rows.push(r_net_pct);

    rows.push(r_invest);
    rows.push(r_capex);

    const finalRows = rows.map(r => {
      const children = Object.entries(r.details || {}).map(([catName, buMap]) => {
        let childTotal = 0;
        const cBuValues: Record<string, number> = {};
        bus.forEach(bu => {
          const v = (buMap as any)[bu.id] || 0;
          cBuValues[bu.id] = v;
          childTotal += v;
        });
        return { key: r.key + '_' + catName, name: catName, type: 'data', buValues: cBuValues, total: childTotal, isSubrow: true };
      }).sort((a, b) => b.total - a.total);

      return {
        key: r.key,
        name: r.name,
        type: r.type,
        buValues: r.buValues,
        total: r.total,
        isSubrow: r.isSubrow,
        children: children.length > 0 ? children : undefined
      };
    });

    return NextResponse.json({ month, businessUnits: bus, rows: finalRows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
