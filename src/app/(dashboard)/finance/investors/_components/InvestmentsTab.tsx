'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Edit } from 'lucide-react';

interface Investment {
  id: string;
  investor_id: string;
  investor_name: string;
  project_id: string;
  project_name: string;
  amount: number;
  currency: string;
  equity_pct: number | null;
  invested_at: string;
  model_description: string | null;
  is_active: number;
}

interface Investor { id: string; name: string }
interface Project  { id: string; name: string }

function fmt(n: number, cur: string): string {
  return `${n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

export default function InvestmentsTab() {
  const [items, setItems] = useState<Investment[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Investment> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, invRes, pRes] = await Promise.all([
        fetch('/api/finance/investor-investments'),
        fetch('/api/finance/investors'),
        fetch('/api/finance/investor-projects'),
      ]);
      const [iJ, invJ, pJ] = await Promise.all([iRes.json(), invRes.json(), pRes.json()]);
      setItems(iJ.items || []);
      setInvestors((invJ.items || []).map((i: any) => ({ id: i.id, name: i.name })));
      setProjects(pJ.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function save() {
    if (!editing?.investor_id || !editing?.project_id || !editing?.amount || !editing?.invested_at) {
      alert('Інвестор, проєкт, сума, дата — обовʼязкові');
      return;
    }
    try {
      const url = editing.id ? `/api/finance/investor-investments/${editing.id}` : '/api/finance/investor-investments';
      const method = editing.id ? 'PUT' : 'POST';
      console.log('[Investments] save →', method, url, editing);
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      const j = await res.json().catch(() => ({}));
      console.log('[Investments] response', res.status, j);
      if (!res.ok) { alert(`Помилка ${res.status}: ${j.error || res.statusText}`); return; }
      setEditing(null);
      await fetchAll();
    } catch (e: any) {
      console.error('[Investments] save error', e);
      alert(`Помилка: ${e.message}`);
    }
  }

  async function remove(id: string) {
    if (!confirm('Видалити інвестицію?')) return;
    await fetch(`/api/finance/investor-investments/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => setEditing({ currency: 'EUR', invested_at: new Date().toISOString().substring(0,10), is_active: 1 })}
                style={{ ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>
          <Plus size={14} /> Додати інвестицію
        </button>
      </div>

      {loading ? <div>Завантаження…</div> : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Інвестицій ще не вносили.
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
                <th style={{ ...th, textAlign: 'right' }}>Equity %</th>
                <th style={th}>Модель</th>
                <th style={th}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                  <td style={td}>{i.invested_at}</td>
                  <td style={td}><b>{i.investor_name}</b></td>
                  <td style={td}>{i.project_name}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(i.amount, i.currency)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{i.equity_pct != null ? `${i.equity_pct}%` : '—'}</td>
                  <td style={td}>{i.model_description || '—'}</td>
                  <td style={td}>
                    <button onClick={() => setEditing(i)} style={iconBtn} title="Редагувати"><Edit size={14} /></button>
                    <button onClick={() => remove(i.id)} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={14} /></button>
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
            <h3 style={{ margin: 0, marginBottom: 16 }}>{editing.id ? 'Редагувати' : 'Нова'} інвестиція</h3>
            <Field label="Інвестор *">
              <select style={input} value={editing.investor_id || ''} onChange={(e) => setEditing({ ...editing, investor_id: e.target.value })}>
                <option value="">—</option>
                {investors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
            <Field label="Проєкт *">
              <select style={input} value={editing.project_id || ''} onChange={(e) => setEditing({ ...editing, project_id: e.target.value })}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 2 }}><Field label="Сума *"><input type="number" step="0.01" style={input} value={editing.amount || ''} onChange={(e) => setEditing({ ...editing, amount: parseFloat(e.target.value) })} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Валюта"><select style={input} value={editing.currency || 'EUR'} onChange={(e) => setEditing({ ...editing, currency: e.target.value })}><option>EUR</option><option>CZK</option><option>USD</option></select></Field></div>
              <div style={{ flex: 1 }}><Field label="Equity %"><input type="number" step="0.01" style={input} value={editing.equity_pct ?? ''} onChange={(e) => setEditing({ ...editing, equity_pct: e.target.value ? parseFloat(e.target.value) : null })} /></Field></div>
            </div>
            <Field label="Дата інвестиції *"><input type="date" style={input} value={editing.invested_at || ''} onChange={(e) => setEditing({ ...editing, invested_at: e.target.value })} /></Field>
            <Field label="Опис моделі (опц.)"><textarea style={{ ...input, minHeight: 60 }} value={editing.model_description || ''} onChange={(e) => setEditing({ ...editing, model_description: e.target.value || null })} /></Field>
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
const modalStyle: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 480, maxWidth: 560 };
