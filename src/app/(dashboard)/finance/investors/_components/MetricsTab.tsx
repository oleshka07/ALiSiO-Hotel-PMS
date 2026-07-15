'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Edit, Zap, RefreshCw } from 'lucide-react';

interface Metric {
  id: string;
  project_id: string;
  project_name: string;
  year_month: string;
  occupancy_pct: number | null;
  revenue: number | null;
  notes: string | null;
}

interface AutoRevenue {
  project_id: string;
  unit_id: string | null;
  unit_name: string | null;
  year_month: string;
  totals_by_currency: Record<string, number>;
  reservations: number;
  by_source: { source: string; currency: string; total: number; reservations: number }[];
  occupancy_pct: number | null;
  sold_nights: number;
  available_nights: number;
}

interface Project { id: string; name: string; is_active?: number }

function fmtCurrencies(by: Record<string, number>): string {
  const entries = Object.entries(by).filter(([, v]) => v > 0);
  if (entries.length === 0) return '0';
  return entries.map(([cur, v]) => `${v.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`).join(' + ');
}

const SOURCE_LABEL: Record<string, string> = {
  direct: 'Direct',
  airbnb: 'Airbnb',
  booking_com: 'Booking.com',
  vrbo: 'VRBO',
};

export default function MetricsTab() {
  const [items, setItems] = useState<Metric[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [autoForMonth, setAutoForMonth] = useState<Map<string, AutoRevenue>>(new Map());
  const [autoMonth, setAutoMonth] = useState<string>(() => new Date().toISOString().substring(0, 7));
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Metric> | null>(null);
  const [editingAuto, setEditingAuto] = useState<AutoRevenue | null>(null);
  const [filter, setFilter] = useState<string>('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('project_id', filter);
      const [mRes, pRes, aRes] = await Promise.all([
        fetch(`/api/finance/investor-monthly-metrics?${params}`),
        // investor-properties returns ONLY BUs that have an active
        // investor_investment — i.e. the 6 houses (A1..B6), not the 5-6
        // finance buckets. Exactly what the dropdown should show.
        fetch('/api/finance/investor-properties'),
        fetch(`/api/finance/investor-auto-revenue?year_month=${autoMonth}`),
      ]);
      const [mJ, pJ, aJ] = await Promise.all([mRes.json(), pRes.json(), aRes.json()]);
      setItems(mJ.items || []);
      setProjects(((pJ.items || []) as Array<{ project_id: string; name: string }>).map((p) => ({ id: p.project_id, name: p.name })));
      const map = new Map<string, AutoRevenue>();
      for (const a of (aJ.items || []) as AutoRevenue[]) map.set(a.project_id, a);
      setAutoForMonth(map);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filter, autoMonth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function loadAutoFor(projectId: string, yearMonth: string): Promise<AutoRevenue | null> {
    try {
      const res = await fetch(`/api/finance/investor-auto-revenue?year_month=${yearMonth}&project_id=${projectId}`);
      const j = await res.json();
      return (j.items || [])[0] || null;
    } catch { return null; }
  }

  async function applyAuto(projectId: string) {
    const auto = autoForMonth.get(projectId);
    if (!auto) return;
    if (!auto.unit_id) {
      alert(`Не знайдено glamping-юніт з назвою business_unit. Перейменуйте business_unit щоб збігався з units.name (A1, B2 тощо), або зматчіть вручну на сторінці audit.`);
      return;
    }
    // Pick the dominant currency (largest sum). User can override via manual.
    const currencies = Object.entries(auto.totals_by_currency).sort(([, a], [, b]) => b - a);
    if (currencies.length === 0) { alert('Жодного бронювання за цей місяць.'); return; }
    const [topCurrency, topAmount] = currencies[0];
    const fmtSum = fmtCurrencies(auto.totals_by_currency);
    const occLine = auto.occupancy_pct != null ? ` · occupancy ${auto.occupancy_pct}%` : '';
    if (!confirm(`Записати ${fmtSum}${occLine} за ${autoMonth} як метрику?\n(зберігаємо ${topAmount.toFixed(2)} ${topCurrency} — основна валюта; бартер / нульові не враховані в occupancy)`)) return;
    const res = await fetch('/api/finance/investor-monthly-metrics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId, year_month: autoMonth,
        occupancy_pct: auto.occupancy_pct, revenue: topAmount,
        notes: `Авто з ${auto.reservations} бронювань (${auto.unit_name}) — ${fmtSum}${occLine} · ${new Date().toISOString().substring(0,10)}`,
      }),
    });
    if (!res.ok) { const j = await res.json(); alert(`Помилка: ${j.error}`); return; }
    fetchAll();
  }

  async function save() {
    if (!editing?.project_id || !editing?.year_month) {
      alert('project_id і year_month обовʼязкові');
      return;
    }
    try {
      const res = await fetch('/api/finance/investor-monthly-metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      setEditing(null);
      fetchAll();
    } catch (e: any) { alert(`Помилка: ${e.message}`); }
  }

  async function remove(id: string) {
    if (!confirm('Видалити запис?')) return;
    await fetch(`/api/finance/investor-monthly-metrics/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  async function autoFillFromOperations() {
    if (!confirm(`Заповнити метрики за ${autoMonth} фактичними грошима з операцій?\nРучні записи НЕ перезаписуються.`)) return;
    try {
      const res = await fetch('/api/finance/investor-monthly-metrics/autofill', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year_month: autoMonth }),
      });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      alert(`Заповнено: ${j.filled}, пропущено (ручні): ${j.skipped}`);
      fetchAll();
    } catch (e: any) { alert(`Помилка: ${e.message}`); }
  }

  // Auto-revenue cards (one per project) for the chosen month
  const autoCards = [...autoForMonth.values()];

  return (
    <div>
      {/* Auto-revenue from real bookings — top section */}
      <div style={{ marginBottom: 20, padding: 14, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <Zap size={16} color="#16a34a" />
          <h4 style={{ margin: 0, fontSize: 14, color: '#16a34a' }}>Auto-revenue з бронювань</h4>
          <input type="month" style={{ ...input, maxWidth: 150 }} value={autoMonth} onChange={(e) => setAutoMonth(e.target.value)} />
          <button onClick={fetchAll} style={btn} title="Перерахувати"><RefreshCw size={12} /></button>
          <button onClick={autoFillFromOperations} style={{ ...btn, background: 'rgba(34,197,94,0.12)', color: '#16a34a', fontWeight: 600 }} title="Заповнити метрики місяця фактичними грошима з fin_operations (ручні записи не перезаписуються)">
            Заповнити з операцій
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
            Сума = з reservations.total_rate_eur (для Hostex) або reservations.total_price (для прямих). Бронювання з нульовою сумою не рахуються.
          </span>
        </div>
        {autoCards.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Жоден проєкт не має активних інвестицій або не зматчений з реальним юнітом.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {autoCards.map((a) => {
              const project = projects.find((p) => p.id === a.project_id);
              const matched = items.find((m) => m.project_id === a.project_id && m.year_month === autoMonth);
              return (
                <div key={a.project_id} style={{ padding: 10, border: '1px solid var(--border-primary)', borderRadius: 8, background: 'var(--bg-primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{project?.name || a.project_id}</div>
                    {!a.unit_id && <span style={{ fontSize: 10, color: '#f59e0b' }}>⚠ юніт не зматчено</span>}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
                    {fmtCurrencies(a.totals_by_currency)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {a.reservations} бронювань
                    {a.unit_name && <> · юніт: {a.unit_name}</>}
                    {a.occupancy_pct != null && <> · <b>{a.occupancy_pct}%</b> occupancy ({a.sold_nights.toFixed(0)}/{a.available_nights})</>}
                  </div>
                  {a.by_source.length > 0 && (
                    <details style={{ marginTop: 4 }} open>
                      <summary style={{ fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>За джерелами</summary>
                      <div style={{ fontSize: 11, marginTop: 4 }}>
                        {a.by_source.map((s, i) => (
                          <div key={`${s.source}-${s.currency}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                            <span>{SOURCE_LABEL[s.source] || s.source}</span>
                            <span>{s.total.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {s.currency} ({s.reservations})</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={() => applyAuto(a.project_id)} disabled={!a.unit_id || Object.keys(a.totals_by_currency).length === 0}
                            style={{ ...btn, fontSize: 11, padding: '4px 8px', background: '#16a34a', color: '#fff', border: 'none', opacity: (a.unit_id && Object.keys(a.totals_by_currency).length > 0) ? 1 : 0.5 }}>
                      <Zap size={11} /> {matched ? 'Перезаписати' : 'Застосувати'}
                    </button>
                    {matched && (
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', alignSelf: 'center' }}>
                        вручну: {(matched.revenue ?? 0).toLocaleString('cs-CZ', { minimumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual metrics list */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select style={input} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Всі проєкти</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => setEditing({ year_month: new Date().toISOString().substring(0,7), project_id: filter || undefined })}
                style={{ marginLeft: 'auto', ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>
          <Plus size={14} /> Додати місяць (вручну)
        </button>
      </div>

      {loading ? <div>Завантаження…</div> : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Метрик ще немає. Натисни «Застосувати» на картці зверху щоб взяти auto з бронювань.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={th}>Місяць</th>
                <th style={th}>Проєкт</th>
                <th style={{ ...th, textAlign: 'right' }}>Occupancy %</th>
                <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
                <th style={th}>Нотатки</th>
                <th style={th}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                  <td style={td}><b>{m.year_month}</b></td>
                  <td style={td}>{m.project_name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{m.occupancy_pct != null ? `${m.occupancy_pct}%` : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{m.revenue != null ? m.revenue.toLocaleString('cs-CZ', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td style={td}>{m.notes || '—'}</td>
                  <td style={td}>
                    <button onClick={() => setEditing(m)} style={iconBtn} title="Редагувати"><Edit size={14} /></button>
                    <button onClick={() => remove(m.id)} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div style={overlayStyle} onClick={() => setEditing(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>Місячна метрика</h3>
            <Field label="Проєкт *">
              <select style={input} value={editing.project_id || ''} onChange={(e) => setEditing({ ...editing, project_id: e.target.value })}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Місяць (YYYY-MM) *"><input type="month" style={input} value={editing.year_month || ''} onChange={(e) => setEditing({ ...editing, year_month: e.target.value })} /></Field>
            <Field label="Occupancy % (0-100)"><input type="number" step="0.1" min="0" max="100" style={input} value={editing.occupancy_pct ?? ''} onChange={(e) => setEditing({ ...editing, occupancy_pct: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
            <Field label="Revenue (місячна виручка)"><input type="number" step="0.01" style={input} value={editing.revenue ?? ''} onChange={(e) => setEditing({ ...editing, revenue: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
            <Field label="Нотатки"><textarea style={{ ...input, minHeight: 60 }} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })} /></Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={btn}>Відміна</button>
              <button onClick={save} style={{ ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>Зберегти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>{children}</div>;
}

const input: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 13, fontWeight: 500, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: 5, cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: 6 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' };
const td: React.CSSProperties = { padding: '8px 12px' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modalStyle: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 420, maxWidth: 520 };
