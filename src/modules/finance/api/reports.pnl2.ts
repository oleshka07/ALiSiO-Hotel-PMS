import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

function orgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function mapExpense(cnameLower: string, commentLower: string, classifier: string, stdGroup: string): { rowId: string, childName: string } {
    const is = (searchStr: string) => cnameLower.includes(searchStr) || commentLower.includes(searchStr);
    
    // Переменные
    if (is('алкоголь') || is('продукти')) return { rowId: 'variable', childName: 'Алкоголь (Собівартість), Продукти (Собівартість)' };
    if (is('прання')) return { rowId: 'variable', childName: 'Оплата прачки' };
    if (is('адміністратор')) return { rowId: 'variable', childName: 'ЗП Админ' };
    if (is('прибиральниця')) return { rowId: 'variable', childName: 'ЗП Уборка' };
    if (is('завхоз')) return { rowId: 'variable', childName: 'ЗП Завхоз' };
    if (is('трафік')) return { rowId: 'variable', childName: 'Трафик' };
    if (is('маркетолог') || (is('маркетинг') && is('зарплата'))) return { rowId: 'variable', childName: 'Маркетолог' };
    if (is('airbnb') || is('booking')) return { rowId: 'variable', childName: 'Платформы бронирования' };
    if (is('реклам') || is('фото') || is('бренд') || is('просування') || is('послуги сторонні')) return { rowId: 'variable', childName: 'Прочие расходы на рекламу/фото/бренд' };
    
    // Постоянные
    if (is('оренда') || is('аренда')) return { rowId: 'fixed', childName: 'Аренда' };
    if (is('електрика') || is('світло') || is('свет')) return { rowId: 'fixed', childName: 'Электрика' };
    if (is('вода') || is('аква')) return { rowId: 'fixed', childName: 'Вода' };
    if (is('сміття') || is('мусор')) return { rowId: 'fixed', childName: 'Мусор' };
    if (is('страхування') || is('страховка')) return { rowId: 'fixed', childName: 'Страховка' };
    if (is('банк') || is('комісія kb') || is('комісії kb')) return { rowId: 'fixed', childName: 'Банковские услуги' };
    if (is('веб') || is('звязок') || is('застосунки') || is('сервіс')) return { rowId: 'fixed', childName: 'Приложения и сервисы' };
    if (is('інші витрати') || is('списання') || is('компенсація') || is('нерозподілено')) return { rowId: 'fixed', childName: 'Прочие' };
    
    // Management
    if (is('фінансист') || is('наташа')) return { rowId: 'mgmt', childName: 'Управляющая компания(финансист и др)' };
    if (is('профпослуги')) return { rowId: 'prof', childName: 'Professional services (Consulting, audit, Lawyer, Photographer)' };
    
    // Capex
    if (is('будівництво') && is('матеріал')) return { rowId: 'capex', childName: 'Материалы на строительство и ремонты' };
    if ((is('будівництво') && (is('території') || is('ресторану'))) || is('комплектація')) return { rowId: 'capex', childName: 'Инфраструктура и покупки товаров' };
    if (is('інструмент') || is('техніка')) return { rowId: 'capex', childName: 'Инструмент' };
    if (is('будівництво') && is('зарплат')) return { rowId: 'capex', childName: 'ЗП (капітальні зарплати)' };
    
    // Taxes
    if (is('податки') || classifier === 'tax') return { rowId: 'taxes', childName: 'Налоги' };
    
    // Loans
    if (classifier === 'financing' || is('кредит')) return { rowId: 'loans', childName: 'Кредиты' };

    // Fallbacks based on previous logic
    if (is('зарплат')) {
       if (is('будівництво') || is('покращення') || is('стройка')) return { rowId: 'capex', childName: 'ЗП (капітальні зарплати)' };
       if (is('адміністратор') || is('прибиральниця') || is('завхоз') || is('ремонт') || is('админ')) return { rowId: 'variable', childName: 'ЗП (Інша)' };
    }
    
    if (is('управл')) return { rowId: 'mgmt', childName: cnameLower };
    if (is('professional') || is('консалтинг') || is('аудит') || is('юрист')) return { rowId: 'prof', childName: cnameLower };
    if (classifier === 'capex') return { rowId: 'capex', childName: 'Інше капітальне' };
    if (classifier === 'variable' || stdGroup === 'COGS') return { rowId: 'variable', childName: 'Інші змінні' };
    
    // Default to Fixed -> "Прочие" 
    return { rowId: 'fixed', childName: 'Прочие' };
}

export async function getPnl2(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    const originalBus = db.prepare(`
      SELECT id, name FROM business_units
      WHERE is_active = 1 AND is_shared = 0 AND name != 'На перегляд' AND organization_id = ?
      ORDER BY sort_order
    `).all(org) as any[];

    const virtualBusMap: Record<string, string> = {};
    const virtualBus: Record<string, any> = {};
    
    for (const bu of originalBus) {
      let vName = bu.name;
      let vId = bu.id;
      
      const lowerName = vName.toLowerCase();

      // General BU that we distribute proportionally
      if (lowerName.includes('загальне') || lowerName.includes('kemp carlsbad')) {
        virtualBusMap[bu.id] = 'v_general';
        continue; // Exclude from columns
      }
      
      if (lowerName.includes('будова') || lowerName.includes('f/d') || lowerName === 'resort f' || lowerName === 'rfesort b') {
        vName = 'Будова F/D';
        vId = 'v_budova';
      } else if (lowerName.includes('сауна') || lowerName.includes('купель') || lowerName.includes('спа')) {
        vName = 'СПА';
        vId = 'v_spa';
      }
      
      virtualBusMap[bu.id] = vId;
      if (!virtualBus[vId]) {
        virtualBus[vId] = { id: vId, name: vName };
      }
    }
    const bus = Object.values(virtualBus);

    // Fetch operations
    const ops = db.prepare(`
      SELECT o.amount_company, o.op_type, o.payment_subtype, o.project_id, o.comment,
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
    const createRow = (key: string, name: string, type: 'data' | 'calc' | 'calc_pct', childrenOrder: string[] = []) => {
      const buValues: Record<string, number> = {};
      bus.forEach(bu => buValues[bu.id] = 0);
      const details: Record<string, Record<string, number>> = {};
      childrenOrder.forEach(c => {
         details[c] = {};
         bus.forEach(bu => details[c][bu.id] = 0);
      });
      return { key, name, type, buValues, total: 0, isSubrow: false, details, childrenOrder };
    };

    const r_rev = createRow('revenue', 'Общая выручка', 'data');
    const r_var = createRow('variable', 'Переменные расходы', 'data', [
      'Алкоголь (Собівартість), Продукти (Собівартість)',
      'Оплата прачки',
      'ЗП Админ',
      'ЗП Уборка',
      'ЗП Завхоз',
      'Трафик',
      'Маркетолог',
      'Платформы бронирования',
      'Прочие расходы на рекламу/фото/бренд',
      'ЗП (Інша)',
      'Інші змінні'
    ]);
    const r_fixed = createRow('fixed', 'Постоянные расходы', 'data', [
      'Аренда',
      'Электрика',
      'Вода',
      'Мусор',
      'Страховка',
      'Банковские услуги',
      'Приложения и сервисы',
      'Прочие'
    ]);
    const r_mgmt = createRow('mgmt', 'Управляющая компания(финансист и др)', 'data');
    const r_prof = createRow('prof', 'Professional services (Consulting, audit, Lawyer, Photographer)', 'data');
    const r_taxes = createRow('taxes', 'Налоги', 'data');
    const r_invest = createRow('invest', 'Инвест доход', 'data');
    const r_capex = createRow('capex', 'Капитальные затраты', 'data', [
      'Материалы на строительство и ремонты',
      'Инфраструктура и покупки товаров',
      'Инструмент',
      'ЗП (капітальні зарплати)',
      'Інше капітальне'
    ]);

    const rowMap: Record<string, any> = {
      'variable': r_var,
      'fixed': r_fixed,
      'mgmt': r_mgmt,
      'prof': r_prof,
      'taxes': r_taxes,
      'capex': r_capex
    };

    // Pass 1: Calculate revenue ratios per Virtual BU
    let totalValidRevenue = 0;
    const revenuePerBu: Record<string, number> = {};
    bus.forEach(b => revenuePerBu[b.id] = 0);

    for (const op of ops) {
      const vId = (op.project_id && virtualBusMap[op.project_id]) ? virtualBusMap[op.project_id] : 'v_general';
      
      const amt = op.amount_company;
      const cname = (op.cat_name || 'Інше').trim().toLowerCase();
      
      const isDividend = cname.includes('дивіденд') || cname.includes('дивиденд') || cname.includes('dividend');
      if (isDividend) continue;
      
      const isInvest = cname.includes('інвест') || cname.includes('invest') || cname.includes('дофінансування');

      if (op.op_type === 'income' && !isInvest) {
         if (vId !== 'v_general') {
            revenuePerBu[vId] += amt;
            totalValidRevenue += amt;
         }
      }
      else if (op.op_type === 'expense' && op.payment_subtype === 'refund') {
         if (vId !== 'v_general') {
            revenuePerBu[vId] -= amt;
            totalValidRevenue -= amt;
         }
      }
    }
    
    const ratioPerBu: Record<string, number> = {};
    bus.forEach(b => {
      if (totalValidRevenue > 0) {
        ratioPerBu[b.id] = revenuePerBu[b.id] / totalValidRevenue;
      } else {
        ratioPerBu[b.id] = 1 / bus.length; // distribute equally if no revenue
      }
    });

    // Pass 2: Distribute operations
    for (const op of ops) {
      const vId = (op.project_id && virtualBusMap[op.project_id]) ? virtualBusMap[op.project_id] : 'v_general';
      
      const amt = op.amount_company;
      const cname = (op.cat_name || 'Інше').trim();
      const cnameLower = cname.toLowerCase();
      
      const isDividend = cnameLower.includes('дивіденд') || cnameLower.includes('дивиденд') || cnameLower.includes('dividend');
      if (isDividend) continue;
      
      const commentLower = (op.comment || '').toLowerCase();
      const isGeneral = vId === 'v_general';

      // Income
      if (op.op_type === 'income') {
        const isInvest = cnameLower.includes('інвест') || cnameLower.includes('invest') || cnameLower.includes('дофінансування');
        const targetRow = isInvest ? r_invest : r_rev;
        
        if (isGeneral) {
           bus.forEach(b => {
              const pAmt = amt * ratioPerBu[b.id];
              targetRow.buValues[b.id] += pAmt;
              targetRow.total += pAmt;
           });
        } else {
           if (targetRow.buValues[vId] !== undefined) {
             targetRow.buValues[vId] += amt;
             targetRow.total += amt;
           }
        }
      } 
      // Refunds
      else if (op.op_type === 'expense' && op.payment_subtype === 'refund') {
        if (isGeneral) {
           bus.forEach(b => {
              const pAmt = amt * ratioPerBu[b.id];
              r_rev.buValues[b.id] -= pAmt;
              r_rev.total -= pAmt;
           });
        } else {
           if (r_rev.buValues[vId] !== undefined) {
             r_rev.buValues[vId] -= amt;
             r_rev.total -= amt;
           }
        }
      }
      // Expenses
      else if (op.op_type === 'expense') {
        const mapped = mapExpense(cnameLower, commentLower, op.classifier, op.std_group);
        const targetRow = rowMap[mapped.rowId];
        
        if (!targetRow) continue; // safety check
        
        const childName = mapped.childName;
        
        if (isGeneral) {
           bus.forEach(b => {
              const pAmt = amt * ratioPerBu[b.id];
              targetRow.buValues[b.id] += pAmt;
              targetRow.total += pAmt;
              targetRow.details[childName] = targetRow.details[childName] || {};
              targetRow.details[childName][b.id] = (targetRow.details[childName][b.id] || 0) + pAmt;
           });
        } else {
           if (targetRow.buValues[vId] !== undefined) {
              targetRow.buValues[vId] += amt;
              targetRow.total += amt;
              targetRow.details[childName] = targetRow.details[childName] || {};
              targetRow.details[childName][vId] = (targetRow.details[childName][vId] || 0) + amt;
           }
        }
      }
    }

    const rows = [];
    
    rows.push(r_rev);

    const r_var_calc = createRow('calc_var', 'Переменные расходы', 'data');
    r_var_calc.buValues = r_var.buValues;
    r_var_calc.total = r_var.total;
    r_var_calc.details = r_var.details;
    r_var_calc.childrenOrder = r_var.childrenOrder;
    rows.push(r_var_calc);

    const r_royalty = createRow('royalty', 'Роялти=30%', 'calc');
    for (const bu of bus) {
      if (bu.name.toLowerCase().includes('glamping') || bu.name.toLowerCase().includes('глемпінг')) {
        r_royalty.buValues[bu.id] = Math.round(r_rev.buValues[bu.id] * 0.3);
      } else {
        r_royalty.buValues[bu.id] = 0;
      }
      r_royalty.total += r_royalty.buValues[bu.id];
    }
    // Only push if there's actual royalty to show
    if (r_royalty.total > 0) {
        rows.push(r_royalty);
    }

    rows.push(r_fixed);

    const r_store_ebitda = createRow('store_ebitda', 'Store-level EBITDA', 'calc');
    for (const bu of bus) {
      r_store_ebitda.buValues[bu.id] = r_rev.buValues[bu.id] - r_var.buValues[bu.id] - r_royalty.buValues[bu.id] - r_fixed.buValues[bu.id];
      r_store_ebitda.total += r_store_ebitda.buValues[bu.id];
    }
    rows.push(r_store_ebitda);

    rows.push(r_mgmt);
    rows.push(r_prof);
    rows.push(r_taxes);
    rows.push(r_invest);
    rows.push(r_capex);

    const finalRows = rows.map(r => {
      const childrenArr: any[] = [];
      const usedKeys = new Set<string>();
      
      for (const catName of r.childrenOrder || []) {
        const buMap = r.details[catName] || {};
        let childTotal = 0;
        const cBuValues: Record<string, number> = {};
        bus.forEach(bu => {
          const v = (buMap as any)[bu.id] || 0;
          cBuValues[bu.id] = v;
          childTotal += v;
        });
        childrenArr.push({ key: r.key + '_' + catName, name: catName, type: 'data', buValues: cBuValues, total: childTotal, isSubrow: true });
        usedKeys.add(catName);
      }

      const extraItems = Object.entries(r.details || {})
        .filter(([catName]) => !usedKeys.has(catName))
        .map(([catName, buMap]) => {
          let childTotal = 0;
          const cBuValues: Record<string, number> = {};
          bus.forEach(bu => {
            const v = (buMap as any)[bu.id] || 0;
            cBuValues[bu.id] = v;
            childTotal += v;
          });
          return { key: r.key + '_' + catName, name: catName, type: 'data', buValues: cBuValues, total: childTotal, isSubrow: true };
        }).sort((a, b) => b.total - a.total);
        
      const children = [...childrenArr, ...extraItems];

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

