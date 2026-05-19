'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Save, Building2, BedDouble, Check, Loader2 } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface GroupBookingModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  bookingSources: any[];
}

export default function GroupBookingModal({ open, onClose, onCreated, bookingSources }: GroupBookingModalProps) {
  const [mode, setMode] = useState<'building' | 'custom'>('building');
  const [buildings, setBuildings] = useState<any[]>([]);
  const [allUnits, setAllUnits] = useState<any[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    checkIn: '', checkOut: '', totalPrice: 0, source: 'direct', notes: '',
  });

  // Fetch buildings and units
  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch('/api/buildings').then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
    ]).then(([b, u]) => {
      if (Array.isArray(b)) setBuildings(b);
      if (Array.isArray(u)) setAllUnits(u);
    });
  }, [open]);

  // Units for selected building
  const buildingUnits = useMemo(() => {
    if (!selectedBuildingId) return [];
    return allUnits.filter(u => u.building_id === selectedBuildingId);
  }, [allUnits, selectedBuildingId]);

  // Units for custom selection (with category filter)
  const filteredUnits = useMemo(() => {
    if (!categoryFilter) return allUnits;
    return allUnits.filter(u => u.category_type === categoryFilter);
  }, [allUnits, categoryFilter]);

  // Categories from units
  const categories = useMemo(() => {
    const cats = new Map<string, string>();
    allUnits.forEach(u => { if (u.category_type && u.category_name) cats.set(u.category_type, u.category_name); });
    return Array.from(cats.entries());
  }, [allUnits]);

  const toggleUnit = (id: string) => {
    setSelectedUnitIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = (units: any[]) => {
    const ids = units.map(u => u.id);
    const allSelected = ids.every(id => selectedUnitIds.includes(id));
    if (allSelected) {
      setSelectedUnitIds(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedUnitIds(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const calcNights = () => {
    if (!form.checkIn || !form.checkOut) return 0;
    return Math.max(0, Math.floor((new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / 86400000));
  };

  const handleCreate = async () => {
    if (!form.firstName || !form.lastName || !form.checkIn || !form.checkOut) {
      alert("Заповніть обов'язкові поля");
      return;
    }
    const unitIds = mode === 'building' ? buildingUnits.map((u: any) => u.id) : selectedUnitIds;
    if (unitIds.length === 0) {
      alert('Оберіть кімнати');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/group-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          groupType: mode,
          buildingId: mode === 'building' ? selectedBuildingId : null,
          unitIds,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated();
        onClose();
        resetForm();
      } else {
        alert(data.error || 'Помилка створення');
      }
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  const resetForm = () => {
    setForm({ firstName: '', lastName: '', email: '', phone: '', checkIn: '', checkOut: '', totalPrice: 0, source: 'direct', notes: '' });
    setSelectedUnitIds([]);
    setSelectedBuildingId('');
    setMode('building');
  };

  if (!open) return null;

  const nights = calcNights();
  const roomCount = mode === 'building' ? buildingUnits.length : selectedUnitIds.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">🏨 Групове бронювання</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ overflow: 'auto', flex: 1 }}>
          {/* Mode selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              className={`btn ${mode === 'building' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onClick={() => { setMode('building'); setSelectedUnitIds([]); }}
            >
              <Building2 size={16} /> Вся будівля
            </button>
            <button
              className={`btn ${mode === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onClick={() => { setMode('custom'); setSelectedBuildingId(''); }}
            >
              <BedDouble size={16} /> Обрати кімнати
            </button>
          </div>

          {/* Room selection */}
          <div className="card" style={{ marginBottom: 16, padding: 12 }}>
            {mode === 'building' ? (
              <>
                <label className="form-label">Обрати будівлю</label>
                <select className="form-select" value={selectedBuildingId} onChange={e => setSelectedBuildingId(e.target.value)}>
                  <option value="">— Оберіть будівлю —</option>
                  {buildings.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.unit_count} кімнат)</option>
                  ))}
                </select>
                {buildingUnits.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                      Кімнати ({buildingUnits.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {buildingUnits.map((u: any) => (
                        <span key={u.id} className="badge badge-primary" style={{ fontSize: 11 }}>{u.code}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <button className={`btn btn-sm ${!categoryFilter ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCategoryFilter('')}>Всі</button>
                  {categories.map(([type, name]) => (
                    <button key={type} className={`btn btn-sm ${categoryFilter === type ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setCategoryFilter(type)}>{name}</button>
                  ))}
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Обрано: {selectedUnitIds.length} кімнат</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => selectAll(filteredUnits)}>
                    {filteredUnits.every(u => selectedUnitIds.includes(u.id)) ? 'Зняти все' : 'Обрати все'}
                  </button>
                </div>

                <div style={{ maxHeight: 200, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
                  {filteredUnits.map(u => {
                    const sel = selectedUnitIds.includes(u.id);
                    return (
                      <div key={u.id} onClick={() => toggleUnit(u.id)}
                        style={{
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                          background: sel ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
                          border: sel ? '2px solid var(--accent-primary)' : '2px solid transparent',
                          display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                        }}>
                        {sel && <Check size={14} style={{ color: 'var(--accent-primary)' }} />}
                        <span style={{ fontWeight: 600 }}>{u.code}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{u.category_name}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Dates */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Заїзд *</label>
              <input className="form-input" type="date" value={form.checkIn}
                onChange={e => setForm(p => ({ ...p, checkIn: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Виїзд *</label>
              <input className="form-input" type="date" value={form.checkOut}
                onChange={e => setForm(p => ({ ...p, checkOut: e.target.value }))} />
            </div>
          </div>
          {nights > 0 && (
            <div style={{ fontSize: 13, color: 'var(--accent-primary)', marginBottom: 12 }}>
              📅 {nights} ночей × {roomCount} кімнат = {nights * roomCount} кімнато-ночей
            </div>
          )}

          {/* Price + source */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Загальна ціна</label>
              <input className="form-input" type="number" value={form.totalPrice}
                onChange={e => setForm(p => ({ ...p, totalPrice: Number(e.target.value) }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Джерело</label>
              <select className="form-select" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
                {bookingSources.map(s => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
                {bookingSources.length === 0 && <option value="direct">Direct</option>}
              </select>
            </div>
          </div>

          {/* Guest data */}
          <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: 16, paddingTop: 16 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Замовник групи</h4>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Ім&apos;я *</label>
                <input className="form-input" placeholder="Ім'я" value={form.firstName}
                  onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Прізвище *</label>
                <input className="form-input" placeholder="Прізвище" value={form.lastName}
                  onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" placeholder="email@example.com" value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Телефон</label>
                <input className="form-input" type="tel" placeholder="+420..." value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Примітки</label>
            <textarea className="form-input" rows={2} value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-pulse" /> : <Save size={16} />}
            Створити ({roomCount} кімнат)
          </button>
        </div>
      </div>
    </div>
  );
}
