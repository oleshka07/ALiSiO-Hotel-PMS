const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/(dashboard)/sites/[siteId]/_components/RatePlansTab.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Update state initialization
content = content.replace(
  /derived_from_plan_id: plan\?\.derived_from_plan_id \?\? '',/,
  "derived_from_plan_id: plan?.derived_from_plan_id ?? '',\n    valid_weekdays: plan?.valid_weekdays || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],"
);
content = content.replace(
  /derived_from_plan_id: plan\.derived_from_plan_id \?\? '',/,
  "derived_from_plan_id: plan.derived_from_plan_id ?? '',\n        valid_weekdays: plan.valid_weekdays || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],"
);
content = content.replace(
  /same_day_cutoff_hour: null as number \| null,/,
  "same_day_cutoff_hour: null as number | null,\n        valid_weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],"
);

// 2. Change min_stay / max_stay layout
const oldStayHtml = `<div className="form-row" style={{ maxWidth: 400 }}>
          <div className="form-group">
            <label className="form-label">Від (дні)</label>
            <input className="form-input" type="number" min={1} value={form.min_stay} onChange={e => setForm(f => ({ ...f, min_stay: +e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">До (дні)</label>
            <input className="form-input" type="number" min={1} value={form.max_stay} onChange={e => setForm(f => ({ ...f, max_stay: +e.target.value }))} />
          </div>
        </div>`;

const newStayHtml = `<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14 }}>Тривалість перебування має бути між</span>
          <input className="form-input" style={{ width: 80, padding: '6px 10px' }} type="number" min={1} value={form.min_stay} onChange={e => setForm(f => ({ ...f, min_stay: +e.target.value }))} />
          <span style={{ fontSize: 14 }}>і</span>
          <input className="form-input" style={{ width: 80, padding: '6px 10px' }} type="number" min={1} value={form.max_stay} onChange={e => setForm(f => ({ ...f, max_stay: +e.target.value }))} />
          <span style={{ fontSize: 14 }}>днів</span>
        </div>`;

content = content.replace(oldStayHtml, newStayHtml);

// 3. Add Valid Weekdays section
const daysSectionHtml = `
      {/* Valid Weekdays */}
      <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 24 }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Діє лише в ці дні тижня</h4>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, display: 'block' }}>Якщо юзер обере інші дні, цей тариф не буде застосовано.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'mon', label: 'Пн' }, { id: 'tue', label: 'Вт' }, { id: 'wed', label: 'Ср' },
            { id: 'thu', label: 'Чт' }, { id: 'fri', label: 'Пт' }, { id: 'sat', label: 'Сб' }, { id: 'sun', label: 'Нд' }
          ].map(day => (
            <button
              key={day.id}
              onClick={() => {
                const isValid = form.valid_weekdays.includes(day.id);
                if (isValid) {
                  setForm(f => ({ ...f, valid_weekdays: f.valid_weekdays.filter(d => d !== day.id) }));
                } else {
                  setForm(f => ({ ...f, valid_weekdays: [...f.valid_weekdays, day.id] }));
                }
              }}
              style={{
                width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--border-primary)',
                background: form.valid_weekdays.includes(day.id) ? 'var(--accent-primary)' : 'transparent',
                color: form.valid_weekdays.includes(day.id) ? '#fff' : 'var(--text-primary)',
                fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              type="button"
            >
              {day.label}
            </button>
          ))}
          <button 
            type="button"
            className="btn btn-ghost" 
            style={{ marginLeft: 8, color: 'var(--text-secondary)' }}
            onClick={() => setForm(f => ({ ...f, valid_weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }))}
          >
            скинути
          </button>
        </div>
      </div>
`;

// Insert the days section before Pricing Mode
content = content.replace(
  /\{\/\* Pricing Mode \*\/\}/,
  `${daysSectionHtml}\n\n      {/* Pricing Mode */}`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Updated RatePlansTab.tsx for stay length and weekdays');
