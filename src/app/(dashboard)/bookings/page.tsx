'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { useDevice } from '@/lib/useDevice';
import MobileBookings from '@/components/mobile/pages/MobileBookings';
import SourceIcon from '@/components/ui/SourceIcon';
import MobileFilterBar from '@/components/mobile/MobileFilterBar';
import GroupBookingModal from '@/components/booking/GroupBookingModal';
import GroupViewModal from '@/components/booking/GroupViewModal';
import BookingViewModal from '@/components/booking/BookingViewModal';
import BookingForm, { type WidgetSiteSourceRow } from '@/components/booking/BookingForm';
import {
  Plus,
  Search,
  Eye,
  Edit3,
  X,
  Users,
  Trash2,
  Check,
  ArrowRight,
  RefreshCw,
  Loader2,
  Phone,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  AlertTriangle,
  FileText,
  Bell,
} from 'lucide-react';

/* ================================================================
   Types
   ================================================================ */
interface BookingRow {
  id: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  status: string;
  payment_status: string;
  source: string;
  total_price: number;
  notes: string | null;
  guest_id: string;
  first_name: string;
  last_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  unit_id: string;
  unit_name: string;
  unit_code: string;
  category_id: string;
  category_name: string;
  category_type: string;
  unit_type_id: string;
  unit_type_name: string;
  group_id: string | null;
  parent_id: string | null;
  sub_booking_count: number;
  commission_amount: number;
  guest_page_token: string | null;
  internal_notes: string | null;
  city_tax_amount: number;
  city_tax_included: number;
  city_tax_paid: string;
  registration_status: string;
  nationality: string | null;
  hostex_channel_type?: string;
  hostex_reservation_code?: string;
  currency?: string;
}

interface GroupRow {
  id: string;
  group_type: string;
  check_in: string;
  check_out: string;
  nights: number;
  total_price: number;
  status: string;
  payment_status: string;
  source: string;
  first_name: string;
  last_name: string;
  building_name: string | null;
  room_count: number;
  currency?: string;
}

interface UnitTypeRow {
  id: string;
  name: string;
  code: string;
  max_adults: number;
  category_id: string;
  category_type: string;
  unit_count: number;
}

interface UnitRow {
  id: string;
  name: string;
  code: string;
  category_type: string;
  unit_type_id: string;
}

/* ================================================================
   Status / Source maps
   ================================================================ */
const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Чернетка', badge: 'badge-info' },
  tentative: { label: 'Очікується', badge: 'badge-warning' },
  confirmed: { label: 'Підтверджено', badge: 'badge-success' },
  checked_in: { label: 'Заселено', badge: 'badge-primary' },
  checked_out: { label: 'Виселено', badge: 'badge-info' },
  cancelled: { label: 'Скасовано', badge: 'badge-danger' },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  unpaid: { label: 'Не оплачено', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  payment_requested: { label: 'Запит на оплату', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  prepaid: { label: 'Передплата', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  paid: { label: 'Оплачено', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
};

// SOURCE_MAP is built dynamically from /api/booking-sources

/* ================================================================
   Modal
   ================================================================ */
function Modal({ open, onClose, title, children, footer, size }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; size?: 'lg';
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ================================================================
   Main
   ================================================================ */
function BookingsPageContent() {
  const { isMobile } = useDevice();
  const searchParams = useSearchParams();
  const openNew = searchParams?.get('new') === '1' || searchParams?.get('create') === '1';
  if (isMobile) return <MobileBookings openNew={openNew} />;
  return <BookingsDesktop />;
}

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsPageContent />
    </Suspense>
  );
}

const getSourceIconEmoji = (code: string) => {
  switch (code) {
    case 'direct': return '👤 ';
    case 'phone': return '📞 ';
    case 'whatsapp': return '💬 ';
    case 'booking_com': return '🏨 ';
    case 'airbnb': return '🏡 ';
    case 'vrbo': return '✈️ ';
    case 'other_ota': return '🔌 ';
    default: return '';
  }
};

function BookingsDesktop() {
  /* ── data ──────────────────────────────────────────── */
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitTypeRow[]>([]);
  const [allUnits, setAllUnits] = useState<UnitRow[]>([]);
  const [bookingSources, setBookingSources] = useState<any[]>([]);
  const [widgetSources, setWidgetSources] = useState<WidgetSiteSourceRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Build dynamic source map from fetched sources (OTA + widget sites)
  const sourceMap = useMemo(() => {
    const map: Record<string, { label: string; color: string }> = {
      widget: { label: '🌐 Віджет (Загальний)', color: '#6366f1' },
    };
    for (const s of bookingSources) {
      map[s.code] = { label: getSourceIconEmoji(s.code) + s.name, color: s.color };
    }
    for (const s of widgetSources) {
      map[s.code] = { label: `🌐 ${s.name}`, color: s.color || '#6366f1' };
    }
    return map;
  }, [bookingSources, widgetSources]);

  /* ── filters ──────────────────────────────────────── */
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' = exclude cancelled
  const [categoryFilter, setCategoryFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortCol, setSortCol] = useState<string>('check_in');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  /* ── modals ───────────────────────────────────────── */
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [viewBooking, setViewBooking] = useState<BookingRow | null>(null);
  const [editBooking, setEditBooking] = useState<BookingRow | null>(null);
  const [toast, setToast] = useState('');

  /* ── payments + activity ──────────────────────────── */
  const [payments, setPayments] = useState<any[]>([]);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', type: 'partial', notes: '' });
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const onMenuClick = useMobileMenu();

  /* ── group bookings ──────────────────────────────── */
  const [groupBookings, setGroupBookings] = useState<GroupRow[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [viewGroupId, setViewGroupId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (gid: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  // Build merged list: group headers + children interleaved with standalone bookings
  const mergedBookingRows = useMemo(() => {
    // Sort bookings first
    const sorted = [...bookings].sort((a, b) => {
      const aVal = (a as any)[sortCol] ?? '';
      const bVal = (b as any)[sortCol] ?? '';
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const rows: Array<
      | { type: 'booking'; data: BookingRow }
      | { type: 'group'; data: GroupRow }
      | { type: 'child'; data: BookingRow; groupId: string }
    > = [];
    const seenGroups = new Set<string>();
    const groupMap = new Map<string, GroupRow>();
    for (const g of groupBookings) groupMap.set(g.id, g);

    for (const b of sorted) {
      if (b.group_id && groupMap.has(b.group_id)) {
        if (!seenGroups.has(b.group_id)) {
          seenGroups.add(b.group_id);
          rows.push({ type: 'group', data: groupMap.get(b.group_id)! });
          const children = sorted.filter(bb => bb.group_id === b.group_id);
          for (const c of children) {
            rows.push({ type: 'child', data: c, groupId: b.group_id });
          }
        }
      } else {
        rows.push({ type: 'booking', data: b });
      }
    }
    for (const g of groupBookings) {
      if (!seenGroups.has(g.id)) {
        rows.push({ type: 'group', data: g });
      }
    }
    return rows;
  }, [bookings, groupBookings, sortCol, sortDir]);

  const fetchGroupBookings = useCallback(async () => {
    try {
      const res = await fetch('/api/group-bookings');
      const data = await res.json();
      if (Array.isArray(data)) setGroupBookings(data);
    } catch (e) { console.error(e); }
  }, []);

  const CZK_TO_EUR = 23.5;
  const toEur = (czk: number) => (czk / CZK_TO_EUR).toFixed(1);

  const METHOD_LABELS: Record<string, string> = {
    cash: '💵 Готівка', card: '💳 Картою',
    bank_transfer: '🏦 На рахунок', invoice: '📄 Фактура', online: '🌐 Онлайн',
    booking_platform: '🏨 Платформа бронювання',
  };
  const TYPE_LABELS: Record<string, string> = {
    deposit: 'Передплата', full: 'Повна', partial: 'Часткова', refund: 'Повернення',
  };

  const fetchPayments = useCallback(async (resId: string) => {
    try {
      const res = await fetch(`/api/payments?reservation_id=${resId}`);
      const data = await res.json();
      if (Array.isArray(data)) setPayments(data);
    } catch (e) { console.error('Failed to fetch payments', e); }
  }, []);

  const fetchActivity = useCallback(async (resId: string) => {
    try {
      const res = await fetch(`/api/bookings/${resId}/activity`);
      const data = await res.json();
      if (Array.isArray(data)) setActivityLog(data);
    } catch { setActivityLog([]); }
  }, []);

  const fetchRegistrations = useCallback(async (resId: string) => {
    try {
      const res = await fetch(`/api/bookings/${resId}/registrations`);
      const data = await res.json();
      if (Array.isArray(data)) setRegistrations(data);
    } catch { setRegistrations([]); }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      if (Array.isArray(data)) setAlerts(data);
    } catch { setAlerts([]); }
  }, []);

  const openViewBooking = useCallback((b: BookingRow) => {
    setViewBooking(b);
    fetchPayments(b.id);
    fetchActivity(b.id);
    fetchRegistrations(b.id);
    setShowPayForm(false);
  }, [fetchPayments, fetchActivity, fetchRegistrations]);

  /* ── fetch bookings ───────────────────────────────── */
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('exclude_children', '1');
      if (search) params.set('search', search);
      if (statusFilter === 'active') {
        params.set('exclude_cancelled', '1');
      } else if (statusFilter) {
        params.set('status', statusFilter);
      }
      if (categoryFilter) params.set('category', categoryFilter);
      if (paymentFilter) params.set('payment_status', paymentFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (sourceFilter) params.set('source', sourceFilter);

      const res = await fetch(`/api/bookings?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) setBookings(data);
    } catch (e) {
      console.error('Failed to fetch bookings', e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, categoryFilter, paymentFilter, dateFrom, dateTo, sourceFilter]);

  /* ── fetch ref data ───────────────────────────────── */
  useEffect(() => {
    // Load unit types and units for the booking form
    Promise.all([
      fetch('/api/unit-types').then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
      fetch('/api/booking-sources').then(r => r.json()),
      fetch('/api/booking-sources/widget-sites').then(r => r.json()),
    ]).then(([uts, us, srcs, widgets]) => {
      if (Array.isArray(uts)) setUnitTypes(uts);
      if (Array.isArray(us)) setAllUnits(us);
      if (Array.isArray(srcs)) setBookingSources(srcs);
      if (Array.isArray(widgets)) setWidgetSources(widgets);
    });
  }, []);

  /* ── fetch on filter change ───────────────────────── */
  useEffect(() => {
    const debounce = setTimeout(() => { fetchBookings(); fetchGroupBookings(); fetchAlerts(); }, 300);
    return () => clearTimeout(debounce);
  }, [fetchBookings, fetchGroupBookings, fetchAlerts]);

  const openNewBooking = () => setShowNewBooking(true);
  const openEditBooking = (b: BookingRow) => setEditBooking(b);

  const editInitial = useMemo(() => {
    if (!editBooking) return undefined;
    return {
      category: editBooking.category_type,
      unitTypeId: editBooking.unit_type_id,
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
      currency: editBooking.currency || 'CZK',
    };
  }, [editBooking]);

  /* ── delete ───────────────────────────────────────── */
  const handleDelete = async (id: string) => {
    if (!confirm(`Видалити бронювання ${id}?`)) return;
    await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
    showToast(`Бронювання ${id} видалено`);
    fetchBookings();
  };

  /* ── change status ────────────────────────────────── */
  const changeStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        showToast(`Статус змінено на: ${STATUS_MAP[newStatus]?.label || newStatus}`);
        await fetchBookings();
        fetchAlerts();
        if (viewBooking && viewBooking.id === id) {
          setViewBooking({ ...viewBooking, status: newStatus });
        }
      } else {
        const data = await res.json();
        alert(`Помилка зміни статусу: ${data.error || 'Невідома помилка'}`);
      }
    } catch (e) {
      console.error('Status change error:', e);
      alert('Помилка мережі');
    }
  };

  /* ── toast ────────────────────────────────────────── */
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <>
      <Header title="Бронювання" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 80, right: 24, zIndex: 1000,
            background: 'var(--accent-success)', color: '#fff',
            padding: '12px 20px', borderRadius: 'var(--radius-md)',
            fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'fadeIn 0.3s ease',
          }}>
            <Check size={16} /> {toast}
          </div>
        )}

        {/* ── Alert Banner ── */}
        {alerts.length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alerts.slice(0, 8).map((a: any, i: number) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                borderRadius: 'var(--radius-md)', fontSize: 13,
                background: a.severity === 'danger' ? 'rgba(239,68,68,0.1)' : a.severity === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
                border: `1px solid ${a.severity === 'danger' ? 'rgba(239,68,68,0.3)' : a.severity === 'warning' ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'}`,
                color: a.severity === 'danger' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6',
              }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={async () => {
                  let booking = bookings.find(b => b.id === a.bookingId);
                  if (!booking) {
                    try {
                      const res = await fetch(`/api/bookings/${a.bookingId}`);
                      if (res.ok) booking = await res.json();
                    } catch {}
                  }
                  if (booking) openViewBooking(booking);
                }}>
                  {a.severity === 'danger' ? <AlertTriangle size={16} /> : a.severity === 'warning' ? <Bell size={16} /> : <FileText size={16} />}
                  <span style={{ fontWeight: 600 }}>{a.guestName}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{a.message}</span>
                </div>
                <button
                  title={a.type === 'overdue_arrival' ? 'Позначити no-show та прибрати' : 'Приховати'}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (a.type === 'overdue_arrival') {
                      await fetch(`/api/bookings/${a.bookingId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'no_show' }),
                      });
                      fetchBookings();
                    }
                    setAlerts(prev => prev.filter((_: any, idx: number) => idx !== i));
                  }}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'inherit', opacity: 0.5, padding: '2px 4px',
                    borderRadius: 4, display: 'flex', alignItems: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {alerts.length > 8 && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                + ще {alerts.length - 8} сповіщень
              </div>
            )}
          </div>
        )}

        <div className="page-header">
          <div>
            <h2 className="page-title">Бронювання</h2>
            <div className="page-subtitle">{bookings.length} записів</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => { fetchBookings(); fetchGroupBookings(); }} title="Оновити">
              <RefreshCw size={16} />
            </button>
            <button className="btn btn-secondary" onClick={() => setShowGroupModal(true)}>
              <Building2 size={16} /> Групове
            </button>
            <button className="btn btn-primary" onClick={openNewBooking}>
              <Plus size={16} /> Нове бронювання
            </button>
          </div>
        </div>

        {/* Desktop Filters */}
        <div className="card desktop-filter-card" style={{ marginBottom: 16 }}>
          <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
            <div className="search-box" style={{ minWidth: 250 }}>
              <Search size={14} className="search-icon" />
              <input
                className="form-input"
                placeholder="Пошук по гостю, юніту або ID..."
                style={{ paddingLeft: 34 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="form-select" style={{ width: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="active">🚫 Без скасованих</option>
              <option value="">Всі статуси</option>
              <option value="draft">Чернетка</option>
              <option value="tentative">Очікується</option>
              <option value="confirmed">Підтверджено</option>
              <option value="checked_in">Заселено</option>
              <option value="checked_out">Виселено</option>
              <option value="cancelled">Тільки скасовані</option>
            </select>
            <select className="form-select" style={{ width: 150 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">🏕️ Всі типи</option>
              <option value="glamping">⛺ Glamping</option>
              <option value="resort">🏨 Resort</option>
              <option value="camping">🌲 Camping</option>
            </select>
            <select className="form-select" style={{ width: 170 }} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
              <option value="">Всі оплати</option>
              {Object.entries(PAYMENT_STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {(search || statusFilter || categoryFilter || paymentFilter || dateFrom || dateTo || sourceFilter) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStatusFilter(''); setCategoryFilter(''); setPaymentFilter(''); setDateFrom(''); setDateTo(''); setSourceFilter(''); }}>
                <X size={14} /> Скинути
              </button>
            )}
          </div>
          {/* Row 2: date + source */}
          <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Заїзд:</span>
              <input className="form-input" type="date" style={{ width: 140 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span style={{ color: 'var(--text-tertiary)' }}>—</span>
              <input className="form-input" type="date" style={{ width: 140 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <select className="form-select" style={{ width: 175 }} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">Всі канали</option>
              {bookingSources.length > 0 && (
                <optgroup label="Канали">
                  {bookingSources.map((s: any) => (
                    <option key={s.code} value={s.code}>{getSourceIconEmoji(s.code)}{s.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="🌐 Віджети">
                <option value="widget">🌐 Всі віджети (загальні)</option>
                {widgetSources.map((s) => (
                  <option key={s.code} value={s.code}>🌐 {s.name}</option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* ── Mobile Status Tabs + Filter Chips ── */}
        <MobileFilterBar
          tabs={[
            { key: '', label: 'Всі' },
            { key: 'confirmed', label: 'Підтверджено' },
            { key: 'tentative', label: 'Очікується' },
            { key: 'checked_in', label: 'Заселено' },
            { key: 'checked_out', label: 'Виселено' },
            { key: 'cancelled', label: 'Скасовано' },
          ]}
          activeTab={statusFilter}
          onTabChange={setStatusFilter}
        />

        {/* ── Mobile Search (compact) ── */}
        <div className="mobile-only" style={{ marginBottom: 10 }}>
          <div className="search-box" style={{ width: '100%' }}>
            <Search size={14} className="search-icon" />
            <input
              className="form-input"
              placeholder="Пошук..."
              style={{ paddingLeft: 34, fontSize: 13 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>


        {/* ── Desktop Table ── */}
        <div className="table-wrapper desktop-only">
          <table className="table">
            <thead>
              <tr>
                {[
                  { key: 'last_name', label: 'Гість' },
                  { key: 'unit_name', label: 'Юніт' },
                  { key: 'check_in', label: 'Заїзд' },
                  { key: 'check_out', label: 'Виїзд' },
                  { key: 'nights', label: 'Ночей' },
                  { key: 'adults', label: 'Гостей' },
                  { key: 'status', label: 'Статус' },
                  { key: 'payment_status', label: 'Оплата' },
                  { key: 'source', label: 'Джерело' },
                  { key: 'total_price', label: 'Сума' },
                  { key: '', label: '' },
                ].map(col => (
                  <th key={col.key || 'actions'} style={col.key ? { cursor: 'pointer', userSelect: 'none' } : {}}
                    onClick={() => { if (col.key) { setSortCol(col.key); setSortDir(prev => sortCol === col.key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); } }}>
                    {col.label}{sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 32 }}>
                  <Loader2 size={20} className="animate-pulse" style={{ display: 'inline-block' }} /> Завантаження...
                </td></tr>
              )}
              {!loading && mergedBookingRows.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
                  Нічого не знайдено
                </td></tr>
              )}
              {mergedBookingRows.map((row, idx) => {
                if (row.type === 'group') {
                  const g = row.data;
                  const isExpanded = expandedGroups.has(g.id);
                  const childCount = bookings.filter(b => b.group_id === g.id).length;
                  return (
                    <tr key={`grp-${g.id}`} style={{ background: 'rgba(99,102,241,0.06)', borderLeft: '3px solid var(--accent-primary)' }}>
                      <td colSpan={11} style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <button className="btn btn-sm btn-ghost btn-icon" style={{ padding: 2 }}
                            onClick={(e) => { e.stopPropagation(); toggleGroup(g.id); }}>
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                            {g.group_type === 'building' ? <Building2 size={16} /> : childCount}
                          </div>
                          <div style={{ flex: 1, minWidth: 120, cursor: 'pointer' }} onClick={() => setViewGroupId(g.id)}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{g.first_name} {g.last_name}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                              {g.group_type === 'building' ? `🏨 ${g.building_name}` : `🛏️ ${childCount} кім.`}
                              {' · '}{g.check_in} → {g.check_out} · {g.nights} н.
                            </span>
                          </div>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: STATUS_MAP[g.status]?.badge ? undefined : '#6c7086' }} className={`badge ${STATUS_MAP[g.status]?.badge || 'badge-info'}`}>
                            {STATUS_MAP[g.status]?.label || g.status}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-primary)' }}>
                            {(g.total_price || 0).toLocaleString()} {g.currency || 'CZK'}
                          </span>
                          <button className="btn btn-sm btn-ghost btn-icon" title="Переглянути групу"
                            onClick={(e) => { e.stopPropagation(); setViewGroupId(g.id); }}>
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                if (row.type === 'child') {
                  if (!expandedGroups.has(row.groupId)) return null;
                  const b = row.data;
                  return (
                    <tr key={b.id} style={{ cursor: 'pointer', background: 'rgba(99,102,241,0.03)' }}
                      onClick={() => openViewBooking(b)}>
                      <td style={{ fontWeight: 500, paddingLeft: 40 }}>↳ {b.first_name} {b.last_name}</td>
                      <td><span className="badge badge-primary">{b.unit_name}</span></td>
                      <td>{b.check_in}</td><td>{b.check_out}</td><td>{b.nights}</td>
                      <td><span className="flex items-center gap-2" style={{ fontSize: 12 }}><Users size={12} /> {b.adults}{b.children > 0 && <span style={{ color: 'var(--text-tertiary)' }}>+{b.children}</span>}</span></td>
                      <td><span className={`badge ${STATUS_MAP[b.status]?.badge || 'badge-info'}`}>{STATUS_MAP[b.status]?.label || b.status}</span></td>
                      <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: PAYMENT_STATUS_MAP[b.payment_status]?.color || '#888', background: PAYMENT_STATUS_MAP[b.payment_status]?.bg || 'rgba(128,128,128,0.1)' }}>{PAYMENT_STATUS_MAP[b.payment_status]?.label || b.payment_status}</span></td>
                      <td>
                        <span className="badge" style={{ background: (sourceMap[b.source]?.color || '#6c7086') + '22', color: sourceMap[b.source]?.color || '#6c7086' }}>{sourceMap[b.source]?.label || b.source}</span>
                        {b.hostex_channel_type && <span style={{ marginLeft: 4 }} title={`Hostex: ${b.hostex_channel_type}`}>🌐</span>}
                      </td>
                      <td><div style={{ fontWeight: 700 }}>{(b.total_price || 0).toLocaleString()} {b.currency || 'CZK'}</div>{(b.commission_amount || 0) > 0 && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>Комісія {(b.commission_amount || 0).toLocaleString()}</div>}</td>
                      <td><div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-sm btn-ghost btn-icon" title="Переглянути" onClick={() => openViewBooking(b)}><Eye size={14} /></button>
                      </div></td>
                    </tr>
                  );
                }
                // type === 'booking' — standalone
                const b = row.data;
                return (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => openViewBooking(b)}>
                    <td style={{ fontWeight: 500 }}>{b.first_name} {b.last_name}{b.sub_booking_count > 0 && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'rgba(99,102,241,0.12)', color: '#6366f1', fontWeight: 700 }}>👥 {b.sub_booking_count}</span>}</td>
                    <td><span className="badge badge-primary">{b.unit_name}</span></td>
                    <td>{b.check_in}</td><td>{b.check_out}</td><td>{b.nights}</td>
                    <td><span className="flex items-center gap-2" style={{ fontSize: 12 }}><Users size={12} /> {b.adults}{b.children > 0 && <span style={{ color: 'var(--text-tertiary)' }}>+{b.children}</span>}</span></td>
                    <td><span className={`badge ${STATUS_MAP[b.status]?.badge || 'badge-info'}`}>{STATUS_MAP[b.status]?.label || b.status}</span></td>
                    <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: PAYMENT_STATUS_MAP[b.payment_status]?.color || '#888', background: PAYMENT_STATUS_MAP[b.payment_status]?.bg || 'rgba(128,128,128,0.1)' }}>{PAYMENT_STATUS_MAP[b.payment_status]?.label || b.payment_status}</span></td>
                    <td>
                      <span className="badge" style={{ background: (sourceMap[b.source]?.color || '#6c7086') + '22', color: sourceMap[b.source]?.color || '#6c7086' }}>{sourceMap[b.source]?.label || b.source}</span>
                      {b.hostex_channel_type && <span style={{ marginLeft: 4 }} title={`Hostex: ${b.hostex_channel_type}`}>🌐</span>}
                    </td>
                    <td><div style={{ fontWeight: 700 }}>{(b.total_price || 0).toLocaleString()} {b.currency || 'CZK'}</div>{(b.commission_amount || 0) > 0 && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>Комісія {(b.commission_amount || 0).toLocaleString()}</div>}</td>
                    <td><div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-ghost btn-icon" title="Переглянути" onClick={() => openViewBooking(b)}><Eye size={14} /></button>
                      <button className="btn btn-sm btn-ghost btn-icon" title="Редагувати" onClick={() => openEditBooking(b)}><Edit3 size={14} /></button>
                      {b.guest_page_token && (
                        <button className="btn btn-sm btn-ghost btn-icon" title="Гостьова сторінка" style={{ color: 'var(--accent-primary)' }} onClick={() => window.open(`/guest/${b.guest_page_token}`, '_blank')}><ExternalLink size={14} /></button>
                      )}
                      <button className="btn btn-sm btn-ghost btn-icon" title="Видалити" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDelete(b.id)}><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Mobile Card List (improved Phase 3) ── */}
        <div className="mobile-only">
          {loading && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
              <Loader2 size={20} className="animate-pulse" style={{ display: 'inline-block' }} /> Завантаження...
            </div>
          )}
          {!loading && mergedBookingRows.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
              Нічого не знайдено
            </div>
          )}
          <div className="card-list">
            {mergedBookingRows.map((row, idx) => {
              if (row.type === 'group') {
                const g = row.data;
                const isExpanded = expandedGroups.has(g.id);
                const childCount = bookings.filter(bb => bb.group_id === g.id).length;
                return (
                  <div key={`grp-m-${g.id}`} style={{
                    padding: '10px 12px', borderRadius: 'var(--radius-md)',
                    background: 'rgba(99,102,241,0.08)', borderLeft: '4px solid var(--accent-primary)',
                    marginBottom: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button className="btn btn-sm btn-ghost btn-icon" style={{ padding: 2 }}
                        onClick={() => toggleGroup(g.id)}>
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                        {g.group_type === 'building' ? <Building2 size={16} /> : childCount}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }} onClick={() => setViewGroupId(g.id)}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{g.first_name} {g.last_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {g.check_in} → {g.check_out} · {g.nights} н. · {(g.total_price || 0).toLocaleString()} {g.currency || 'CZK'}
                        </div>
                      </div>
                      <span className={`badge ${STATUS_MAP[g.status]?.badge || 'badge-info'}`} style={{ fontSize: 10, flexShrink: 0 }}>
                        {STATUS_MAP[g.status]?.label || g.status}
                      </span>
                    </div>
                  </div>
                );
              }
              if (row.type === 'child') {
                if (!expandedGroups.has(row.groupId)) return null;
                const b = row.data;
                return (
                  <div key={b.id} className="booking-card" style={{ marginLeft: 20, borderLeft: '2px solid rgba(99,102,241,0.3)' }}
                    onClick={() => openViewBooking(b)}>
                    <div className="booking-card-row">
                      <div className="booking-card-source">
                        <SourceIcon source={b.source} size={36} iconColor={sourceMap[b.source]?.color}
                          iconLetter={bookingSources.find(s => s.code === b.source)?.icon_letter} />
                      </div>
                      <div className="booking-card-main">
                        <div className="booking-card-guest">↳ {b.first_name} {b.last_name}</div>
                        <div className="booking-card-meta"><Users size={11} /> {b.adults}</div>
                      </div>
                      <div className="booking-card-date">
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{b.check_in?.split('-').slice(1).join('/')}</div>
                      </div>
                    </div>
                    <div className="booking-card-body">
                      <div>
                        <div className="booking-card-unit">{b.unit_name}</div>
                        <div className="booking-card-price">{(b.total_price || 0).toLocaleString()} {b.currency || 'CZK'}</div>
                      </div>
                      <span className={`badge ${STATUS_MAP[b.status]?.badge || 'badge-info'}`}>{STATUS_MAP[b.status]?.label || b.status}</span>
                    </div>
                  </div>
                );
              }
              // standalone booking
              const b = row.data;
              return (
                <div key={b.id} className="booking-card" onClick={() => openViewBooking(b)}>
                  <div className="booking-card-row">
                    <div className="booking-card-source">
                      <SourceIcon source={b.source} size={36}
                        iconColor={sourceMap[b.source]?.color}
                        iconLetter={bookingSources.find(s => s.code === b.source)?.icon_letter} />
                    </div>
                    <div className="booking-card-main">
                      <div className="booking-card-guest">{b.first_name} {b.last_name}</div>
                      <div className="booking-card-meta">
                        <Users size={11} /> {b.adults}{b.children > 0 ? `+${b.children}` : ''}
                        {b.guest_phone && <> · <Phone size={10} /> {b.guest_phone}</>}
                      </div>
                    </div>
                    <div className="booking-card-date">
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{b.check_in?.split('-').slice(1).join('/')}</div>
                    </div>
                  </div>
                  <div className="booking-card-body">
                    <div>
                      <div className="booking-card-unit">{b.unit_name}</div>
                      <div className="booking-card-unit-sub">{b.category_name || b.category_type || ''}</div>
                      <div className="booking-card-price">
                        {(b.total_price || 0).toLocaleString()} {b.currency || 'CZK'}
                        <span style={{ marginLeft: 6, display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, color: PAYMENT_STATUS_MAP[b.payment_status]?.color || '#888', background: PAYMENT_STATUS_MAP[b.payment_status]?.bg || 'rgba(128,128,128,0.1)' }}>
                          {PAYMENT_STATUS_MAP[b.payment_status]?.label || b.payment_status}
                        </span>
                      </div>
                      {(b.commission_amount || 0) > 0 && (
                        <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>Комісія {(b.commission_amount || 0).toLocaleString()}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div className="booking-card-date">
                        <div>{b.check_in}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>▼</div>
                        <div>{b.check_out}</div>
                      </div>
                      {(b.status === 'confirmed' || b.status === 'tentative') && (
                        <button className="mobile-action-btn" onClick={(e) => { e.stopPropagation(); changeStatus(b.id, 'checked_in'); }}>Реєстрація</button>
                      )}
                      {b.status !== 'confirmed' && b.status !== 'tentative' && (
                        <span className={`badge ${STATUS_MAP[b.status]?.badge || 'badge-info'}`}>{STATUS_MAP[b.status]?.label || b.status}</span>
                      )}
                      {b.guest_page_token && (
                        <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-primary)' }} title="Гостьова сторінка" onClick={(e) => { e.stopPropagation(); window.open(`/guest/${b.guest_page_token}`, '_blank'); }}>
                          <ExternalLink size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* View Modal — Pipeline Design */}
        {viewBooking && (
          <BookingViewModal
            booking={viewBooking}
            payments={payments}
            registrations={registrations}
            activityLog={activityLog}
            sourceMap={sourceMap}
            onClose={() => setViewBooking(null)}
            onEdit={() => { openEditBooking(viewBooking); setViewBooking(null); }}
            onChangeStatus={changeStatus}
            onFetchPayments={fetchPayments}
            onFetchBookings={fetchBookings}
            onFetchRegistrations={fetchRegistrations}
            showToast={showToast}
            setBooking={setViewBooking}
          />
        )}

        {/* New Booking Modal */}
        <Modal open={showNewBooking} onClose={() => setShowNewBooking(false)} title="Нове бронювання" size="lg">
          {showNewBooking && (
            <BookingForm
              mode="create"
              unitTypes={unitTypes}
              allUnits={allUnits}
              bookingSources={bookingSources}
              widgetSources={widgetSources}
              onSaved={() => {
                setShowNewBooking(false);
                showToast('Бронювання створено!');
                fetchBookings();
              }}
              onCancel={() => setShowNewBooking(false)}
            />
          )}
        </Modal>

        {/* Edit Booking Modal */}
        <Modal open={!!editBooking} onClose={() => setEditBooking(null)} title="Редагувати бронювання" size="lg">
          {editBooking && (
            <BookingForm
              mode="edit"
              bookingId={editBooking.id}
              initial={editInitial}
              currency={editBooking.currency || 'CZK'}
              unitTypes={unitTypes}
              allUnits={allUnits}
              bookingSources={bookingSources}
              widgetSources={widgetSources}
              onSaved={() => {
                const closingId = editBooking.id;
                setEditBooking(null);
                showToast(`Бронювання ${closingId} оновлено!`);
                fetchBookings();
              }}
              onCancel={() => setEditBooking(null)}
            />
          )}
        </Modal>

        {/* Group Booking Create Modal */}
        <GroupBookingModal
          open={showGroupModal}
          onClose={() => setShowGroupModal(false)}
          onCreated={() => { fetchBookings(); fetchGroupBookings(); showToast('Групове бронювання створено!'); }}
          bookingSources={bookingSources}
        />

        {/* Group View Modal */}
        <GroupViewModal
          groupId={viewGroupId}
          onClose={() => setViewGroupId(null)}
          onUpdated={() => { fetchBookings(); fetchGroupBookings(); }}
        />
      </div>
    </>
  );
}
