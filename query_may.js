const db = require('better-sqlite3')('data/alisio.db', {readonly: true});

function mapExpense(cnameLower, commentLower, classifier, stdGroup) {
    const is = (searchStr) => cnameLower.includes(searchStr) || commentLower.includes(searchStr);
    
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

const ops = db.prepare(`
  SELECT o.id, o.amount_company, o.paid_at, o.accrued_at, o.category_id, o.project_id, o.comment, o.status,
         ec.name as cat_name, bu.name as bu_name, COALESCE(ec.classifier, 'other') as classifier, ec.std_group
  FROM fin_operations o
  LEFT JOIN expense_categories ec ON o.category_id = ec.id
  LEFT JOIN business_units bu ON o.project_id = bu.id
  WHERE strftime('%Y-%m', o.paid_at) = '2026-05'
    AND o.status = 'completed'
    AND o.op_type = 'expense'
`).all();

let totalProchie = 0;
let results = [];
for (const op of ops) {
  const cname = (op.cat_name || 'Інше').trim();
  const cnameLower = cname.toLowerCase();
  const commentLower = (op.comment || '').toLowerCase();
  
  const mapped = mapExpense(cnameLower, commentLower, op.classifier, op.std_group);
  if (mapped.rowId === 'fixed' && mapped.childName === 'Прочие') {
    totalProchie += op.amount_company;
    results.push({
      Date: op.paid_at.substring(0, 10),
      Amount: op.amount_company,
      Category: op.cat_name,
      Comment: (op.comment || '').replace(/\n/g, ' ').substring(0, 50),
      Project: op.bu_name
    });
  }
}

console.log("Total Прочие:", totalProchie);
console.table(results);
