'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Calendar } from 'lucide-react';

interface Payout {
  id: string;
  investor_id: string;
  investor_name: string;
  project_id: string | null;
  project_name: string | null;
  amount: number;
  currency: string;
  paid_at: string;
  period_year_month: string | null;
  comment: string | null;
  fin_operation_id: string | null;
}

interface Investor { id: string; name: string }
interface Project  { id: string; name: string }

interface PreviewRow {
  project_id: string;
  project_name: string;
  equity_pct: number | null;
  currency: string;
  revenue: number | null;
  accrued: number | null;
  already_paid: number;
  remainder: number | null;
}

interface MonthlyDraft {
  investor_id: string;
  year_month: string;
  paid_at: string;
  currency: string;
  rows: Array<PreviewRow & { selected: boolean; amount: string }>;
  loading: boolean;
  submitting: boolean;
}

function fmt(n: number, cur: string): string {
  return `${n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

export default function PayoutsTab() {
  const [items, setItems] = useState<Payout[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Payout> | null>(null);
  const [monthly, setMonthly] = useState<MonthlyDraft | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, iRes, prRes] = await Promise.all([
        fetch('/api/finance/investor-payouts'),
        fetch('/api/finance/investors'),
        fetch('/api/finance/investor-projects'),
      ]);
      const [pJ, iJ, prJ] = await Promise.all([pRes.json(), iRes.json(), prRes.json()]);
      setItems(pJ.items || []);
      setInvestors((iJ.items || []).map((i: any) => ({ id: i.id, name: i.name })));
      setProjects(prJ.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function save() {
    if (!editing?.investor_id || !editing?.amount || !editing?.paid_at) {
      alert('investor_id, amount, paid_at обовʼязкові');
      return;
    }
    try {
      const res = await fetch('/api/finance/investor-payouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      setEditing(null);
      fetchAll();
    } catch (e: any) { alert(`Помилка: ${e.message}`); }
  }

  async function remove(id: string) {
    if (!confirm('Видалити виплату? Звʼязана fin_operation теж видалиться.')) return;
    await fetch(`/api/finance/investor-payouts/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  function openMonthly() {
    setMonthly({
      investor_id: '',
      year_month: new Date().toISOString().substring(0, 7),
      paid_at: new Date().toISOString().substring(0, 10),
      currency: 'EUR',
      rows: [],
      loading: false,
      submitting: false,
    });
  }

  async function loadPreview(investorId: string, yearMonth: string) {
    if (!investorId || !yearMonth) { setMonthly((m) => m && { ...m, rows: [] }); return; }
    setMonthly((m) => m && { ...m, loading: true });
    try {
      const res = await fetch(`/api/finance/investor-payouts/preview?investor_id=${investorId}&year_month=${yearMonth}`);
      const j = await res.json();
      const rows: PreviewRow[] = j.items || [];
      setMonthly((m) => m && {
        ...m,
        loading: false,
        rows: rows.map((r) => ({
          ...r,
          selected: (r.remainder ?? 0) > 0,
          amount: r.remainder != null ? Math.max(0, r.remainder).toFixed(2) : '0.00',
        })),
      });
    } catch (e: any) {
      alert(`Помилка превью: ${e.message}`);
      setMonthly((m) => m && { ...m, loading: false });
    }
  }

  async function submitMonthly() {
    if (!monthly) return;
    const selected = monthly.rows.filter((r) => r.selected && +r.amount > 0);
    if (selected.length === 0) { alert('Жодного рядка для виплати'); return; }
    const total = selected.reduce((s, r) => s + +r.amount, 0);
    if (!confirm(`Створити ${selected.length} ${selected.length === 1 ? 'виплату' : 'виплат(и)'} на ${total.toFixed(2)} ${monthly.currency}?`)) return;
    setMonthly((m) => m && { ...m, submitting: true });
    try {
      const res = await fetch('/api/finance/investor-payouts/bulk-monthly', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investor_id: monthly.investor_id,
          year_month: monthly.year_month,
          paid_at: monthly.paid_at,
          currency: monthly.currency,
          items: selected.map((r) => ({ project_id: r.project_id, amount: +r.amount })),
        }),
      });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); setMonthly((m) => m && { ...m, submitting: false }); return; }
      alert(`✓ Створено ${j.created_count} виплат на ${j.total_amount} ${j.currency}`);
      setMonthly(null);
      fetchAll();
    } catch (e: any) {
      alert(`Помилка: ${e.message}`);
      setMonthly((m) => m && { ...m, submitting: false });
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        <button onClick={openMonthly}
                style={{ ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>
          <Calendar size={14} /> Виплатити за місяць
        </button>
        <button onClick={() => setEditing({ currency: 'EUR', paid_at: new Date().toISOString().substring(0,10) })}
                style={{ ...btn, background: '#16a34a', color: '#fff', border: 'none' }}>
          <Plus size={14} /> Виплатити дивіденд
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        💡 При створенні виплати автоматично створюється <code>fin_operation</code> (op_type=expense, source=&apos;dividend&apos;) — гроші відображаються у фінансових звітах як cash outflow.
      </p>

      {loading ? <div>Завантаження…</div> : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Виплат ще не було.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={th}>Дата</th>
                <th style={th}>Інвестор</th>
                <th style={th}>Проєкт</th>
                <th style={{ ...th, textAlign: 'right' }}>Сума</th>
                <th style={th}>Період</th>
                <th style={th}>Коментар</th>
                <th style={th}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                  <td style={td}>{p.paid_at}</td>
                  <td style={td}><b>{p.investor_name}</b></td>
                  <td style={td}>{p.project_name || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmt(p.amount, p.currency)}</td>
                  <td style={td}>{p.period_year_month || '—'}</td>
                  <td style={td}>{p.comment || '—'}</td>
                  <td style={td}><button onClick={() => remove(p.id)} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {monthly && (() => {
        const draft = monthly;
        const selectedRows = draft.rows.filter((r) => r.selected);
        const totalSel = selectedRows.reduce((s, r) => s + (+r.amount || 0), 0);
        return (
          <div style={overlayStyle} onClick={() => !draft.submitting && setMonthly(null)}>
            <div style={{ ...modalStyle, minWidth: 720, maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={18} /> Виплата за місяць
              </h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 2 }}>
                  <Field label="Інвестор *">
                    <select style={input} value={draft.investor_id}
                            onChange={(e) => { const v = e.target.value; setMonthly({ ...draft, investor_id: v }); loadPreview(v, draft.year_month); }}>
                      <option value="">—</option>
                      {investors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Місяць *">
                    <input type="month" style={input} value={draft.year_month}
                           onChange={(e) => { const v = e.target.value; setMonthly({ ...draft, year_month: v }); if (draft.investor_id) loadPreview(draft.investor_id, v); }} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Дата виплати *">
                    <input type="date" style={input} value={draft.paid_at}
                           onChange={(e) => setMonthly({ ...draft, paid_at: e.target.value })} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Валюта">
                    <select style={input} value={draft.currency}
                            onChange={(e) => setMonthly({ ...draft, currency: e.target.value })}>
                      <option>EUR</option><option>CZK</option><option>USD</option>
                    </select>
                  </Field>
                </div>
              </div>

              {!draft.investor_id ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
                  Виберіть інвестора і місяць — система покаже нараховане по кожному будинку.
                </div>
              ) : draft.loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження…</div>
              ) : draft.rows.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
                  У цього інвестора немає активних інвестицій.
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-primary)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        <th style={{ ...th, width: 32 }}>
                          <input type="checkbox"
                                 checked={draft.rows.every((r) => r.selected)}
                                 onChange={(e) => setMonthly({ ...draft, rows: draft.rows.map((r) => ({ ...r, selected: e.target.checked })) })} />
                        </th>
                        <th style={th}>Будинок</th>
                        <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
                        <th style={{ ...th, textAlign: 'right' }}>Equity</th>
                        <th style={{ ...th, textAlign: 'right' }}>Нараховано</th>
                        <th style={{ ...th, textAlign: 'right' }}>Вже&nbsp;виплачено</th>
                        <th style={{ ...th, textAlign: 'right', width: 120 }}>До&nbsp;виплати</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.rows.map((r, idx) => {
                        const dim = r.revenue == null;
                        return (
                          <tr key={r.project_id} style={{ borderTop: '1px solid var(--border-primary)', opacity: dim ? 0.55 : 1 }}>
                            <td style={{ ...td, textAlign: 'center' }}>
                              <input type="checkbox" disabled={dim} checked={r.selected}
                                     onChange={(e) => { const rows = [...draft.rows]; rows[idx] = { ...r, selected: e.target.checked }; setMonthly({ ...draft, rows }); }} />
                            </td>
                            <td style={td}><b>{r.project_name}</b>{dim && <span style={{ marginLeft: 6, fontSize: 10, color: '#f59e0b' }}>немає метрики</span>}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{r.revenue != null ? r.revenue.toLocaleString('cs-CZ', { maximumFractionDigits: 0 }) : '—'}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{r.equity_pct != null ? `${r.equity_pct}%` : '—'}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{r.accrued != null ? r.accrued.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                            <td style={{ ...td, textAlign: 'right', color: r.already_paid > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
                              {r.already_paid > 0 ? r.already_paid.toLocaleString('cs-CZ', { minimumFractionDigits: 2 }) : '—'}
                            </td>
                            <td style={{ ...td, textAlign: 'right' }}>
                              <input type="number" step="0.01" disabled={dim || !r.selected}
                                     value={r.amount}
                                     onChange={(e) => { const rows = [...draft.rows]; rows[idx] = { ...r, amount: e.target.value }; setMonthly({ ...draft, rows }); }}
                                     style={{ ...input, textAlign: 'right', width: 110, padding: '4px 6px' }} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Вибрано: <b>{selectedRows.length}</b> · Сума: <b style={{ color: '#16a34a' }}>{totalSel.toFixed(2)} {draft.currency}</b>
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={() => setMonthly(null)} disabled={draft.submitting} style={btn}>Відміна</button>
                <button onClick={submitMonthly} disabled={draft.submitting || selectedRows.length === 0}
                        style={{ ...btn, background: '#16a34a', color: '#fff', border: 'none', opacity: (draft.submitting || selectedRows.length === 0) ? 0.5 : 1 }}>
                  {draft.submitting ? 'Зберігаю…' : `Виплатити (${selectedRows.length})`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {editing && (
        <div style={overlayStyle} onClick={() => setEditing(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>Виплата дивіденду</h3>
            <Field label="Інвестор *">
              <select style={input} value={editing.investor_id || ''} onChange={(e) => setEditing({ ...editing, investor_id: e.target.value })}>
                <option value="">—</option>
                {investors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
            <Field label="Проєкт (опц., для атрибуції)">
              <select style={input} value={editing.project_id || ''} onChange={(e) => setEditing({ ...editing, project_id: e.target.value || null })}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 2 }}><Field label="Сума *"><input type="number" step="0.01" style={input} value={editing.amount || ''} onChange={(e) => setEditing({ ...editing, amount: parseFloat(e.target.value) })} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Валюта"><select style={input} value={editing.currency || 'EUR'} onChange={(e) => setEditing({ ...editing, currency: e.target.value })}><option>EUR</option><option>CZK</option><option>USD</option></select></Field></div>
            </div>
            <Field label="Дата виплати *"><input type="date" style={input} value={editing.paid_at || ''} onChange={(e) => setEditing({ ...editing, paid_at: e.target.value })} /></Field>
            <Field label="Період (YYYY-MM)"><input type="month" style={input} value={editing.period_year_month || ''} onChange={(e) => setEditing({ ...editing, period_year_month: e.target.value || null })} /></Field>
            <Field label="Коментар"><input style={input} value={editing.comment || ''} onChange={(e) => setEditing({ ...editing, comment: e.target.value || null })} /></Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={btn}>Відміна</button>
              <button onClick={save} style={{ ...btn, background: '#16a34a', color: '#fff', border: 'none' }}>Виплатити</button>
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
const modalStyle: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 480, maxWidth: 560 };
