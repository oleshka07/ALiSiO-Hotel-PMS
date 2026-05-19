'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, Loader2, Check, Users, Building2, BedDouble, CreditCard, Plus, Edit3, Save } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Чернетка', color: '#6c7086' },
  tentative: { label: 'Очікується', color: '#f59e0b' },
  confirmed: { label: 'Підтверджено', color: '#22c55e' },
  checked_in: { label: 'Заселено', color: '#3b82f6' },
  checked_out: { label: 'Виселено', color: '#a78bfa' },
  cancelled: { label: 'Скасовано', color: '#ef4444' },
};

const PAYMENT_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: 'Не оплачено', color: '#ef4444' },
  payment_requested: { label: 'Запит', color: '#f59e0b' },
  prepaid: { label: 'Передпл.', color: '#3b82f6' },
  paid: { label: 'Оплачено', color: '#22c55e' },
};

const METHOD_LABELS: Record<string, string> = {
  cash: '💵 Готівка', card: '💳 Картою',
  bank_transfer: '🏦 На рахунок', invoice: '📄 Фактура', online: '🌐 Онлайн',
  booking_platform: '🏨 Платформа бронювання',
};

const TYPE_LABELS: Record<string, string> = {
  deposit: 'Передоплата', full: 'Повна', partial: 'Часткова', refund: 'Повернення',
};

interface GroupViewModalProps {
  groupId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

export default function GroupViewModal({ groupId, onClose, onUpdated }: GroupViewModalProps) {
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [assignRoom, setAssignRoom] = useState<string | null>(null);
  const [guestForm, setGuestForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  // Payment state
  const [payments, setPayments] = useState<any[]>([]);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payMode, setPayMode] = useState<'shared' | 'room'>('shared');
  const [payRoomId, setPayRoomId] = useState('');
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', type: 'partial', notes: '' });
  const [paySaving, setPaySaving] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ checkIn: '', checkOut: '', totalPrice: '', firstName: '', lastName: '', phone: '', source: '', notes: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [bookingSources, setBookingSources] = useState<any[]>([]);

  // Fetch booking sources for the source dropdown
  useEffect(() => {
    fetch('/api/booking-sources').then(r => r.json()).then(d => { if (Array.isArray(d)) setBookingSources(d); }).catch(() => {});
  }, []);

  const fetchGroup = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/group-bookings/${groupId}`);
      const data = await res.json();
      setGroup(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [groupId]);

  const fetchPayments = useCallback(async () => {
    if (!groupId) return;
    try {
      const res = await fetch(`/api/payments?group_id=${groupId}`);
      const data = await res.json();
      if (Array.isArray(data)) setPayments(data);
    } catch (e) { console.error(e); }
  }, [groupId]);

  useEffect(() => { fetchGroup(); fetchPayments(); }, [fetchGroup, fetchPayments]);

  const totalPaid = payments.reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
  const remaining = (group?.total_price || 0) - totalPaid;

  const handleAssignGuest = async () => {
    if (!groupId || !assignRoom || !guestForm.firstName || !guestForm.lastName) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/group-bookings/${groupId}/assign-guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: assignRoom, ...guestForm }),
      });
      if (res.ok) {
        setAssignRoom(null);
        setGuestForm({ firstName: '', lastName: '', email: '', phone: '' });
        fetchGroup();
        onUpdated();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  const handleStatusChange = async (field: string, value: string) => {
    if (!groupId) return;
    setStatusSaving(true);
    try {
      await fetch(`/api/group-bookings/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      fetchGroup();
      onUpdated();
    } catch { alert('Помилка'); }
    setStatusSaving(false);
  };

  const handleDelete = async () => {
    if (!groupId || !confirm('Видалити групове бронювання і всі кімнати?')) return;
    await fetch(`/api/group-bookings/${groupId}`, { method: 'DELETE' });
    onClose();
    onUpdated();
  };

  const handleAddPayment = async () => {
    if (!groupId || !payForm.amount) return;
    setPaySaving(true);
    try {
      const body: any = {
        amount: Number(payForm.amount),
        method: payForm.method,
        type: payForm.type,
        notes: payForm.notes,
      };
      if (payMode === 'shared') {
        body.group_id = groupId;
      } else {
        body.reservation_id = payRoomId;
      }

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowPayForm(false);
        setPayForm({ amount: '', method: 'cash', type: 'partial', notes: '' });
        fetchPayments();
        fetchGroup();
        onUpdated();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch { alert('Помилка мережі'); }
    setPaySaving(false);
  };

  const openEdit = () => {
    if (!group) return;
    setEditForm({
      checkIn: group.check_in || '',
      checkOut: group.check_out || '',
      totalPrice: String(group.total_price || 0),
      firstName: group.first_name || '',
      lastName: group.last_name || '',
      phone: group.guest_phone || '',
      source: group.source || '',
      notes: group.notes || '',
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!groupId) return;
    setEditSaving(true);
    try {
      const nights = (() => {
        const d1 = new Date(editForm.checkIn);
        const d2 = new Date(editForm.checkOut);
        return Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / 86400000));
      })();
      const res = await fetch(`/api/group-bookings/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_in: editForm.checkIn,
          check_out: editForm.checkOut,
          nights,
          total_price: Number(editForm.totalPrice),
          first_name: editForm.firstName,
          last_name: editForm.lastName,
          guest_phone: editForm.phone,
          source: editForm.source,
          notes: editForm.notes,
        }),
      });
      if (res.ok) {
        setIsEditing(false);
        fetchGroup();
        onUpdated();
      } else {
        const d = await res.json();
        alert(d.error || 'Помилка');
      }
    } catch { alert('Помилка мережі'); }
    setEditSaving(false);
  };

  if (!groupId) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">🏨 Групове бронювання</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ overflow: 'auto', flex: 1 }}>
          {loading || !group ? (
            <div style={{ textAlign: 'center', padding: 32 }}><Loader2 size={24} /> Завантаження...</div>
          ) : (
            <>
              {/* Group info cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
                <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Замовник</div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>
                    <Users size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                    {group.first_name} {group.last_name}
                  </div>
                  {group.guest_phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{group.guest_phone}</div>}
                </div>
                <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Тип</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                    {group.group_type === 'building' ? (
                      <><Building2 size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Будівля: {group.building_name}</>
                    ) : (
                      <><BedDouble size={14} style={{ verticalAlign: -2, marginRight: 4 }} />{group.rooms?.length} кімнат</>
                    )}
                  </div>
                </div>
                <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Дати</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{group.check_in} — {group.check_out}</div>
                  <div style={{ fontSize: 12, color: 'var(--accent-primary)' }}>{group.nights} ночей</div>
                </div>
                <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Оплата</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent-primary)', marginTop: 2 }}>
                    {(group.total_price || 0).toLocaleString()} {group.currency || 'CZK'}
                  </div>
                  <div style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                    <span style={{ color: '#22c55e' }}>✓ {totalPaid.toLocaleString()}</span>
                    {remaining > 0 && <span style={{ color: '#ef4444' }}>✗ {remaining.toLocaleString()}</span>}
                  </div>
                </div>
              </div>

              {/* Status controls */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="form-select" value={group.status}
                  onChange={e => handleStatusChange('status', e.target.value)}
                  disabled={statusSaving} style={{ width: 'auto', fontSize: 13 }}>
                  {Object.entries(STATUS_MAP).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <span style={{
                  display: 'inline-block', padding: '3px 10px', borderRadius: 6,
                  fontSize: 12, fontWeight: 600,
                  color: PAYMENT_MAP[group.payment_status]?.color || '#888',
                  background: (PAYMENT_MAP[group.payment_status]?.color || '#888') + '22',
                }}>
                  {PAYMENT_MAP[group.payment_status]?.label || group.payment_status}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-primary" onClick={openEdit} style={{ fontSize: 12 }}>
                    <Edit3 size={13} style={{ marginRight: 4 }} /> Редагувати
                  </button>
                  <button className="btn btn-sm" style={{ color: 'var(--accent-danger)' }} onClick={handleDelete}>
                    Видалити
                  </button>
                </div>
              </div>

              {/* ═══ EDIT FORM ═══ */}
              {isEditing && (
                <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', marginBottom: 16, border: '1px solid var(--accent-primary)' }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, margin: 0 }}>✏️ Редагування групового бронювання</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Замовник (ім'я)</label>
                      <input className="form-input" value={editForm.firstName}
                        onChange={e => setEditForm(p => ({ ...p, firstName: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Прізвище</label>
                      <input className="form-input" value={editForm.lastName}
                        onChange={e => setEditForm(p => ({ ...p, lastName: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Телефон</label>
                      <input className="form-input" value={editForm.phone}
                        onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Джерело</label>
                      <select className="form-select" value={editForm.source}
                        onChange={e => setEditForm(p => ({ ...p, source: e.target.value }))}>
                        <option value="">— не вказано —</option>
                        {bookingSources.map(s => (
                          <option key={s.id} value={s.code}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Дата заїзду</label>
                      <input className="form-input" type="date" value={editForm.checkIn}
                        onChange={e => setEditForm(p => ({ ...p, checkIn: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Дата виїзду</label>
                      <input className="form-input" type="date" value={editForm.checkOut}
                        onChange={e => setEditForm(p => ({ ...p, checkOut: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Загальна вартість ({group.currency || 'CZK'})</label>
                      <input className="form-input" type="number" value={editForm.totalPrice}
                        onChange={e => setEditForm(p => ({ ...p, totalPrice: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Примітка</label>
                      <input className="form-input" value={editForm.notes}
                        onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn btn-primary" onClick={handleSaveEdit} disabled={editSaving}>
                      {editSaving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />} Зберегти
                    </button>
                    <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>Скасувати</button>
                  </div>
                </div>
              )}

              {/* ═══ PAYMENTS SECTION ═══ */}
              <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <CreditCard size={16} /> Оплати
                    {payments.length > 0 && <span className="badge badge-info" style={{ fontSize: 10 }}>{payments.length}</span>}
                  </h4>
                  <button className="btn btn-sm btn-primary" onClick={() => setShowPayForm(!showPayForm)}>
                    <Plus size={14} /> Внести оплату
                  </button>
                </div>

                {/* Payment Form */}
                {showPayForm && (
                  <div className="card" style={{ padding: 14, marginBottom: 12, border: '2px solid var(--accent-primary)' }}>
                    {/* Shared / Per-room toggle */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                      <button
                        className={`btn btn-sm ${payMode === 'shared' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setPayMode('shared')}
                        style={{ flex: 1 }}>
                        🏨 Спільна оплата
                      </button>
                      <button
                        className={`btn btn-sm ${payMode === 'room' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setPayMode('room')}
                        style={{ flex: 1 }}>
                        🛏️ По кімнаті
                      </button>
                    </div>

                    {payMode === 'shared' && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8, background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 6 }}>
                        💡 Сума буде рівномірно розподілена між {group.rooms?.length} кімнатами
                      </div>
                    )}

                    {payMode === 'room' && (
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <label className="form-label" style={{ fontSize: 12 }}>Кімната</label>
                        <select className="form-select" value={payRoomId}
                          onChange={e => setPayRoomId(e.target.value)}>
                          <option value="">— Оберіть кімнату —</option>
                          {group.rooms?.map((r: any) => (
                            <option key={r.id} value={r.id}>{r.unit_code} — {r.first_name} {r.last_name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: 12 }}>Сума ({group.currency || 'CZK'}) *</label>
                        <input className="form-input" type="number" placeholder={remaining > 0 ? String(remaining) : '0'}
                          value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: 12 }}>Метод</label>
                        <select className="form-select" value={payForm.method}
                          onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}>
                          {Object.entries(METHOD_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: 12 }}>Тип</label>
                        <select className="form-select" value={payForm.type}
                          onChange={e => setPayForm(p => ({ ...p, type: e.target.value }))}>
                          {Object.entries(TYPE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: 12 }}>Примітка</label>
                        <input className="form-input" value={payForm.notes}
                          onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowPayForm(false)}>Скасувати</button>
                      <button className="btn btn-primary btn-sm" onClick={handleAddPayment}
                        disabled={paySaving || !payForm.amount || (payMode === 'room' && !payRoomId)}>
                        {paySaving ? <Loader2 size={14} /> : <Check size={14} />}
                        {payMode === 'shared' ? 'Внести (ділити на всіх)' : 'Внести'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Payment History */}
                {payments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {payments.map(p => (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '6px 10px', borderRadius: 6,
                        background: 'var(--bg-secondary)', fontSize: 13,
                      }}>
                        <span style={{ fontWeight: 700, color: p.type === 'refund' ? '#ef4444' : '#22c55e', minWidth: 80 }}>
                          {p.type === 'refund' ? '-' : '+'}{p.amount?.toLocaleString()} {p.currency || group.currency || 'CZK'}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{METHOD_LABELS[p.method] || p.method}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{TYPE_LABELS[p.type] || p.type}</span>
                        {p.unit_code && (
                          <span className="badge badge-info" style={{ fontSize: 10, padding: '1px 6px' }}>{p.unit_code}</span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{p.paid_at}</span>
                        {p.notes && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{p.notes}</span>}
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', fontWeight: 700, fontSize: 13, borderTop: '1px solid var(--border-primary)', marginTop: 4 }}>
                      <span>Разом оплачено</span>
                      <span style={{ color: 'var(--accent-primary)' }}>{totalPaid.toLocaleString()} / {(group.total_price || 0).toLocaleString()} {group.currency || 'CZK'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ═══ ROOMS LIST ═══ */}
              <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BedDouble size={16} /> Кімнати ({group.rooms?.length || 0})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.rooms?.map((r: any) => {
                  const isGroupOwner = r.guest_id === group.guest_id;
                  return (
                    <div key={r.id} style={{
                      padding: 12, borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 8,
                        background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 13, flexShrink: 0,
                      }}>
                        {r.unit_code}
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {r.first_name} {r.last_name}
                          {isGroupOwner && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>(замовник)</span>}
                        </div>
                        {r.guest_email && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.guest_email}</div>}
                        {r.guest_phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.guest_phone}</div>}
                      </div>
                      <div>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                          fontSize: 11, fontWeight: 600,
                          color: STATUS_MAP[r.status]?.color || '#888',
                          background: (STATUS_MAP[r.status]?.color || '#888') + '22',
                        }}>
                          {STATUS_MAP[r.status]?.label || r.status}
                        </span>
                      </div>
                      <button className="btn btn-sm btn-secondary" onClick={() => {
                        setAssignRoom(r.id);
                        setGuestForm({ firstName: '', lastName: '', email: '', phone: '' });
                      }}>
                        <UserPlus size={14} /> Гість
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Assign guest inline form */}
              {assignRoom && (
                <div className="card" style={{ marginTop: 12, padding: 16, border: '2px solid var(--accent-primary)' }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                    <UserPlus size={16} style={{ verticalAlign: -3, marginRight: 4 }} />
                    Призначити гостя — {group.rooms?.find((r: any) => r.id === assignRoom)?.unit_code}
                  </h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Ім&apos;я *</label>
                      <input className="form-input" value={guestForm.firstName}
                        onChange={e => setGuestForm(p => ({ ...p, firstName: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Прізвище *</label>
                      <input className="form-input" value={guestForm.lastName}
                        onChange={e => setGuestForm(p => ({ ...p, lastName: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input className="form-input" type="email" value={guestForm.email}
                        onChange={e => setGuestForm(p => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Телефон</label>
                      <input className="form-input" type="tel" value={guestForm.phone}
                        onChange={e => setGuestForm(p => ({ ...p, phone: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setAssignRoom(null)}>Скасувати</button>
                    <button className="btn btn-primary" onClick={handleAssignGuest} disabled={saving || !guestForm.firstName || !guestForm.lastName}>
                      {saving ? <Loader2 size={16} /> : <Check size={16} />} Призначити
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
