'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, RefreshCw, Filter, X, Search, Building2 } from 'lucide-react';
import MobileBookingDetail from '@/components/booking/MobileBookingDetail';
import BookingForm, { type UnitTypeRow as BFUnitTypeRow, type UnitRow as BFUnitRow, type BookingSourceRow as BFBookingSourceRow, type BookingFormValues } from '@/components/booking/BookingForm';
import RoomAllocationModal from '@/components/booking/RoomAllocationModal';
import MobileShiftChecklists from '@/components/mobile/MobileShiftChecklists';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface UnitRow {
  id: string; name: string; code: string; category_type: string;
  building_name: string; unit_type_id: string; unit_type_name: string;
  cleaning_status: string; beds: number; zone: string;
}

interface BookingRow {
  id: string; unit_id: string; check_in: string; check_out: string;
  status: string; first_name: string; last_name: string; nights: number;
  payment_status: string; source: string; total_price: number;
  adults: number; children: number;
  guest_email?: string | null; guest_phone?: string | null;
  unit_name?: string; unit_code?: string;
  category_type?: string; unit_type_id?: string;
  commission_amount?: number; city_tax_amount?: number;
  city_tax_included?: number; city_tax_paid?: string;
  internal_notes?: string | null; notes?: string | null;
  hostex_channel_type?: string | null;
  hostex_reservation_code?: string | null;
}

interface AvailabilityBlock {
  id: string; unit_id: string; date_from: string; date_to: string; notes: string;
}

const COL_W = 52;
const ROW_H = 44;
const LEFT_W = 80;
const HEADER_H = 40;
const AVAIL_H = 22;
const DAY_ABBR = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_SHORT = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];

const STATUS_BG: Record<string, string> = {
  confirmed:   '#3b82f6',
  checked_in:  '#14b8a6',
  tentative:   '#f59e0b',
  checked_out: '#8b5cf6',
  draft:       '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Підтверджено',
  checked_in: 'Заселено',
  tentative: 'Очікується',
  checked_out: 'Виїхав',
  draft: 'Чернетка',
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Не оплачено',
  payment_requested: 'Запит',
  prepaid: 'Передплата',
  paid: 'Оплачено',
};

const PAYMENT_ICONS: Record<string, string> = {
  unpaid: '✗',
  payment_requested: '✉',
  prepaid: '◓',
  paid: '✓',
};

const CLEAN_LABELS: Record<string, string> = {
  clean: '✓ Чисто',
  dirty: '✗ Брудно',
  in_progress: '⟳ Прибір.',
};

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function mondayOf(d: Date): Date {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  const dow = t.getDay();
  t.setDate(t.getDate() - (dow === 0 ? 6 : dow - 1));
  return t;
}

// ─── Booking form sheet wrapper (local) ────────────────────

function BookingFormSheet({
  title, mode, bookingId, initial,
  unitTypes, allUnits, bookingSources,
  onClose, onSaved,
}: {
  title: string;
  mode: 'create' | 'edit';
  bookingId?: string;
  initial?: Partial<BookingFormValues>;
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

// ─── Filters bottom sheet ──────────────────────────────────

function FiltersSheet({
  statusFilter, setStatusFilter,
  paymentFilter, setPaymentFilter,
  cleaningFilter, setCleaningFilter,
  onClose, onClear,
}: {
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  paymentFilter: string;
  setPaymentFilter: (v: string) => void;
  cleaningFilter: string;
  setCleaningFilter: (v: string) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet" style={{ maxHeight: '70dvh' }}>
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2 style={{ fontSize: 17 }}>Фільтри</h2>
          <button className="m-header-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>Статус</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[{ k: '', l: 'Всі' }, ...Object.keys(STATUS_LABELS).map(k => ({ k, l: STATUS_LABELS[k] }))].map(opt => (
                <button
                  key={opt.k || 'all'}
                  onClick={() => setStatusFilter(opt.k)}
                  style={{
                    padding: '7px 14px', borderRadius: 16, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: statusFilter === opt.k ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: statusFilter === opt.k ? '#fff' : 'var(--text-secondary)',
                  }}
                >{opt.l}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>Оплата</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[{ k: '', l: 'Всі' }, ...Object.keys(PAYMENT_LABELS).map(k => ({ k, l: `${PAYMENT_ICONS[k]} ${PAYMENT_LABELS[k]}` }))].map(opt => (
                <button
                  key={opt.k || 'all'}
                  onClick={() => setPaymentFilter(opt.k)}
                  style={{
                    padding: '7px 14px', borderRadius: 16, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: paymentFilter === opt.k ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: paymentFilter === opt.k ? '#fff' : 'var(--text-secondary)',
                  }}
                >{opt.l}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>Прибирання</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[{ k: '', l: 'Всі' }, ...Object.keys(CLEAN_LABELS).map(k => ({ k, l: CLEAN_LABELS[k] }))].map(opt => (
                <button
                  key={opt.k || 'all'}
                  onClick={() => setCleaningFilter(opt.k)}
                  style={{
                    padding: '7px 14px', borderRadius: 16, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: cleaningFilter === opt.k ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: cleaningFilter === opt.k ? '#fff' : 'var(--text-secondary)',
                  }}
                >{opt.l}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={onClear}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >Скинути</button>
            <button
              onClick={onClose}
              style={{
                flex: 2, padding: '12px', borderRadius: 10, border: 'none',
                background: 'var(--accent-primary)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >Готово</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main ──────────────────────────────────────────────────

export default function MobileCalendar() {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [unitTypes, setUnitTypes] = useState<BFUnitTypeRow[]>([]);
  const [bookingSources, setBookingSources] = useState<BFBookingSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('resort');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [cleaningFilter, setCleaningFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<'gantt' | 'shift'>('gantt');

  useEffect(() => {
    if (searchParams?.get('view') === 'shift') {
      setViewMode('shift');
    }
  }, [searchParams]);

  const [viewBlock, setViewBlock] = useState<AvailabilityBlock | null>(null);

  const [viewBooking, setViewBooking] = useState<BookingRow | null>(null);
  const [editBooking, setEditBooking] = useState<BookingRow | null>(null);
  const [payments, setPayments] = useState<unknown[]>([]);
  const [registrations, setRegistrations] = useState<unknown[]>([]);
  const [activityLog, setActivityLog] = useState<unknown[]>([]);

  const [rangeStart, setRangeStart] = useState<{ unitId: string; date: string } | null>(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newBookingPrefill, setNewBookingPrefill] = useState<Partial<BookingFormValues> | null>(null);
  const [showRoomAllocation, setShowRoomAllocation] = useState(false);

  const [startDay, setStartDay] = useState<Date>(() => mondayOf(new Date()));

  const DAYS = 14;

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(startDay, i)), [startDay]);
  const today = useMemo(() => { const t = new Date(); t.setHours(0,0,0,0); return t; }, []);
  const todayISO = toISO(today);

  const shiftCheckIns = useMemo(() => bookings.filter(b => b.check_in === todayISO && b.status !== 'cancelled'), [bookings, todayISO]);
  const shiftCheckOuts = useMemo(() => bookings.filter(b => b.check_out === todayISO && b.status !== 'cancelled'), [bookings, todayISO]);
  const dirtyUnits = useMemo(() => units.filter(u => u.cleaning_status === 'dirty' || u.cleaning_status === 'in_progress'), [units]);

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
      const [uRes, bRes, blkRes, utRes, srcRes] = await Promise.all([
        fetch(`/api/units?category=${category}`),
        fetch(`/api/bookings?limit=500&category=${category}`),
        fetch('/api/availability-blocks'),
        fetch('/api/unit-types'),
        fetch('/api/booking-sources'),
      ]);
      if (uRes.ok) setUnits(await uRes.json());
      if (bRes.ok) { const d = await bRes.json(); setBookings(d.bookings || d); }
      if (blkRes.ok) { const b = await blkRes.json(); setBlocks(Array.isArray(b) ? b : []); }
      if (utRes.ok) setUnitTypes(await utRes.json());
      if (srcRes.ok) setBookingSources(await srcRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [category]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter units by cleaning status + search
  const filteredUnits = useMemo(() => {
    return units.filter(u => {
      if (cleaningFilter && u.cleaning_status !== cleaningFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!u.name?.toLowerCase().includes(s) && !u.code?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [units, cleaningFilter, search]);

  // Group units — by building for resort, by zone for camping, flat for glamping
  const groups = useMemo(() => {
    const map = new Map<string, UnitRow[]>();
    for (const u of filteredUnits) {
      let key: string;
      if (category === 'resort') key = u.building_name || '—';
      else if (category === 'camping') key = u.zone || '—';
      else key = u.unit_type_name || u.category_type || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return map;
  }, [filteredUnits, category]);

  const flatUnits = useMemo(() => {
    const arr: UnitRow[] = [];
    groups.forEach(us => arr.push(...us));
    return arr;
  }, [groups]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToToday = useCallback(() => {
    if (!scrollRef.current) return;
    const todayOffset = daysBetween(startDay, today);
    if (todayOffset >= 0 && todayOffset < DAYS) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset * COL_W - 8);
    }
  }, [startDay, today]);

  useEffect(() => {
    if (units.length === 0) return;
    scrollToToday();
  }, [units, scrollToToday]);

  const gridWidth = DAYS * COL_W;

  // Visible bookings = match range, not cancelled, status/payment filters applied
  const visibleBookings = useMemo(() => {
    const rangeS = toISO(startDay);
    const rangeE = toISO(addDays(startDay, DAYS));
    return bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      if (statusFilter && b.status !== statusFilter) return false;
      if (paymentFilter && b.payment_status !== paymentFilter) return false;
      if (b.check_in >= rangeE) return false;
      if (b.check_out <= rangeS) return false;
      return true;
    });
  }, [bookings, startDay, statusFilter, paymentFilter]);

  // Visible blocks in range
  const visibleBlocks = useMemo(() => {
    const rangeS = toISO(startDay);
    const rangeE = toISO(addDays(startDay, DAYS));
    return blocks.filter(b => b.date_from < rangeE && b.date_to > rangeS);
  }, [blocks, startDay]);

  type Span = { kind: 'booking'; booking: BookingRow; unitIdx: number; colStart: number; colSpan: number }
            | { kind: 'block'; block: AvailabilityBlock; unitIdx: number; colStart: number; colSpan: number };

  const spans = useMemo<Span[]>(() => {
    const result: Span[] = [];
    const startISO = toISO(startDay);
    for (const b of visibleBookings) {
      const unitIdx = flatUnits.findIndex(u => u.id === b.unit_id);
      if (unitIdx < 0) continue;
      const checkIn = new Date(b.check_in + 'T00:00:00');
      const checkOut = new Date(b.check_out + 'T00:00:00');
      const colStart = Math.max(0, daysBetween(startDay, checkIn));
      const colEnd = Math.min(DAYS, daysBetween(startDay, checkOut));
      if (colEnd <= colStart) continue;
      result.push({ kind: 'booking', booking: b, unitIdx, colStart, colSpan: colEnd - colStart });
    }
    for (const blk of visibleBlocks) {
      const unitIdx = flatUnits.findIndex(u => u.id === blk.unit_id);
      if (unitIdx < 0) continue;
      const df = new Date(blk.date_from + 'T00:00:00');
      const dt = new Date(blk.date_to + 'T00:00:00');
      const colStart = Math.max(0, daysBetween(startDay, df));
      const colEnd = Math.min(DAYS, daysBetween(startDay, dt));
      if (colEnd <= colStart) continue;
      result.push({ kind: 'block', block: blk, unitIdx, colStart, colSpan: colEnd - colStart });
    }
    void startISO;
    return result;
  }, [visibleBookings, visibleBlocks, flatUnits, startDay]);

  // Free units per day (for availability row)
  const freePerDay = useMemo(() => {
    return days.map(day => {
      const ds = toISO(day);
      const booked = new Set(
        visibleBookings.filter(b => ds >= b.check_in && ds < b.check_out).map(b => b.unit_id)
      );
      const blocked = new Set(
        visibleBlocks.filter(b => ds >= b.date_from && ds < b.date_to).map(b => b.unit_id)
      );
      const unavailable = new Set<string>();
      booked.forEach(id => unavailable.add(id));
      blocked.forEach(id => unavailable.add(id));
      return filteredUnits.length - unavailable.size;
    });
  }, [days, visibleBookings, visibleBlocks, filteredUnits]);

  // Today alerts
  const todayAlerts = useMemo(() => {
    const ts = todayISO;
    const checkIns = bookings.filter(b => b.check_in === ts && b.status !== 'cancelled');
    const checkOuts = bookings.filter(b => b.check_out === ts && b.status !== 'cancelled');
    const unpaid = bookings.filter(b => (b.payment_status === 'unpaid') && b.status !== 'cancelled' && b.check_in >= ts);
    return { checkIns: checkIns.length, checkOuts: checkOuts.length, unpaid: unpaid.length };
  }, [bookings, todayISO]);

  const goWeek = (dir: -1 | 1) => {
    setStartDay(d => addDays(d, dir * 7));
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollLeft = 0; });
  };
  const goToday = () => {
    setStartDay(mondayOf(new Date()));
  };

  // Booking view modal flow
  const openBookingDetails = async (bookingId: string) => {
    try {
      const [bRes, pRes, rRes, aRes] = await Promise.all([
        fetch(`/api/bookings/${bookingId}`),
        fetch(`/api/payments?reservation_id=${bookingId}`),
        fetch(`/api/bookings/${bookingId}/registrations`),
        fetch(`/api/bookings/${bookingId}/activity`),
      ]);
      if (bRes.ok) setViewBooking(await bRes.json());
      if (pRes.ok) setPayments(await pRes.json());
      if (rRes.ok) setRegistrations(await rRes.json());
      if (aRes.ok) { const d = await aRes.json(); setActivityLog(d.activities || d); }
    } catch (e) { console.error(e); }
  };

  const handleChangeStatus = async (id: string, status: string) => {
    await fetch(`/api/bookings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (viewBooking && viewBooking.id === id) setViewBooking({ ...viewBooking, status });
    fetchData();
  };

  const editInitial = useMemo(() => {
    if (!editBooking) return undefined;
    const b = editBooking;
    return {
      category: b.category_type || category,
      unitTypeId: b.unit_type_id || '',
      unitId: b.unit_id,
      source: b.source,
      checkIn: b.check_in,
      checkOut: b.check_out,
      adults: b.adults,
      children: b.children,
      firstName: b.first_name,
      lastName: b.last_name,
      email: b.guest_email || '',
      phone: b.guest_phone || '',
      status: b.status,
      paymentStatus: b.payment_status || 'unpaid',
      totalPrice: String(b.total_price || ''),
      commissionAmount: String(b.commission_amount || ''),
      cityTaxAmount: String(b.city_tax_amount || ''),
      cityTaxIncluded: !!b.city_tax_included,
      cityTaxPaid: b.city_tax_paid || 'pending',
      internalNotes: b.internal_notes || '',
    };
  }, [editBooking, category]);

  // Cell tap (2-click range)
  const handleCellClick = (unitId: string, day: Date) => {
    const dateStr = toISO(day);
    const unit = units.find(u => u.id === unitId);
    if (!rangeStart || rangeStart.unitId !== unitId) {
      setRangeStart({ unitId, date: dateStr });
    } else {
      let ci = rangeStart.date;
      let co = dateStr;
      if (co <= ci) { const tmp = ci; ci = co; co = tmp; }
      if (ci === co) {
        const nd = addDays(day, 1);
        co = toISO(nd);
      }
      setRangeStart(null);
      setNewBookingPrefill({
        unitId,
        category: unit?.category_type,
        unitTypeId: unit?.unit_type_id,
        checkIn: ci,
        checkOut: co,
      });
      setShowCreateSheet(true);
    }
  };

  const endDay = addDays(startDay, DAYS - 1);
  const monthLabel = startDay.getMonth() === endDay.getMonth()
    ? `${MONTH_SHORT[startDay.getMonth()]} ${startDay.getFullYear()}`
    : `${MONTH_SHORT[startDay.getMonth()]} — ${MONTH_SHORT[endDay.getMonth()]} ${endDay.getFullYear()}`;

  const activeFilterCount = (statusFilter ? 1 : 0) + (paymentFilter ? 1 : 0) + (cleaningFilter ? 1 : 0);

  // height calc: 52 (header) + 64 (bottom tabs) + 12 (padding) + 38 (cat) + 50 (toolbar) + 36 (alerts banner, if visible) + 30 (legend)
  const hasAlerts = todayAlerts.checkIns + todayAlerts.checkOuts + todayAlerts.unpaid > 0;
  const gridH = `calc(100dvh - 52px - 64px - 12px - 38px - 50px - ${hasAlerts ? 40 : 0}px - 30px${showSearch ? ' - 44px' : ''})`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Top Header: Category toggle & View Mode switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'glamping', label: 'Glamping' },
            { key: 'resort', label: 'Resort' },
            { key: 'camping', label: 'Camping' },
          ].map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)} style={{
              padding: '5px 10px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
              background: category === c.key ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: category === c.key ? '#fff' : 'var(--text-secondary)',
            }}>{c.label}</button>
          ))}
        </div>

        {/* View Mode Switcher */}
        <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: 2, borderRadius: 16 }}>
          <button
            onClick={() => setViewMode('gantt')}
            style={{
              padding: '4px 10px', borderRadius: 14, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: viewMode === 'gantt' ? 'var(--bg-card)' : 'transparent',
              color: viewMode === 'gantt' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: viewMode === 'gantt' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            📊 Сітка
          </button>
          <button
            onClick={() => setViewMode('shift')}
            style={{
              padding: '4px 10px', borderRadius: 14, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: viewMode === 'shift' ? 'var(--bg-card)' : 'transparent',
              color: viewMode === 'shift' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: viewMode === 'shift' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            📋 Зміна
          </button>
        </div>
      </div>

      {/* Search bar (toggleable) */}
      {showSearch && (
        <div style={{ position: 'relative', marginBottom: 6 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            className="form-input"
            placeholder="Юніт..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{ fontSize: 13, padding: '8px 12px 8px 30px', borderRadius: 10 }}
          />
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => goWeek(-1)} style={navBtn}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{monthLabel}</span>
          <button onClick={goToday} style={todayBtn}>Сьогодні</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {category === 'resort' && (
            <button
              onClick={() => setShowRoomAllocation(true)}
              style={{ ...navBtn, color: 'var(--accent-primary)' }}
              title="Розселення по кімнатах Будови F"
            >
              <Building2 size={15} />
            </button>
          )}
          <button onClick={() => setShowSearch(s => !s)} style={{ ...navBtn, color: showSearch ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
            <Search size={16} />
          </button>
          <button onClick={() => setShowFilters(true)} style={{ ...navBtn, position: 'relative', color: activeFilterCount > 0 ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
            <Filter size={16} />
            {activeFilterCount > 0 && (
              <span style={{ position: 'absolute', top: 2, right: 2, background: 'var(--accent-primary)', color: '#fff', borderRadius: 8, fontSize: 9, fontWeight: 700, padding: '0 4px', lineHeight: '14px' }}>
                {activeFilterCount}
              </span>
            )}
          </button>
          <button onClick={fetchData} disabled={loading} style={navBtn}>
            <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
          </button>
          <button onClick={() => goWeek(1)} style={navBtn}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Today alerts */}
      {hasAlerts && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 6, padding: '6px 10px', borderRadius: 10,
          background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
          fontSize: 11, fontWeight: 600, flexWrap: 'wrap',
        }}>
          {todayAlerts.checkIns > 0 && <span style={{ color: '#22c55e' }}>✈ {todayAlerts.checkIns} заїздів</span>}
          {todayAlerts.checkOuts > 0 && <span style={{ color: '#60a5fa' }}>🚶 {todayAlerts.checkOuts} виїздів</span>}
          {todayAlerts.unpaid > 0 && <span style={{ color: '#f59e0b' }}>⚠ {todayAlerts.unpaid} неоплачених</span>}
        </div>
      )}

      {/* Range selection indicator */}
      {rangeStart && (
        <div style={{
          padding: '8px 12px', borderRadius: 12, marginBottom: 8,
          background: 'var(--bg-card)', border: '1px solid var(--accent-primary)',
          fontSize: 12, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>📅 Заїзд: {rangeStart.date} (натисніть другу дату на сітці)</span>
            <button
              onClick={() => setRangeStart(null)}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 2 }}
            ><X size={16} /></button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={async () => {
                const dateStr = rangeStart.date;
                const unitId = rangeStart.unitId;
                const nextD = toISO(addDays(new Date(dateStr + 'T00:00:00'), 1));
                const res = await fetch('/api/availability-blocks', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ unit_id: unitId, date_from: dateStr, date_to: nextD, notes: 'Закрито з мобільного' }),
                });
                if (res.ok) {
                  setRangeStart(null);
                  fetchData();
                } else {
                  alert('Не вдалося заблокувати доступ');
                }
              }}
              style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
              🔒 Закрити доступ
            </button>
          </div>
        </div>
      )}

      {/* Shift View vs Gantt Grid */}
      {viewMode === 'shift' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}>
          {/* Operational Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700 }}>🛬 ЗАЇЗДИ</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6', marginTop: 2 }}>{shiftCheckIns.length}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700 }}>🛫 ВИЇЗДИ</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#8b5cf6', marginTop: 2 }}>{shiftCheckOuts.length}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700 }}>🧹 БРУДНО</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', marginTop: 2 }}>{dirtyUnits.length}</div>
            </div>
          </div>

          {/* Arrivals List */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              🛬 Заїзди сьогодні ({shiftCheckIns.length})
            </div>
            {shiftCheckIns.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-primary)' }}>
                Сьогодні немає нових заїздів
              </div>
            ) : (
              shiftCheckIns.map(b => (
                <div key={b.id} className="m-card" style={{ padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{b.first_name} {b.last_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        Юніт: <strong style={{ color: 'var(--text-primary)' }}>{b.unit_code}</strong> · {b.nights} ноч.
                      </div>
                    </div>
                    {b.status === 'confirmed' ? (
                      <button
                        onClick={() => handleChangeStatus(b.id, 'checked_in')}
                        className="m-action-btn m-action-btn-primary"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                      >
                        Заселити
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(20,184,166,0.15)', color: '#14b8a6' }}>
                        Заселено
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Departures List */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              🛫 Виїзди сьогодні ({shiftCheckOuts.length})
            </div>
            {shiftCheckOuts.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-primary)' }}>
                Сьогодні немає виїздів
              </div>
            ) : (
              shiftCheckOuts.map(b => (
                <div key={b.id} className="m-card" style={{ padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{b.first_name} {b.last_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        Юніт: <strong style={{ color: 'var(--text-primary)' }}>{b.unit_code}</strong>
                      </div>
                    </div>
                    {b.status === 'checked_in' ? (
                      <button
                        onClick={() => handleChangeStatus(b.id, 'checked_out')}
                        className="m-action-btn"
                        style={{ padding: '6px 12px', fontSize: 12, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' }}
                      >
                        Виселити
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                        Виселено
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cleaning / Dirty Units */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              🧹 Прибирання ({dirtyUnits.length} брудних)
            </div>
            {dirtyUnits.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-primary)' }}>
                Всі номери прибрані! ✨
              </div>
            ) : (
              dirtyUnits.map(u => (
                <div key={u.id} className="m-card" style={{ padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{u.code} ({u.name})</div>
                      <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginTop: 2 }}>
                        {u.cleaning_status === 'in_progress' ? '⏳ В процесі прибирання' : '❌ Потребує прибирання'}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await fetch(`/api/units/${u.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ cleaning_status: 'clean' }),
                        });
                        fetchData();
                      }}
                      className="m-action-btn"
                      style={{ padding: '6px 12px', fontSize: 12, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                    >
                      ✓ Позначити чисто
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Operational Role Checklists */}
          <MobileShiftChecklists />
        </div>
      ) : (
        /* Gantt */
        <div style={{ height: gridH, overflow: 'hidden', display: 'flex', borderRadius: 14, border: '1px solid var(--border-primary)', background: 'var(--bg-card)' }}>

        {/* LEFT STICKY COLUMN */}
        <div style={{ width: LEFT_W, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-primary)', zIndex: 2 }}>
          <div style={{ height: HEADER_H, flexShrink: 0, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }} />
          <div style={{ height: AVAIL_H, flexShrink: 0, background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Вільних</div>
          <div style={{ overflowY: 'scroll', flex: 1, scrollbarWidth: 'none' } as React.CSSProperties} id="gantt-left">
            {Array.from(groups.entries()).map(([building, us]) => (
              <div key={building}>
                <div style={{
                  height: 22, display: 'flex', alignItems: 'center', paddingLeft: 8,
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                  color: 'var(--text-tertiary)', background: 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {building}
                </div>
                {us.map(u => (
                  <div key={u.id} style={{
                    height: ROW_H, display: 'flex', alignItems: 'center', paddingLeft: 8,
                    borderBottom: '1px solid var(--border-primary)',
                    fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', whiteSpace: 'nowrap',
                  }}>
                    {u.code || u.name}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* SCROLLABLE GRID */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative' }}
          onScroll={e => {
            const el = document.getElementById('gantt-left');
            if (el) el.scrollTop = (e.target as HTMLDivElement).scrollTop;
          }}
        >
          {/* Date header */}
          <div style={{ display: 'flex', height: HEADER_H, position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', width: gridWidth }}>
            {days.map((d, i) => {
              const iso = toISO(d);
              const isTd = iso === todayISO;
              return (
                <div key={i} style={{
                  width: COL_W, flexShrink: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  borderRight: '1px solid var(--border-primary)',
                  background: isTd ? 'rgba(20,184,166,0.15)' : undefined,
                }}>
                  <span style={{ fontSize: 9, color: isTd ? 'var(--accent-primary)' : 'var(--text-tertiary)', fontWeight: 600 }}>
                    {DAY_ABBR[d.getDay()]}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: isTd ? 800 : 600, color: isTd ? 'var(--accent-primary)' : 'var(--text-primary)', lineHeight: 1 }}>
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Free units availability row */}
          <div style={{ display: 'flex', height: AVAIL_H, position: 'sticky', top: HEADER_H, zIndex: 3, background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-primary)', width: gridWidth }}>
            {days.map((d, i) => {
              const free = freePerDay[i];
              const total = filteredUnits.length || 1;
              const occRate = 1 - (free / total);
              const bgColor = free <= 0
                ? 'rgba(239,68,68,0.18)'
                : occRate >= 0.7
                  ? 'rgba(245,158,11,0.12)'
                  : occRate >= 0.4
                    ? 'rgba(34,197,94,0.08)'
                    : 'transparent';
              const fgColor = free <= 0 ? '#ef4444' : occRate >= 0.7 ? '#f59e0b' : '#22c55e';
              return (
                <div key={i} style={{
                  width: COL_W, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRight: '1px solid var(--border-primary)',
                  background: bgColor,
                  fontSize: 10, fontWeight: 700, color: fgColor,
                }}>
                  {Math.max(0, free)}
                </div>
              );
            })}
          </div>

          {/* Grid body */}
          <div style={{ position: 'relative', width: gridWidth }}>
            {loading && units.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--text-tertiary)', textAlign: 'center', fontSize: 13 }}>Завантаження...</div>
            ) : (
              Array.from(groups.entries()).map(([building, us]) => (
                <div key={building}>
                  <div style={{ height: 22, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', display: 'flex' }}>
                    {days.map((_, i) => (
                      <div key={i} style={{ width: COL_W, flexShrink: 0, borderRight: '1px solid var(--border-primary)' }} />
                    ))}
                  </div>
                  {us.map(u => {
                    const uIdx = flatUnits.findIndex(f => f.id === u.id);
                    return (
                      <div key={u.id} style={{ height: ROW_H, display: 'flex', borderBottom: '1px solid var(--border-primary)', position: 'relative' }}>
                        {days.map((d, i) => {
                          const iso = toISO(d);
                          const isTd = iso === todayISO;
                          const isRangeStart = rangeStart?.unitId === u.id && rangeStart?.date === iso;
                          return (
                            <div key={i} style={{
                              width: COL_W, flexShrink: 0,
                              borderRight: '1px solid var(--border-primary)',
                              background: isRangeStart
                                ? 'rgba(96,165,250,0.3)'
                                : isTd
                                  ? 'rgba(20,184,166,0.07)'
                                  : undefined,
                              cursor: 'pointer',
                            }}
                            onClick={() => handleCellClick(u.id, d)}
                            />
                          );
                        })}
                        {spans.filter(s => s.unitIdx === uIdx).map(s => {
                          if (s.kind === 'block') {
                            return (
                              <div
                                key={s.block.id}
                                title={`🔒 Закрито: ${s.block.notes || ''}`}
                                onClick={(e) => { e.stopPropagation(); setViewBlock(s.block); }}
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  left: s.colStart * COL_W + 2,
                                  width: s.colSpan * COL_W - 4,
                                  height: ROW_H - 8,
                                  borderRadius: 6,
                                  background: 'repeating-linear-gradient(45deg, #3a3a4a, #3a3a4a 5px, #2a2a38 5px, #2a2a38 10px)',
                                  border: '1px solid #555',
                                  display: 'flex',
                                  alignItems: 'center',
                                  paddingLeft: 6,
                                  overflow: 'hidden',
                                  zIndex: 1,
                                  opacity: 0.85,
                                  cursor: 'pointer',
                                }}
                              >
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#aaa', whiteSpace: 'nowrap' }}>🔒</span>
                              </div>
                            );
                          }
                          const b = s.booking;
                          const color = STATUS_BG[b.status] || '#6b7280';
                          const name = `${b.first_name} ${b.last_name?.[0] || ''}`;
                          const hasNotes = !!(b.internal_notes || b.notes);
                          const isHostex = !!b.hostex_channel_type;
                          const payIcon = b.payment_status && b.payment_status !== 'paid' ? PAYMENT_ICONS[b.payment_status] : null;
                          return (
                            <div
                              key={b.id}
                              onClick={(e) => { e.stopPropagation(); openBookingDetails(b.id); }}
                              style={{
                                position: 'absolute',
                                top: 4,
                                left: s.colStart * COL_W + 2,
                                width: s.colSpan * COL_W - 4,
                                height: ROW_H - 8,
                                borderRadius: 6,
                                background: color,
                                display: 'flex',
                                alignItems: 'center',
                                paddingLeft: 6,
                                paddingRight: 4,
                                overflow: 'hidden',
                                zIndex: 2,
                                cursor: 'pointer',
                                gap: 3,
                              }}
                            >
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                                {name}
                              </span>
                              {payIcon && (
                                <span style={{ fontSize: 9, color: '#fff', opacity: 0.9, flexShrink: 0 }}>{payIcon}</span>
                              )}
                              {hasNotes && <span style={{ fontSize: 9, flexShrink: 0 }}>📝</span>}
                              {isHostex && <span style={{ fontSize: 9, flexShrink: 0 }}>🌐</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '6px 0 0', flexShrink: 0 }}>
        {Object.entries(STATUS_BG).map(([status, color]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 7, height: 7, borderRadius: 3, background: color }} />
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
              {STATUS_LABELS[status] || status}
            </span>
          </div>
        ))}
      </div>

      {/* Filters bottom sheet */}
      {showFilters && (
        <FiltersSheet
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          paymentFilter={paymentFilter}
          setPaymentFilter={setPaymentFilter}
          cleaningFilter={cleaningFilter}
          setCleaningFilter={setCleaningFilter}
          onClose={() => setShowFilters(false)}
          onClear={() => { setStatusFilter(''); setPaymentFilter(''); setCleaningFilter(''); }}
        />
      )}

      {/* Create booking sheet */}
      {showCreateSheet && (
        <BookingFormSheet
          title="Нове бронювання"
          mode="create"
          initial={newBookingPrefill || undefined}
          unitTypes={unitTypes}
          allUnits={units as unknown as BFUnitRow[]}
          bookingSources={bookingSources}
          onClose={() => { setShowCreateSheet(false); setNewBookingPrefill(null); setRangeStart(null); }}
          onSaved={() => { setShowCreateSheet(false); setNewBookingPrefill(null); setRangeStart(null); fetchData(); }}
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
          setBooking={(b: unknown) => setViewBooking(b as BookingRow | null)}
        />
      )}

      {/* Block detail sheet */}
      {viewBlock && (
        <>
          <div className="m-sheet-backdrop" onClick={() => setViewBlock(null)} />
          <div className="m-sheet" style={{ maxHeight: '60dvh' }}>
            <div className="m-sheet-handle" />
            <div className="m-sheet-header">
              <h2 style={{ fontSize: 17 }}>🔒 Блокування номера</h2>
              <button className="m-header-btn" onClick={() => setViewBlock(null)}><X size={20} /></button>
            </div>
            <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  Юніт: {units.find(u => u.id === viewBlock.unit_id)?.code || viewBlock.unit_id}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Дати закриття: <strong>{viewBlock.date_from}</strong> → <strong>{viewBlock.date_to}</strong>
                </div>
                {viewBlock.notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                    Примітка: {viewBlock.notes}
                  </div>
                )}
              </div>
              <button
                onClick={async () => {
                  if (confirm('Видалити блокування номера на вказані дати?')) {
                    await fetch(`/api/availability-blocks?id=${viewBlock.id}`, { method: 'DELETE' });
                    setViewBlock(null);
                    fetchData();
                  }
                }}
                className="m-action-btn m-action-btn-danger"
                style={{ width: '100%', padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}
              >
                🔓 Видалити блокування (Розблокувати)
              </button>
            </div>
          </div>
        </>
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

const navBtn: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: 'var(--text-secondary)', padding: 6,
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  borderRadius: 6,
};

const todayBtn: React.CSSProperties = {
  background: 'var(--bg-tertiary)', border: 'none',
  color: 'var(--text-secondary)', padding: '4px 10px',
  borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
