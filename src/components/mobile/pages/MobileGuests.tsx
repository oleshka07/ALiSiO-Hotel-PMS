'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Phone, Mail, MapPin, X, ChevronRight, User, Plus, Edit2, MessageCircle, Save } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface GuestRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  address?: string | null;
  notes?: string | null;
  document_number?: string | null;
  document_type?: string | null;
  nationality?: string | null;
  total_stays: number;
  total_revenue: number | null;
  last_check_in: string | null;
  last_booking_status: string | null;
}

interface ReservationRow {
  id: string;
  check_in: string;
  check_out: string;
  nights: number;
  status: string;
  total_price: number;
  unit_name: string;
  unit_code: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft:       { label: 'Чернетка',    color: '#6c7086', bg: 'rgba(108,112,134,0.15)' },
  tentative:   { label: 'Очікується',  color: '#fbbf24', bg: 'rgba(251,191,36,0.15)'  },
  confirmed:   { label: 'Підтверджено',color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
  checked_in:  { label: 'Заселено',    color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  checked_out: { label: 'Виселено',    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  cancelled:   { label: 'Скасовано',   color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
};

// ─── Guest Form Sheet (Create & Edit) ─────────────────────

function GuestFormSheet({
  mode,
  guest,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  guest?: GuestRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    firstName: guest?.first_name || '',
    lastName: guest?.last_name || '',
    email: guest?.email || '',
    phone: guest?.phone || '',
    country: guest?.country || '',
    city: guest?.city || '',
    address: guest?.address || '',
    documentType: guest?.document_type || 'PASSPORT',
    documentNumber: guest?.document_number || '',
    nationality: guest?.nationality || '',
    notes: guest?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Ім'я та прізвище є обов'язковими");
      return;
    }

    setSaving(true);
    setError('');

    try {
      const url = mode === 'create' ? '/api/guests' : `/api/guests/${guest?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const body = {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        country: form.country.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        document_type: form.documentType || null,
        document_number: form.documentNumber.trim() || null,
        nationality: form.nationality.trim() || null,
        notes: form.notes.trim() || null,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Помилка збереження');
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  useBodyScrollLock(true);

  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet" style={{ maxHeight: '92dvh' }}>
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2 style={{ fontSize: 17 }}>
            {mode === 'create' ? 'Створити гостя' : 'Редагувати картку гостя'}
          </h2>
          <button className="m-header-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && (
              <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Ім'я *</label>
                <input
                  className="form-input"
                  style={{ width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14 }}
                  value={form.firstName}
                  onChange={e => setForm({ ...form, firstName: e.target.value })}
                  placeholder="Олександр"
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Прізвище *</label>
                <input
                  className="form-input"
                  style={{ width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14 }}
                  value={form.lastName}
                  onChange={e => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Коваленко"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Телефон</label>
                <input
                  className="form-input"
                  style={{ width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14 }}
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="+380..."
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Email</label>
                <input
                  className="form-input"
                  type="email"
                  style={{ width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14 }}
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="guest@mail.com"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Країна</label>
                <input
                  className="form-input"
                  style={{ width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14 }}
                  value={form.country}
                  onChange={e => setForm({ ...form, country: e.target.value })}
                  placeholder="Україна / Чехія"
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Місто</label>
                <input
                  className="form-input"
                  style={{ width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14 }}
                  value={form.city}
                  onChange={e => setForm({ ...form, city: e.target.value })}
                  placeholder="Київ"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Тип документа</label>
                <select
                  className="form-input"
                  style={{ width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14 }}
                  value={form.documentType}
                  onChange={e => setForm({ ...form, documentType: e.target.value })}
                >
                  <option value="PASSPORT">Закордонний паспорт</option>
                  <option value="ID_CARD">ID картка / Паспорт</option>
                  <option value="DRIVERS_LICENSE">Посвідчення водія</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>№ документа</label>
                <input
                  className="form-input"
                  style={{ width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14 }}
                  value={form.documentNumber}
                  onChange={e => setForm({ ...form, documentNumber: e.target.value })}
                  placeholder="XX123456"
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Примітки / VIP нотатки</label>
              <textarea
                className="form-input"
                style={{ width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14, minHeight: 70, resize: 'none' }}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Побажання, алергії, переваги..."
              />
            </div>
          </div>

          <div className="m-sheet-footer">
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: 'var(--accent-primary)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Save size={16} /> {saving ? 'Збереження...' : 'Зберегти'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── Guest Detail Sheet ───────────────────────────────────

function GuestDetailSheet({
  guest,
  onClose,
  onEdit,
}: {
  guest: GuestRow;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [stays, setStays] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useBodyScrollLock(Boolean(guest));

  useEffect(() => {
    fetch(`/api/guests/${guest.id}/reservations`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setStays(Array.isArray(d) ? d : (d.reservations || [])); setLoading(false); })
      .catch(() => setLoading(false));
  }, [guest.id]);

  const initials = `${guest.first_name[0] || ''}${guest.last_name[0] || ''}`.toUpperCase();
  const cleanPhone = (guest.phone || '').replace(/[^\d+]/g, '');

  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet" style={{ maxHeight: '88dvh' }}>
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2 style={{ fontSize: 17 }}>{guest.first_name} {guest.last_name}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="m-header-btn" onClick={onEdit} title="Редагувати"><Edit2 size={18} /></button>
            <button className="m-header-btn" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 16px' }}>
          {/* Avatar + stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{
              width: 60, height: 64, borderRadius: 20,
              background: 'linear-gradient(135deg, #14b8a6, #3b82f6)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800, flexShrink: 0,
            }}>
              {initials || <User size={28} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{guest.first_name} {guest.last_name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {guest.total_stays} перебування · {guest.total_revenue ? `${Math.round(guest.total_revenue).toLocaleString()} Kč` : '0 Kč'}
              </div>
            </div>
          </div>

          {/* Quick contact toolbar */}
          {cleanPhone && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <a
                href={`tel:${cleanPhone}`}
                className="m-action-btn m-action-btn-primary"
                style={{ flex: 1, textDecoration: 'none', padding: '10px' }}
              >
                <Phone size={14} /> Подзвонити
              </a>
              <a
                href={`https://wa.me/${cleanPhone.replace(/^\+/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="m-action-btn"
                style={{ flex: 1, textDecoration: 'none', padding: '10px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
            </div>
          )}

          {/* Contact & passport info */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
            {guest.phone && (
              <a href={`tel:${guest.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', textDecoration: 'none', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-primary)' }}>
                <Phone size={16} color="var(--accent-primary)" />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{guest.phone}</span>
              </a>
            )}
            {guest.email && (
              <a href={`mailto:${guest.email}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', textDecoration: 'none', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-primary)' }}>
                <Mail size={16} color="var(--accent-primary)" />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{guest.email}</span>
              </a>
            )}
            {guest.country && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: guest.document_number ? '1px solid var(--border-primary)' : 'none' }}>
                <MapPin size={16} color="var(--text-tertiary)" />
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  {[guest.country, guest.city, guest.address].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            {guest.document_number && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <span style={{ fontSize: 14 }}>🆔</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {guest.document_type || 'Документ'}: {guest.document_number} {guest.nationality ? `(${guest.nationality})` : ''}
                </span>
              </div>
            )}
            {guest.notes && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-primary)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong>Примітки:</strong> {guest.notes}
              </div>
            )}
          </div>

          {/* Stay history */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Історія бронювань
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => <div key={i} className="m-skeleton" style={{ height: 56, borderRadius: 12 }} />)}
            </div>
          ) : stays.length === 0 ? (
            <div className="m-empty" style={{ padding: 24 }}>Немає бронювань</div>
          ) : (
            stays.map(s => {
              const st = STATUS_MAP[s.status] || STATUS_MAP.draft;
              return (
                <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{s.unit_code}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {s.check_in} → {s.check_out} · {s.nights} ноч.
                  </div>
                  {s.total_price > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                      {s.total_price.toLocaleString()} Kč
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Component ────────────────────────────────────────

export default function MobileGuests({ openNew }: { openNew?: boolean }) {
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestRow | null>(null);
  const [editingGuest, setEditingGuest] = useState<GuestRow | null>(null);
  const [showCreateGuest, setShowCreateGuest] = useState(openNew ?? false);

  const fetchGuests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (search.trim()) {
        const cleanQ = search.trim();
        const isPhoneLike = /^[\d\s+\-()]+$/.test(cleanQ) && cleanQ.replace(/\D/g, '').length >= 3;
        params.set('search', isPhoneLike ? cleanQ.replace(/\D/g, '') : cleanQ);
      }
      const res = await fetch(`/api/guests?${params}`);
      if (res.ok) {
        const d = await res.json();
        setGuests(d.guests || d || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchGuests(); }, [fetchGuests]);

  const initials = (g: GuestRow) =>
    `${g.first_name[0] || ''}${g.last_name[0] || ''}`.toUpperCase();

  return (
    <div>
      {/* Search bar */}
      {showSearch && (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            className="form-input"
            placeholder="Ім'я, email, телефон..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{ fontSize: 14, padding: '10px 12px 10px 32px', borderRadius: 12 }}
          />
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
          {guests.length} гостей
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowCreateGuest(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 12px', borderRadius: 10,
              background: 'var(--accent-primary)', border: 'none',
              color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer'
            }}
          >
            <Plus size={14} /> Гість
          </button>
          <button
            onClick={() => setShowSearch(p => !p)}
            style={{ background: 'transparent', border: 'none', color: showSearch ? 'var(--accent-primary)' : 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}
          >
            <Search size={16} />
          </button>
          <button
            onClick={fetchGuests}
            disabled={loading}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}
          >
            <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
          </button>
        </div>
      </div>

      {/* List */}
      {loading && guests.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="m-skeleton" style={{ height: 68, borderRadius: 14 }} />)}
        </div>
      ) : guests.length === 0 ? (
        <div className="m-empty">
          <div className="m-empty-icon">👥</div>
          <div>Гостей не знайдено</div>
        </div>
      ) : (
        guests.map(g => (
          <div
            key={g.id}
            className="m-card"
            onClick={() => setSelectedGuest(g)}
            style={{ padding: '12px 14px', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 14, flexShrink: 0,
                background: 'linear-gradient(135deg, #14b8a6, #3b82f6)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 700,
              }}>
                {initials(g)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m-card-title">{g.first_name} {g.last_name}</div>
                <div className="m-card-subtitle" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {g.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={10} />{g.phone}</span>}
                  {g.country && <span>{g.country}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {g.notes && (
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(234,179,8,0.18)', color: '#eab308', fontWeight: 700 }}>
                      {g.notes.toLowerCase().includes('vip') ? '👑 VIP' : '📝'}
                    </span>
                  )}
                  {g.total_stays > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)', padding: '2px 7px', borderRadius: 8, background: 'rgba(20,184,166,0.12)' }}>
                      {g.total_stays}×
                    </span>
                  )}
                </div>
                <ChevronRight size={14} color="var(--text-tertiary)" />
              </div>
            </div>
          </div>
        ))
      )}

      {/* Create guest sheet */}
      {showCreateGuest && (
        <GuestFormSheet
          mode="create"
          onClose={() => setShowCreateGuest(false)}
          onSaved={() => { setShowCreateGuest(false); fetchGuests(); }}
        />
      )}

      {/* Edit guest sheet */}
      {editingGuest && (
        <GuestFormSheet
          mode="edit"
          guest={editingGuest}
          onClose={() => setEditingGuest(null)}
          onSaved={() => { setEditingGuest(null); setSelectedGuest(null); fetchGuests(); }}
        />
      )}

      {/* Detail sheet */}
      {selectedGuest && !editingGuest && (
        <GuestDetailSheet
          guest={selectedGuest}
          onClose={() => setSelectedGuest(null)}
          onEdit={() => setEditingGuest(selectedGuest)}
        />
      )}
    </div>
  );
}
