'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw, Phone, Plus, X, LogIn, LogOut, Building2, Pencil, Info, Link, MessageCircle } from 'lucide-react';
import MobileBookingDetail from '@/components/booking/MobileBookingDetail';
import BookingForm, { type UnitTypeRow as BFUnitTypeRow, type UnitRow as BFUnitRow, type BookingSourceRow as BFBookingSourceRow } from '@/components/booking/BookingForm';
import RoomAllocationModal from '@/components/booking/RoomAllocationModal';

interface BookingRow {
  id: string; check_in: string; check_out: string; nights: number;
  adults: number; children: number; status: string; payment_status: string;
  source: string; total_price: number; first_name: string; last_name: string;
  guest_email: string | null; guest_phone: string | null;
  unit_name: string; unit_code: string; category_type: string;
  unit_type_name: string; group_id: string | null;
  commission_amount: number; guest_page_token: string | null;
  internal_notes: string | null; city_tax_amount: number;
  city_tax_included: number; city_tax_paid: string;
  registration_status: string; nationality: string | null;
  unit_id: string; unit_type_id: string; category_id: string; category_name: string;
  guest_id: string; notes: string | null; cleaning_status: string | null;
}

interface UnitRow {
  id: string; name: string; code: string; category_type: string;
  unit_type_id: string; unit_type_name: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft:       { label: 'Чернетка',     color: '#6c7086', bg: 'rgba(108,112,134,0.15)' },
  tentative:   { label: 'Очікується',   color: '#fbbf24', bg: 'rgba(251,191,36,0.15)'  },
  confirmed:   { label: 'Підтверджено', color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
  checked_in:  { label: 'Заселено',     color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  checked_out: { label: 'Виселено',     color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  cancelled:   { label: 'Скасовано',    color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
};

const PAY_MAP: Record<string, { label: string; color: string }> = {
  unpaid:   { label: 'Не оплачено', color: '#f87171' },
  partial:  { label: 'Частково',    color: '#fbbf24' },
  paid:     { label: 'Оплачено',    color: '#34d399' },
  refunded: { label: 'Повернення',  color: '#a78bfa' },
};

const FILTER_CHIPS = [
  { key: '', label: 'Всі' },
  { key: 'confirmed', label: 'Підтверджено' },
  { key: 'tentative', label: 'Очікується' },
  { key: 'checked_in', label: 'Заселено' },
  { key: 'checked_out', label: 'Виселено' },
];

// ─── Booking Sheet wrapper ─────────────────────────────────
// Wraps shared BookingForm in mobile bottom-sheet styling.

function BookingFormSheet({
  title,
  mode,
  bookingId,
  initial,
  unitTypes,
  allUnits,
  bookingSources,
  onClose,
  onSaved,
}: {
  title: string;
  mode: 'create' | 'edit';
  bookingId?: string;
  initial?: Partial<import('@/components/booking/BookingForm').BookingFormValues>;
  unitTypes: BFUnitTypeRow[];
  allUnits: BFUnitRow[];
  bookingSources: BFBookingSourceRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet" style={{ maxHeight: '92dvh' }}>
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2 style={{ fontSize: 17 }}>{title}</h2>
          <button className="m-header-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
          <BookingForm
            mode={mode}
            bookingId={bookingId}
            initial={initial}
            unitTypes={unitTypes}
            allUnits={allUnits}
            bookingSources={bookingSources}
            onSaved={onSaved}
            onCancel={onClose}
          />
        </div>
      </div>
    </>
  );
}

// ─── Main Component ────────────────────────────────────────

interface MobileBookingsProps {
  openNew?: boolean;
}

export default function MobileBookings({ openNew }: MobileBookingsProps) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [unitTypes, setUnitTypes] = useState<BFUnitTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewBooking, setViewBooking] = useState<BookingRow | null>(null);
  const [editBooking, setEditBooking] = useState<BookingRow | null>(null);
  const [payments, setPayments] = useState<unknown[]>([]);
  const [registrations, setRegistrations] = useState<unknown[]>([]);
  const [activityLog, setActivityLog] = useState<unknown[]>([]);
  const [bookingSources, setBookingSources] = useState<BFBookingSourceRow[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showNewBooking, setShowNewBooking] = useState(openNew ?? false);
  const [categoryFilter, setCategoryFilter] = useState('resort');
  const [showArchive, setShowArchive] = useState(false);
  const [showRoomAllocation, setShowRoomAllocation] = useState(false);

  const todayISO = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const sourceMap = useMemo(() => {
    const map: Record<string, { label: string; color: string }> = {};
    for (const s of bookingSources) {
      map[s.code] = { label: s.name, color: s.color || '#6c7086' };
    }
    return map;
  }, [bookingSources]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ category: categoryFilter, limit: '500' });
      if (!showArchive) params.set('check_out_from', todayISO);
      const [bRes, sRes, uRes, utRes] = await Promise.all([
        fetch(`/api/bookings?${params}`),
        fetch('/api/booking-sources'),
        fetch('/api/units'),
        fetch('/api/unit-types'),
      ]);
      if (bRes.ok) { const d = await bRes.json(); setBookings(d.bookings || d); }
      if (sRes.ok) setBookingSources(await sRes.json());
      if (uRes.ok) setUnits(await uRes.json());
      if (utRes.ok) setUnitTypes(await utRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [categoryFilter, showArchive, todayISO]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const [dateFilter, setDateFilter] = useState<'all' | 'today_in' | 'today_out' | 'staying'>('all');

  const filtered = useMemo(() => {
    let result = bookings.filter(b => b.status !== 'cancelled');
    if (statusFilter) result = result.filter(b => b.status === statusFilter);
    if (dateFilter === 'today_in') result = result.filter(b => b.check_in === todayISO);
    if (dateFilter === 'today_out') result = result.filter(b => b.check_out === todayISO);
    if (dateFilter === 'staying') result = result.filter(b => b.check_in <= todayISO && b.check_out >= todayISO);

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(b =>
        `${b.first_name} ${b.last_name}`.toLowerCase().includes(s) ||
        b.unit_code?.toLowerCase().includes(s) ||
        b.guest_phone?.includes(s)
      );
    }
    return result.sort((a, b) => a.check_in.localeCompare(b.check_in));
  }, [bookings, statusFilter, dateFilter, todayISO, search]);

  const openBooking = async (booking: BookingRow) => {
    setViewBooking(booking);
    try {
      const [pRes, rRes, aRes] = await Promise.all([
        fetch(`/api/payments?reservation_id=${booking.id}`),
        fetch(`/api/bookings/${booking.id}/registrations`),
        fetch(`/api/bookings/${booking.id}/activity`),
      ]);
      if (pRes.ok) setPayments(await pRes.json());
      if (rRes.ok) setRegistrations(await rRes.json());
      if (aRes.ok) { const d = await aRes.json(); setActivityLog(d.activities || d); }
    } catch (e) { console.error(e); }
  };

  const handleChangeStatus = async (id: string, status: string) => {
    await fetch(`/api/bookings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    fetchData();
  };

  const editInitial = useMemo(() => {
    if (!editBooking) return undefined;
    return {
      category: editBooking.category_type,
      unitTypeId: editBooking.unit_type_id || '',
      unitId: editBooking.unit_id,
      source: editBooking.source,
      checkIn: editBooking.check_in,
      checkOut: editBooking.check_out,
      adults: editBooking.adults,
      children: editBooking.children,
      firstName: editBooking.first_name,
      lastName: editBooking.last_name,
      email: editBooking.guest_email || '',
      phone: editBooking.guest_phone || '',
      status: editBooking.status,
      paymentStatus: editBooking.payment_status || 'unpaid',
      totalPrice: String(editBooking.total_price || ''),
      commissionAmount: String(editBooking.commission_amount || ''),
      cityTaxAmount: String(editBooking.city_tax_amount || ''),
      cityTaxIncluded: !!editBooking.city_tax_included,
      cityTaxPaid: editBooking.city_tax_paid || 'pending',
      internalNotes: editBooking.internal_notes || '',
    };
  }, [editBooking]);

  return (
    <div>
      {showSearch && (
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            className="form-input"
            placeholder="Ім'я, телефон, юніт..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{ fontSize: 14, padding: '10px 12px 10px 32px', borderRadius: 12 }}
          />
        </div>
      )}

      {/* Category toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {[
          { key: 'glamping', label: 'Glamping' },
          { key: 'resort', label: 'Resort' },
          { key: 'camping', label: 'Camping' },
        ].map(c => (
          <button
            key={c.key}
            onClick={() => setCategoryFilter(c.key)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: categoryFilter === c.key ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: categoryFilter === c.key ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Date Filter chips */}
      <div className="m-chips" style={{ marginBottom: 4 }}>
        {[
          { key: 'all', label: 'Всі' },
          { key: 'today_in', label: '🛬 Заїзди сьогодні' },
          { key: 'today_out', label: '🛫 Виїзди сьогодні' },
          { key: 'staying', label: '🏠 Проживають' },
        ].map(chip => (
          <button
            key={chip.key}
            className={`m-chip ${dateFilter === chip.key ? 'm-chip-active' : ''}`}
            onClick={() => setDateFilter(chip.key as any)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Status Filter chips */}
      <div className="m-chips">
        {FILTER_CHIPS.map(chip => (
          <button
            key={chip.key}
            className={`m-chip ${statusFilter === chip.key ? 'm-chip-active' : ''}`}
            onClick={() => setStatusFilter(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
            {filtered.length} {showArchive ? 'всього' : 'актуальних'}
          </span>
          <button
            onClick={() => setShowArchive(p => !p)}
            style={{
              padding: '3px 9px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 700,
              background: showArchive ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: showArchive ? '#fff' : 'var(--text-tertiary)',
            }}
            title={showArchive ? 'Показано всі бронювання' : 'Показано лише актуальні'}
          >
            {showArchive ? 'Архів' : 'Актуальні'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {categoryFilter === 'resort' && (
            <button
              onClick={() => setShowRoomAllocation(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 10, background: 'rgba(91,124,255,0.12)', border: '1px solid rgba(91,124,255,0.3)', color: 'var(--accent-primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              title="Розселення гостей по кімнатах Будови F"
            >
              <Building2 size={13} /> Розселення
            </button>
          )}
          <button
            onClick={() => setShowNewBooking(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 10, background: 'var(--accent-primary)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={14} /> Нове
          </button>
          <button onClick={() => setShowSearch(p => !p)} style={{ background: 'transparent', border: 'none', color: showSearch ? 'var(--accent-primary)' : 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <Search size={16} />
          </button>
          <button onClick={fetchData} disabled={loading} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
          </button>
        </div>
      </div>

      {/* List */}
      {loading && bookings.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5].map(i => <div key={i} className="m-skeleton" style={{ height: 80, borderRadius: 14 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="m-empty">
          <div className="m-empty-icon">📋</div>
          <div>Нічого не знайдено</div>
        </div>
      ) : (
        filtered.map(b => {
          const st = STATUS_MAP[b.status] || STATUS_MAP.draft;
          const pay = PAY_MAP[b.payment_status] || PAY_MAP.unpaid;
          const cleanLabel = b.cleaning_status === 'clean' ? 'Чисто' : b.cleaning_status === 'dirty' ? 'Брудно' : b.cleaning_status === 'in_progress' ? 'В процесі' : null;
          const cleanColor = b.cleaning_status === 'clean' ? '#22c55e' : b.cleaning_status === 'dirty' ? '#ef4444' : '#f59e0b';
          return (
            <div key={b.id} className="m-card" style={{ padding: '12px 14px' }}>
              <div className="m-card-row" onClick={() => openBooking(b)} style={{ cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div className="m-card-title">{b.first_name} {b.last_name}</div>
                  <div className="m-card-subtitle">
                    {b.unit_code} · {b.nights} ноч. · {b.check_in} → {b.check_out}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: pay.color }}>
                    {b.total_price > 0 ? `${b.total_price.toLocaleString()} Kč` : pay.label}
                  </span>
                </div>
              </div>

              {/* Sub-row with phone and cleaning status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {b.guest_phone && (
                    <a href={`tel:${b.guest_phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                      <Phone size={10} /> {b.guest_phone}
                    </a>
                  )}
                  {cleanLabel && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: `${cleanColor}18`, color: cleanColor }}>
                      {cleanLabel}
                    </span>
                  )}
                </div>
                {b.status === 'confirmed' && (
                  <button
                    onClick={e => { e.stopPropagation(); handleChangeStatus(b.id, 'checked_in'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: 'none', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <LogIn size={12} /> Заселити
                  </button>
                )}
                {b.status === 'checked_in' && (
                  <button
                    onClick={e => { e.stopPropagation(); handleChangeStatus(b.id, 'checked_out'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: 'none', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <LogOut size={12} /> Виселити
                  </button>
                )}
              </div>

              {/* Action Toolbar on Card */}
              <div className="m-card-actions">
                <button
                  className="m-action-btn"
                  onClick={e => { e.stopPropagation(); setEditBooking(b); }}
                  title="Змінити"
                  aria-label="Змінити"
                >
                  <Pencil size={18} />
                </button>
                <button
                  className="m-action-btn"
                  onClick={e => { e.stopPropagation(); openBooking(b); }}
                  title="Деталі"
                  aria-label="Деталі"
                >
                  <Info size={18} />
                </button>
                {b.guest_page_token && (
                  <button
                    className="m-action-btn"
                    onClick={e => {
                      e.stopPropagation();
                      const link = `${window.location.origin}/guest/${b.guest_page_token}`;
                      navigator.clipboard.writeText(link);
                      alert('🔗 Посилання на сторінку гостя скопійовано!');
                    }}
                    title="Скопіювати посилання"
                    aria-label="Скопіювати посилання"
                  >
                    <Link size={18} />
                  </button>
                )}
                {b.guest_phone && (
                  <a
                    className="m-action-btn m-action-btn-whatsapp"
                    href={`https://wa.me/${b.guest_phone.replace(/[^\d+]/g, '').replace(/^\+/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ textDecoration: 'none' }}
                    title="WhatsApp"
                    aria-label="WhatsApp"
                  >
                    <MessageCircle size={18} />
                  </a>
                )}
                <button
                  className="m-action-btn m-action-btn-danger"
                  onClick={async e => {
                    e.stopPropagation();
                    if (confirm(`Скасувати бронювання ${b.first_name} ${b.last_name}?`)) {
                      await handleChangeStatus(b.id, 'cancelled');
                    }
                  }}
                  title="Скасувати"
                  aria-label="Скасувати"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* New booking sheet */}
      {showNewBooking && (
        <BookingFormSheet
          title="Нове бронювання"
          mode="create"
          unitTypes={unitTypes}
          allUnits={units as unknown as BFUnitRow[]}
          bookingSources={bookingSources}
          onClose={() => setShowNewBooking(false)}
          onSaved={() => { setShowNewBooking(false); fetchData(); }}
        />
      )}

      {/* Edit booking sheet */}
      {editBooking && (
        <BookingFormSheet
          title="Редагувати бронювання"
          mode="edit"
          bookingId={editBooking.id}
          initial={editInitial}
          unitTypes={unitTypes}
          allUnits={units as unknown as BFUnitRow[]}
          bookingSources={bookingSources}
          onClose={() => setEditBooking(null)}
          onSaved={() => { setEditBooking(null); setViewBooking(null); fetchData(); }}
        />
      )}

      {/* Booking detail sheet */}
      {viewBooking && (
        <MobileBookingDetail
          booking={viewBooking}
          payments={payments as any[]}
          registrations={registrations as any[]}
          sourceMap={sourceMap}
          onClose={() => setViewBooking(null)}
          onEdit={() => { if (viewBooking) setEditBooking(viewBooking); }}
          onChangeStatus={handleChangeStatus}
          onFetchPayments={(id) => fetch(`/api/payments?reservation_id=${id}`).then(r => r.json()).then(setPayments)}
          onFetchBookings={fetchData}
          onFetchRegistrations={(id) => fetch(`/api/bookings/${id}/registrations`).then(r => r.json()).then(setRegistrations)}
          showToast={() => {}}
          setBooking={setViewBooking}
        />
      )}

      {/* Room allocation modal (Building F) */}
      <RoomAllocationModal
        open={showRoomAllocation}
        onClose={() => setShowRoomAllocation(false)}
        onChanged={fetchData}
        buildingCode="F"
      />
    </div>
  );
}
