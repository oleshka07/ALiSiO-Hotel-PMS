'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Edit, ExternalLink, Image as ImageIcon, X } from 'lucide-react';

interface WorkStage {
  id?: string;
  name: string;
  status: 'Not Started' | 'In Progress' | 'Completed';
  weight: number;
  percentage: number;
  lastUpdated?: string;
}

interface Property {
  project_id: string;
  name: string;
  location: string | null;
  image_url: string | null;
  airbnb_url: string | null;
  ical_url: string | null;
  status: 'project' | 'in_progress' | 'active' | 'paused';
  is_active: number;
  active_lots: number;
  total_invested: number;
  work_stages: WorkStage[];
}

const DEFAULT_STAGES: WorkStage[] = [
  { name: 'Construction',  status: 'Not Started', weight: 40, percentage: 0 },
  { name: 'Renovation',    status: 'Not Started', weight: 30, percentage: 0 },
  { name: 'Interior',      status: 'Not Started', weight: 20, percentage: 0 },
  { name: 'Launch Prep',   status: 'Not Started', weight: 10, percentage: 0 },
];

const STATUS_OPTIONS: { value: Property['status']; label: string; color: string }[] = [
  { value: 'project',     label: 'Project',     color: '#6366f1' },
  { value: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { value: 'active',      label: 'Active',      color: '#22c55e' },
  { value: 'paused',      label: 'Paused',      color: '#94a3b8' },
];

export default function PropertiesTab() {
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Property> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/investor-properties');
      const json = await res.json();
      setItems(json.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function save() {
    if (!editing?.name) { alert('Введи назву'); return; }
    try {
      const isNew = !editing.project_id;
      const url = isNew ? '/api/finance/investor-properties' : `/api/finance/investor-properties/${editing.project_id}`;
      const method = isNew ? 'POST' : 'PUT';
      const body = {
        name: editing.name,
        location: editing.location || null,
        image_url: editing.image_url || null,
        airbnb_url: editing.airbnb_url || null,
        ical_url: editing.ical_url || null,
        status: editing.status || 'active',
        work_stages: editing.work_stages || [],
      };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      setEditing(null);
      fetchAll();
    } catch (e: any) { alert(`Помилка: ${e.message}`); }
  }

  function openNew() {
    setEditing({ status: 'active', work_stages: DEFAULT_STAGES.map((s) => ({ ...s })) });
  }
  function openEdit(p: Property) {
    setEditing({ ...p, work_stages: p.work_stages.length > 0 ? p.work_stages.map((s) => ({ ...s })) : DEFAULT_STAGES.map((s) => ({ ...s })) });
  }

  async function unlink(p: Property) {
    if (p.active_lots > 0) {
      alert(`«${p.name}» має ${p.active_lots} активних лотів. Спочатку приберіть лоти через cascade-delete на /finance/investors/audit.`);
      return;
    }
    if (!confirm(`Прибрати «${p.name}» з інвесторського блоку?\n\nBusiness_unit залишиться для фінансів, але буде відв'язано:\n• investor_property_details (картинка, локація, статус, etc.)\n• work_stages\n• monthly_metrics + monthly_reports`)) return;
    const res = await fetch(`/api/finance/investor-properties/${p.project_id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
    const d = j.deleted;
    alert(`✓ Відв'язано «${p.name}»:\n• ${d.details} property_details\n• ${d.work_stages} work_stages\n• ${d.monthly_metrics} метрик\n• ${d.monthly_reports} звітів\n\nBusiness_unit залишився.`);
    fetchAll();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={openNew} style={{ ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>
          <Plus size={14} /> Додати об'єкт
        </button>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 12 }}>
        Показано лише business_units, у які вже є active investments. Фінансові buckets (Ресторан, Сауна тощо без інвесторських лотів) приховано.
      </p>

      {loading ? <div>Завантаження…</div> : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Жоден business_unit не має активних інвестицій. Створіть інвестицію у вкладці «Інвестиції (лоти)» щоб обʼєкт зʼявився тут.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {items.map((p) => {
            const stat = STATUS_OPTIONS.find((s) => s.value === p.status) || STATUS_OPTIONS[2];
            const overallPct = p.work_stages.length > 0
              ? Math.round(p.work_stages.reduce((sum, s) => sum + (s.weight * s.percentage / 100), 0) / p.work_stages.reduce((sum, s) => sum + s.weight, 0) * 100)
              : 0;
            return (
              <div key={p.project_id} style={{ border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    <div style={{ width: 64, height: 64, background: 'var(--bg-secondary)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                      <ImageIcon size={20} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <span style={{ fontSize: 10, padding: '2px 8px', background: `${stat.color}22`, color: stat.color, borderRadius: 999, fontWeight: 600 }}>{stat.label}</span>
                    </div>
                    {p.location && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.location}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Лотів: <b>{p.active_lots}</b> · Інвестовано: <b>{p.total_invested.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })}</b>
                    </div>
                  </div>
                </div>

                {/* Work-stage progress strip */}
                {p.work_stages.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>Прогрес реалізації</span>
                      <span>{overallPct}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${overallPct}%`, background: overallPct >= 99 ? '#16a34a' : '#22c55e' }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(p)} style={btn}><Edit size={13} /> Редагувати</button>
                  {p.airbnb_url && (
                    <a href={p.airbnb_url} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }}><ExternalLink size={13} /> Airbnb</a>
                  )}
                  <button
                    onClick={() => unlink(p)}
                    style={{ ...btn, marginLeft: 'auto', color: '#dc2626', borderColor: '#dc2626' }}
                    title="Відв'язати BU від інвесторського блоку (BU + фінанси залишаться)"
                  >
                    <X size={13} /> Прибрати
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div style={overlayStyle} onClick={() => setEditing(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>{editing.project_id ? 'Редагувати об\'єкт' : 'Новий об\'єкт'}</h3>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 2 }}>
                <Field label="Назва *"><input style={input} value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Статус">
                  <select style={input} value={editing.status || 'active'} onChange={(e) => setEditing({ ...editing, status: e.target.value as Property['status'] })}>
                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            <Field label="Локація (текстом)"><input style={input} value={editing.location || ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} placeholder="QA Glamping" /></Field>
            <Field label="URL зображення (right-click → Copy Image Address на Airbnb)">
              <input style={input} value={editing.image_url || ''} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="https://a0.muscache.com/..." />
            </Field>
            {editing.image_url && (
              <img src={editing.image_url} alt="preview" style={{ maxWidth: 200, height: 100, objectFit: 'cover', borderRadius: 6, marginBottom: 10 }} />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><Field label="Airbnb URL"><input style={input} value={editing.airbnb_url || ''} onChange={(e) => setEditing({ ...editing, airbnb_url: e.target.value })} /></Field></div>
              <div style={{ flex: 1 }}><Field label="iCal URL (опц.)"><input style={input} value={editing.ical_url || ''} onChange={(e) => setEditing({ ...editing, ical_url: e.target.value })} /></Field></div>
            </div>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14 }}>Етапи реалізації (work stages)</h4>
                <button onClick={() => setEditing({ ...editing, work_stages: [...(editing.work_stages || []), { name: 'Новий етап', status: 'Not Started', weight: 0, percentage: 0 }] })}
                        style={{ ...btn, fontSize: 11, padding: '4px 8px' }}>
                  <Plus size={11} /> Додати
                </button>
              </div>
              {(editing.work_stages || []).map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 60px 1fr auto', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <input style={{ ...input, fontSize: 12 }} value={s.name}
                         onChange={(e) => updateStage(editing, setEditing, i, { name: e.target.value })} placeholder="Назва" />
                  <select style={{ ...input, fontSize: 12 }} value={s.status}
                          onChange={(e) => updateStage(editing, setEditing, i, { status: e.target.value as WorkStage['status'] })}>
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                  <input type="number" style={{ ...input, fontSize: 12 }} value={s.weight} min={0} max={100}
                         onChange={(e) => updateStage(editing, setEditing, i, { weight: parseInt(e.target.value) || 0 })} title="Вага у загальному прогресі (сума має бути 100)" />
                  <input type="range" min={0} max={100} value={s.percentage}
                         onChange={(e) => updateStage(editing, setEditing, i, { percentage: parseInt(e.target.value) })} title={`${s.percentage}%`} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 30, textAlign: 'right' }}>{s.percentage}%</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Сума ваг: {(editing.work_stages || []).reduce((s, x) => s + (x.weight || 0), 0)} {(editing.work_stages || []).reduce((s, x) => s + (x.weight || 0), 0) !== 100 && <span style={{ color: '#f59e0b' }}>(рекомендовано 100)</span>}
              </div>
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

function updateStage(
  editing: Partial<Property> | null,
  setEditing: (v: Partial<Property> | null) => void,
  index: number,
  patch: Partial<WorkStage>,
) {
  if (!editing) return;
  const stages = (editing.work_stages || []).map((s, i) => i === index ? { ...s, ...patch } : s);
  setEditing({ ...editing, work_stages: stages });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>{children}</div>;
}

const input: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 13, fontWeight: 500, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modalStyle: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 580, maxWidth: 700, maxHeight: '90vh', overflow: 'auto' };
