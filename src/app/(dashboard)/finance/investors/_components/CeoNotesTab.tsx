'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Edit, Trash2, MessageSquareText } from 'lucide-react';

interface Note {
  id: string;
  scope: 'portfolio' | 'asset';
  scope_id: string;
  month: string;
  ceo_name: string | null;
  body_md: string | null;
  investor_name: string | null;
  asset_name: string | null;
  updated_at: string;
}

interface ScopeOption { id: string; name: string }

export default function CeoNotesTab() {
  const [items, setItems] = useState<Note[]>([]);
  const [investors, setInvestors] = useState<ScopeOption[]>([]);
  const [assets, setAssets] = useState<ScopeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Note> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [nRes, iRes, aRes] = await Promise.all([
        fetch('/api/finance/investor-monthly-notes'),
        fetch('/api/finance/investors'),
        fetch('/api/finance/investor-properties'),
      ]);
      const [nJ, iJ, aJ] = await Promise.all([nRes.json(), iRes.json(), aRes.json()]);
      setItems(nJ.items || []);
      setInvestors((iJ.items || []).map((i: any) => ({ id: i.id, name: i.name })));
      setAssets((aJ.items || []).map((p: any) => ({ id: p.project_id, name: p.name })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openNew() {
    const now = new Date();
    setEditing({
      scope: 'portfolio',
      month: now.toISOString().substring(0, 7),
      ceo_name: 'Олег',
      body_md: '',
    });
  }

  async function save() {
    if (!editing?.scope || !editing.scope_id || !editing.month) {
      alert('Скоуп, scope_id, місяць — обов\'язкові');
      return;
    }
    const res = await fetch('/api/finance/investor-monthly-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: editing.scope, scope_id: editing.scope_id,
        month: editing.month, ceo_name: editing.ceo_name, body_md: editing.body_md,
      }),
    });
    const j = await res.json();
    if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
    setEditing(null);
    fetchAll();
  }

  async function remove(id: string) {
    if (!confirm('Видалити нотатку?')) return;
    await fetch(`/api/finance/investor-monthly-notes/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  const scopeOptions = editing?.scope === 'portfolio' ? investors : assets;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          CEO monthly commentary, що відображається у топі інвесторської сторінки. Scope = portfolio (для одного інвестора) або asset (для одного об&apos;єкта). Markdown допускається.
        </p>
        <button onClick={openNew} style={{ ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>
          <Plus size={14} /> Нова нотатка
        </button>
      </div>

      {loading ? <div>Завантаження…</div> : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Жодної нотатки. Створіть першу — вона з&apos;явиться вгорі інвесторської сторінки.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={th}>Місяць</th>
                <th style={th}>Скоуп</th>
                <th style={th}>Для</th>
                <th style={th}>CEO</th>
                <th style={th}>Початок тексту</th>
                <th style={th}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                  <td style={td}><b>{n.month}</b></td>
                  <td style={td}>
                    <span style={{ fontSize: 11, padding: '2px 8px', background: n.scope === 'portfolio' ? '#dbeafe' : '#dcfce7', color: n.scope === 'portfolio' ? '#1e40af' : '#166534', borderRadius: 4 }}>
                      {n.scope}
                    </span>
                  </td>
                  <td style={td}>{n.scope === 'portfolio' ? n.investor_name : n.asset_name || '—'}</td>
                  <td style={td}>{n.ceo_name || '—'}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 12, maxWidth: 320 }}>
                    {(n.body_md || '').substring(0, 80)}{(n.body_md || '').length > 80 ? '…' : ''}
                  </td>
                  <td style={td}>
                    <button onClick={() => setEditing(n)} style={iconBtn}><Edit size={14} /></button>
                    <button onClick={() => remove(n.id)} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={14} /></button>
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
            <h3 style={{ margin: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquareText size={20} /> CEO Monthly Note
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Field label="Місяць (YYYY-MM) *">
                  <input style={input} value={editing.month || ''}
                    onChange={(e) => setEditing({ ...editing, month: e.target.value })} placeholder="2026-04" />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="CEO підпис">
                  <input style={input} value={editing.ceo_name || ''}
                    onChange={(e) => setEditing({ ...editing, ceo_name: e.target.value })} placeholder="Олег" />
                </Field>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Field label="Скоуп *">
                  <select style={input} value={editing.scope || 'portfolio'}
                    onChange={(e) => setEditing({ ...editing, scope: e.target.value as 'portfolio' | 'asset', scope_id: '' })}>
                    <option value="portfolio">portfolio (для інвестора)</option>
                    <option value="asset">asset (для об&apos;єкта)</option>
                  </select>
                </Field>
              </div>
              <div style={{ flex: 2 }}>
                <Field label={editing.scope === 'portfolio' ? 'Інвестор *' : 'Об\'єкт *'}>
                  <select style={input} value={editing.scope_id || ''}
                    onChange={(e) => setEditing({ ...editing, scope_id: e.target.value })}>
                    <option value="">—</option>
                    {scopeOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </Field>
              </div>
            </div>
            <Field label="Текст (markdown допускається)">
              <textarea
                style={{ ...input, minHeight: 200, fontFamily: 'inherit', lineHeight: 1.5 }}
                value={editing.body_md || ''}
                onChange={(e) => setEditing({ ...editing, body_md: e.target.value })}
                placeholder="Ivan'е, квітень закрили на 65% occupancy по Kemp Carlsbad — це найкращий показник за весь час.&#10;&#10;Виплата за квітень виходить 1850€, надішлю до 15-го травня."
              />
            </Field>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: -4, marginBottom: 8 }}>
              Перший рядок = головна теза. Пусті рядки розділяють абзаци. Підтримуються <code>**bold**</code>, <code>*italic*</code>, переноси рядків.
            </div>
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
const modalStyle: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 640, maxWidth: 720, maxHeight: '90vh', overflow: 'auto' };
