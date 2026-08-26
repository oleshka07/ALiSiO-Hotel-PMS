/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Trash2, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react';
import { ImageUploadField } from '@/components/ui/ImageUploadField';

const SERVICE_TYPES = [
  { value: 'simple', label: 'Просте замовлення' },
  { value: 'slot_booking', label: 'Бронювання слоту' },
  { value: 'menu_selection', label: 'Вибір з меню' },
  { value: 'toggle', label: 'Перемикач (так/ні)' },
];

const CATEGORIES = [
  { value: 'food', label: '🍳 Їжа' },
  { value: 'wellness', label: '🧖 Велнес' },
  { value: 'sport', label: '🚲 Спорт' },
  { value: 'transport', label: '🚗 Транспорт' },
  { value: 'other', label: '✨ Інше' },
];

const EMOJI_OPTS = ['🍳', '🧖', '🏊', '🛁', '🚲', '⚡', '🏄', '🔥', '🕐', '🕛', '🎣', '🧘', '🍕', '🧹', '✨', '🌿', '🎯'];

export default function ServicesSettingsPage() {
  const [services, setServices] = useState<any[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({
    name: '', name_en: '', description: '', price: 0, currency: 'CZK',
    unit_label: '', icon: '✨', category: 'other', service_type: 'simple',
    duration_minutes: 0, sort_order: 99, name_cs: '', name_de: '', photo_url: '',
  });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch('/api/additional-services');
      if (res.ok) setServices(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const createService = async () => {
    setSaving('new');
    try {
      const res = await fetch('/api/additional-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      if (res.ok) {
        showToast('Послугу створено!');
        setNewForm({ name: '', name_en: '', description: '', price: 0, currency: 'CZK', unit_label: '', icon: '✨', category: 'other', service_type: 'simple', duration_minutes: 0, sort_order: 99, name_cs: '', name_de: '', photo_url: '' });
        setShowNew(false);
        fetchServices();
      }
    } catch (e) { console.error(e); }
    setSaving(null);
  };

  const updateService = async (id: string) => {
    setSaving(id);
    try {
      const res = await fetch('/api/additional-services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm }),
      });
      if (res.ok) {
        showToast('Збережено ✅');
        setEditing(null);
        setEditForm({});
        fetchServices();
      }
    } catch (e) { console.error(e); }
    setSaving(null);
  };

  const toggleActive = async (svc: any) => {
    await fetch('/api/additional-services', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: svc.id, is_active: svc.is_active ? 0 : 1 }),
    });
    fetchServices();
  };

  const deleteService = async (id: string) => {
    if (!confirm('Видалити послугу?')) return;
    await fetch(`/api/additional-services?id=${id}`, { method: 'DELETE' });
    showToast('Видалено');
    fetchServices();
  };

  const startEdit = (svc: any) => {
    setEditing(svc.id);
    setEditForm({
      name: svc.name, name_en: svc.name_en || '', description: svc.description || '',
      price: svc.price, currency: svc.currency, unit_label: svc.unit_label || '',
      icon: svc.icon, category: svc.category, service_type: svc.service_type,
      duration_minutes: svc.duration_minutes || 0, sort_order: svc.sort_order,
      name_cs: svc.name_cs || '', name_de: svc.name_de || '', photo_url: svc.photo_url || '',
    });
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>🎯 Послуги для гостей</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Управління додатковими послугами, які показуються на гостьовій сторінці
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(!showNew)}>
          <Plus size={14} /> Додати
        </button>
      </div>

      {/* New service form */}
      {showNew && (
        <div className="card" style={{ marginBottom: 16, padding: 20 }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 15 }}>➕ Нова послуга</h4>
          <ServiceForm form={newForm} setForm={setNewForm} />
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Скасувати</button>
            <button className="btn btn-primary" onClick={createService} disabled={saving === 'new' || !newForm.name}>
              <Save size={14} /> Створити
            </button>
          </div>
        </div>
      )}

      {/* Services list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {services.map((svc) => (
          <div key={svc.id} className="card" style={{ padding: 16, opacity: svc.is_active ? 1 : 0.5 }}>
            {editing === svc.id ? (
              <>
                <ServiceForm form={editForm} setForm={setEditForm} />
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => setEditing(null)}>Скасувати</button>
                  <button className="btn btn-primary" onClick={() => updateService(svc.id)} disabled={saving === svc.id}>
                    <Save size={14} /> Зберегти
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <GripVertical size={16} style={{ color: 'var(--text-tertiary)', cursor: 'grab', flexShrink: 0 }} />
                {svc.photo_url ? (
                  <img src={svc.photo_url} alt={svc.name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: 26, flexShrink: 0 }}>{svc.icon}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {svc.name}
                    {svc.name_en && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 8 }}>({svc.name_en})</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {svc.description || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-primary">{CATEGORIES.find(c => c.value === svc.category)?.label || svc.category}</span>
                    <span className="badge badge-info">{SERVICE_TYPES.find(t => t.value === svc.service_type)?.label || svc.service_type}</span>
                    {svc.duration_minutes > 0 && <span>⏱ {svc.duration_minutes} хв</span>}
                    <span>#{svc.sort_order}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-primary-text)' }}>{svc.price} {svc.currency}</div>
                  {svc.unit_label && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>/{svc.unit_label}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: svc.is_active ? '#22c55e' : '#ef4444' }}
                    onClick={() => toggleActive(svc)} title={svc.is_active ? 'Вимкнути' : 'Увімкнути'}>
                    {svc.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => startEdit(svc)}>Редагувати</button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}
                    onClick={() => deleteService(svc.id)} title="Видалити">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {services.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div>Ще немає послуг. Натисніть «Додати» щоб створити першу.</div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: '#22c55e', color: '#fff', padding: '12px 24px', borderRadius: 12,
          fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>{toast}</div>
      )}
    </div>
  );
}

function ServiceForm({ form, setForm }: { form: any; setForm: (f: any) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div>
        <label className="form-label">Назва (укр) *</label>
        <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Сніданок" />
      </div>
      <div>
        <label className="form-label">Назва (eng)</label>
        <input className="form-input" value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} placeholder="Breakfast" />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label className="form-label">Опис</label>
        <input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Повноцінний сніданок у ресторані" />
      </div>
      <div>
        <label className="form-label">Ціна</label>
        <input className="form-input" type="number" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} />
      </div>
      <div>
        <label className="form-label">Валюта</label>
        <select className="form-select" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
          <option value="CZK">CZK</option>
          <option value="EUR">EUR</option>
        </select>
      </div>
      <div>
        <label className="form-label">Одиниця</label>
        <input className="form-input" value={form.unit_label} onChange={e => setForm({ ...form, unit_label: e.target.value })} placeholder="за годину / за день" />
      </div>
      <div>
        <label className="form-label">Іконка</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {EMOJI_OPTS.map(e => (
            <button key={e} type="button" onClick={() => setForm({ ...form, icon: e })}
              style={{
                width: 36, height: 36, fontSize: 20, border: form.icon === e ? '2px solid var(--accent-primary)' : '1px solid var(--border-primary)',
                borderRadius: 8, background: form.icon === e ? 'rgba(59,130,246,0.1)' : 'transparent', cursor: 'pointer',
              }}>{e}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="form-label">Категорія</label>
        <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Тип</label>
        <select className="form-select" value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}>
          {SERVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Тривалість (хв)</label>
        <input className="form-input" type="number" value={form.duration_minutes || ''} onChange={e => setForm({ ...form, duration_minutes: Number(e.target.value) || null })} placeholder="60" />
      </div>
      <div>
        <label className="form-label">Порядок</label>
        <input className="form-input" type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <ImageUploadField
          label="📸 Фото послуги"
          value={form.photo_url || ''}
          onChange={url => setForm({ ...form, photo_url: url })}
          folder="services"
          aspectRatio="16/9"
          placeholder="https://... або завантажте фото"
        />
      </div>
      <div>
        <label className="form-label">Назва (чеськ)</label>
        <input className="form-input" value={form.name_cs || ''} onChange={e => setForm({ ...form, name_cs: e.target.value })} placeholder="Snídaně" />
      </div>
      <div>
        <label className="form-label">Назва (нім)</label>
        <input className="form-input" value={form.name_de || ''} onChange={e => setForm({ ...form, name_de: e.target.value })} placeholder="Frühstück" />
      </div>
    </div>
  );
}
