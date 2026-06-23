'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Plus, Pencil, Trash2, X, Check, Building2, MapPin,
  ChevronRight, ChevronDown, Loader2,
  Home, Trees, UtensilsCrossed, Tent, LayoutGrid,
} from 'lucide-react';

interface Location {
  id: string;
  parent_id: string | null;
  name: string;
  type: string;
  code: string | null;
  icon: string | null;
  color: string;
  sort_order: number;
  is_active: number;
  show_in_tasks: number;
  show_in_finance: number;
  show_in_booking: number;
  show_in_investor: number;
  notes: string | null;
  parent_name: string | null;
  children?: Location[];
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  property: { label: 'Об\'єкт', color: '#3b82f6', icon: Building2 },
  building: { label: 'Будівля', color: '#6366f1', icon: Home },
  unit:     { label: 'Юніт', color: '#06b6d4', icon: LayoutGrid },
  area:     { label: 'Зона', color: '#22c55e', icon: Trees },
  facility: { label: 'Об\'єкт інфраструктури', color: '#f59e0b', icon: UtensilsCrossed },
  zone:     { label: 'Ділянка', color: '#6c7086', icon: Tent },
};

const VISIBILITY_FLAGS = [
  { key: 'show_in_tasks', label: 'Задачі', color: '#3b82f6' },
  { key: 'show_in_finance', label: 'Фінанси', color: '#22c55e' },
  { key: 'show_in_booking', label: 'Бронювання', color: '#f59e0b' },
  { key: 'show_in_investor', label: 'Інвестори', color: '#a855f7' },
];

function buildTree(items: Location[]): Location[] {
  const map = new Map<string, Location>();
  const roots: Location[] = [];
  items.forEach(item => map.set(item.id, { ...item, children: [] }));
  items.forEach(item => {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export default function LocationsPage() {
  const onMenuClick = useMobileMenu();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', type: 'unit', parent_id: '', code: '', color: '#6c7086',
    show_in_tasks: true, show_in_finance: false, show_in_booking: false, show_in_investor: false, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/locations');
      if (res.ok) setLocations(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const handleSave = async () => {
    setSaving(true);
    const url = editId ? `/api/settings/locations/${editId}` : '/api/settings/locations';
    const method = editId ? 'PATCH' : 'POST';
    try {
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          parent_id: form.parent_id || null,
          show_in_tasks: form.show_in_tasks ? 1 : 0,
          show_in_finance: form.show_in_finance ? 1 : 0,
          show_in_booking: form.show_in_booking ? 1 : 0,
          show_in_investor: form.show_in_investor ? 1 : 0,
        }),
      });
      setShowForm(false);
      setEditId(null);
      fetchLocations();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити цей об\'єкт?')) return;
    await fetch(`/api/settings/locations/${id}`, { method: 'DELETE' });
    fetchLocations();
  };

  const handleToggleVisibility = async (id: string, field: string, currentValue: number) => {
    await fetch(`/api/settings/locations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: currentValue ? 0 : 1 }),
    });
    fetchLocations();
  };

  const startEdit = (loc: Location) => {
    setForm({
      name: loc.name,
      type: loc.type,
      parent_id: loc.parent_id || '',
      code: loc.code || '',
      color: loc.color || '#6c7086',
      show_in_tasks: !!loc.show_in_tasks,
      show_in_finance: !!loc.show_in_finance,
      show_in_booking: !!loc.show_in_booking,
      show_in_investor: !!loc.show_in_investor,
      notes: loc.notes || '',
    });
    setEditId(loc.id);
    setShowForm(true);
  };

  const startCreate = () => {
    setForm({
      name: '', type: 'unit', parent_id: '', code: '', color: '#6c7086',
      show_in_tasks: true, show_in_finance: false, show_in_booking: false, show_in_investor: false, notes: '',
    });
    setEditId(null);
    setShowForm(true);
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const tree = buildTree(locations);
  const roots = locations.filter(l => !l.parent_id);

  const renderRow = (loc: Location, depth: number = 0): JSX.Element[] => {
    const hasChildren = loc.children && loc.children.length > 0;
    const isExpanded = expanded.has(loc.id);
    const TypeIcon = TYPE_CONFIG[loc.type]?.icon || MapPin;
    const typeColor = TYPE_CONFIG[loc.type]?.color || '#6c7086';
    const rows: JSX.Element[] = [];

    rows.push(
      <tr key={loc.id} style={{ opacity: loc.is_active ? 1 : 0.4 }}>
        <td style={{ paddingLeft: 16 + depth * 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasChildren ? (
              <button
                className="btn btn-ghost btn-icon"
                style={{ width: 20, height: 20, minWidth: 20, padding: 0 }}
                onClick={() => toggleExpand(loc.id)}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span style={{ width: 20, display: 'inline-block' }} />
            )}
            <TypeIcon size={16} style={{ color: typeColor, flexShrink: 0 }} />
            <span style={{ fontWeight: 500 }}>{loc.name}</span>
          </div>
        </td>
        <td>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            background: `${typeColor}20`, color: typeColor, fontWeight: 600,
          }}>
            {TYPE_CONFIG[loc.type]?.label || loc.type}
          </span>
        </td>
        <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{loc.code || '—'}</td>
        <td>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {VISIBILITY_FLAGS.map(flag => {
              const val = (loc as any)[flag.key];
              return (
                <button
                  key={flag.key}
                  className="btn btn-ghost"
                  style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 4,
                    background: val ? `${flag.color}20` : 'transparent',
                    color: val ? flag.color : 'var(--text-tertiary)',
                    border: `1px solid ${val ? flag.color + '40' : 'var(--border)'}`,
                    cursor: 'pointer', lineHeight: '18px',
                  }}
                  onClick={() => handleToggleVisibility(loc.id, flag.key, val)}
                  title={`${val ? 'Приховати' : 'Показати'} в ${flag.label}`}
                >
                  {flag.label}
                </button>
              );
            })}
          </div>
        </td>
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => startEdit(loc)}>
              <Pencil size={14} />
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(loc.id)}
              style={{ color: '#ef4444' }}>
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
    );

    if (hasChildren && isExpanded) {
      for (const child of loc.children!) {
        rows.push(...renderRow(child, depth + 1));
      }
    }

    return rows;
  };

  return (
    <>
      <Header title="Реєстр об'єктів" onMenuClick={onMenuClick} />
      <div className="app-content">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="page-title">Реєстр об&apos;єктів</h2>
            <div className="page-subtitle">
              Єдиний список всіх об&apos;єктів, будівель, юнітів та зон. Поки не підключений до модулів.
            </div>
          </div>
          <button className="btn btn-primary" onClick={startCreate}>
            <Plus size={16} /> Додати
          </button>
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                {editId ? 'Редагувати' : 'Новий об\'єкт'}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => { setShowForm(false); setEditId(null); }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Назва *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Назва об'єкту" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Тип</label>
                <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Батьківський об&apos;єкт</label>
                <select className="form-select" value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}>
                  <option value="">— Немає (кореневий) —</option>
                  {roots.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Код</label>
                <input className="form-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="A1, B2, ..." />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Відображати в модулях:</label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {VISIBILITY_FLAGS.map(flag => (
                  <label key={flag.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={(form as any)[flag.key]}
                      onChange={e => setForm(f => ({ ...f, [flag.key]: e.target.checked }))}
                    />
                    <span style={{ color: flag.color }}>{flag.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Нотатки</label>
              <textarea className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Опціональні нотатки..." />
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditId(null); }}>Скасувати</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 size={14} className="animate-pulse" /> : <Check size={14} />}
                {editId ? 'Зберегти' : 'Створити'}
              </button>
            </div>
          </div>
        )}

        <div className="card" style={{ overflow: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
              <Loader2 size={24} className="animate-pulse" style={{ display: 'inline-block' }} />
              <div style={{ marginTop: 8 }}>Завантаження...</div>
            </div>
          ) : locations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
              <MapPin size={32} style={{ display: 'inline-block', marginBottom: 8 }} />
              <div>Об&apos;єктів немає. Натисніть &quot;Додати&quot; для створення.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Назва</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', width: 140 }}>Тип</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', width: 80 }}>Код</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', width: 260 }}>Видимість</th>
                  <th style={{ padding: '10px 12px', width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {tree.map(loc => renderRow(loc, 0))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)', padding: '0 4px' }}>
          ℹ️ Це єдиний реєстр об&apos;єктів. Поки що він ізольований і не підключений до модулів (фінанси, задачі, бронювання).
          Після перевірки даних можна буде поетапно мігрувати модулі.
        </div>
      </div>
    </>
  );
}
