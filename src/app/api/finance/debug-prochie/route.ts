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
    
    // Default to Fixed -> "Прочие" 
    return { rowId: 'fixed', childName: 'Прочие' };
}

export async function GET(request: NextRequest) {
  try {
    const db = await getDb();
    const org = orgId(db);
    
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get('month') || '2026-05';

    const ops = db.prepare(`
      SELECT o.amount_company, o.paid_at, o.comment, o.op_type, o.project_id,
             ec.name as cat_name, COALESCE(ec.classifier, 'other') as classifier, ec.std_group, bu.name as bu_name
      FROM fin_operations o
      LEFT JOIN expense_categories ec ON o.category_id = ec.id
      LEFT JOIN business_units bu ON o.project_id = bu.id
      WHERE o.status = 'completed' AND o.organization_id = ?
        AND strftime('%Y-%m', o.paid_at) = ?
        AND o.op_type = 'expense'
    `).all(org, month) as any[];

    let totalProchie = 0;
    const items: any[] = [];
    
    for (const op of ops) {
      const amt = op.amount_company;
      const cname = (op.cat_name || 'Інше').trim();
      const cnameLower = cname.toLowerCase();
      
      const isDividend = cnameLower.includes('дивіденд') || cnameLower.includes('дивиденд') || cnameLower.includes('dividend');
      if (isDividend) continue;
      
      const commentLower = (op.comment || '').toLowerCase();
      
      const mapped = mapExpense(cnameLower, commentLower, op.classifier, op.std_group);
      
      if (mapped.rowId === 'fixed' && mapped.childName === 'Прочие') {
        totalProchie += amt;
        items.push({
          date: op.paid_at,
          amount: amt,
          category: cname,
          project: op.bu_name || 'Не вказано (Загальне)',
          comment: op.comment || ''
        });
      }
    }
    
    // Sort by amount descending to see largest first
    items.sort((a, b) => b.amount - a.amount);
    
    // Group by category to help user see what went into Прочие
    const byCategory: Record<string, number> = {};
    items.forEach(i => {
      byCategory[i.category] = (byCategory[i.category] || 0) + i.amount;
    });

    // Format as HTML table
    let html = `
      <html>
      <head>
        <title>Деталізація "Прочие" за ${month}</title>
        <style>
          body { font-family: -apple-system, system-ui, sans-serif; padding: 20px; color: #333; }
          table { border-collapse: collapse; width: 100%; max-width: 1000px; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
          th { background-color: #f4f4f5; font-weight: 600; }
          .amount { text-align: right; font-variant-numeric: tabular-nums; }
          .summary { margin-top: 40px; }
        </style>
      </head>
      <body>
        <h1>Деталізація рядка "Прочие" (Постійні витрати)</h1>
        <p>Місяць: <strong>${month}</strong></p>
        <p>Загальна сума: <strong>${totalProchie.toLocaleString('cs-CZ')} CZK</strong></p>
        
        <h2>Транзакції:</h2>
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Категорія</th>
              <th>Сума (CZK)</th>
              <th>Проєкт</th>
              <th>Коментар</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td>${new Date(i.date).toLocaleDateString('cs-CZ')}</td>
                <td>${i.category}</td>
                <td class="amount">${i.amount.toLocaleString('cs-CZ')}</td>
                <td>${i.project}</td>
                <td>${i.comment}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="summary">
          <h2>Згруповано за категоріями (чому вони потрапили сюди?):</h2>
          <p>Ці категорії не підійшли під жодне з ключових слів інших рядків, тому автоматично потрапили сюди як "Інші/Прочие".</p>
          <table>
            <thead>
              <tr>
                <th>Категорія</th>
                <th>Сума (CZK)</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(byCategory)
                 .sort((a, b) => b[1] - a[1])
                 .map(([cat, amt]) => `
                <tr>
                  <td>${cat}</td>
                  <td class="amount">${amt.toLocaleString('cs-CZ')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
