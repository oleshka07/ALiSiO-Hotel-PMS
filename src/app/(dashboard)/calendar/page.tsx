'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { useDevice } from '@/lib/useDevice';
import MobileCalendar from '@/components/mobile/pages/MobileCalendar';
import GroupBookingModal from '@/components/booking/GroupBookingModal';
import RoomAllocationModal from '@/components/booking/RoomAllocationModal';
import BookingViewModal from '@/components/booking/BookingViewModal';
import BookingForm from '@/components/booking/BookingForm';
import {
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Tent,
  Building2,
  TreePine,
  Plus,
  Eye,
  Edit3,
  Save,
  X,
  Loader2,
  RefreshCw,
  Users,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  CalendarDays,
  Download,
  FileSpreadsheet,
  Coins,
  FileText,
} from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ────────────────────────────────────────────────
interface UnitRow {
  id: string; name: string; code: string; beds: number;
  category_type: string; category_name: string;
  unit_type_name: string; unit_type_id: string;
  building_name?: string; building_code?: string;
  zone?: string; room_status: string; cleaning_status: string;
}

interface BookingRow {
  id: string; unit_id: string; check_in: string; check_out: string;
  nights: number; adults: number; children: number;
  status: string; payment_status: string; source: string; total_price: number; currency: string;
  first_name: string; last_name: string;
  guest_email?: string; guest_phone?: string;
  unit_name: string; unit_code: string;
  category_name: string; category_type: string;
  unit_type_id?: string; unit_type_name?: string;
  notes?: string | null;
  parent_id?: string | null;
  hostex_channel_type?: string;
  hostex_reservation_code?: string;
  registration_status?: string;
}

// ─── Constants ────────────────────────────────────────────
const ZOOM_LEVELS = {
  week:    { dayW: 72, totalDays: 42, label: 'Тиждень' },
  month:   { dayW: 44, totalDays: 90, label: 'Місяць' },
  quarter: { dayW: 24, totalDays: 180, label: 'Квартал' },
} as const;
type ZoomLevel = keyof typeof ZOOM_LEVELS;

const ROW_H = 38;
const GROUP_H = 30;
const HEADER_H = 48;
const AVAIL_H = 24;
const LEFT_W = 180;

const DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Чернетка', badge: 'badge-info' },
  tentative: { label: 'Очікується', badge: 'badge-warning' },
  confirmed: { label: 'Підтверджено', badge: 'badge-success' },
  checked_in: { label: 'Заселено', badge: 'badge-primary' },
  checked_out: { label: 'Виселено', badge: 'badge-info' },
  cancelled: { label: 'Скасовано', badge: 'badge-danger' },
};

// SOURCE_MAP is built dynamically from /api/booking-sources

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  unpaid: { label: 'Не оплачено', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: '✗' },
  payment_requested: { label: 'Запит на оплату', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: '✉' },
  prepaid: { label: 'Передплата', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: '◓' },
  paid: { label: 'Оплачено', color: '#22c55e', bg: 'rgba(34,197,94,0.15)', icon: '✓' },
};

const CLEAN_MAP: Record<string, { label: string; color: string }> = {
  clean: { label: '✓', color: '#34d399' },
  dirty: { label: '✗', color: '#f87171' },
  in_progress: { label: '⟳', color: '#fbbf24' },
};

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  glamping: { label: 'Glamping', icon: <Tent size={14} />, color: '#a78bfa' },
  resort: { label: 'Resort', icon: <Building2 size={14} />, color: '#60a5fa' },
  camping: { label: 'Camping', icon: <TreePine size={14} />, color: '#34d399' },
};

const statusColors: Record<string, string> = {
  draft: '#6c7086',
  tentative: '#fbbf24',
  confirmed: '#34d399',
  checked_in: '#60a5fa',
  checked_out: '#a78bfa',
  cancelled: '#f87171',
};

// ─── Date helpers ─────────────────────────────────────────
function getDays(start: Date, count: number): Date[] {
  const arr: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    arr.push(d);
  }
  return arr;
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function isWeekend(d: Date): boolean { return d.getDay() === 0 || d.getDay() === 6; }

// ─── Main Component ──────────────────────────────────────
export default function CalendarPage() {
  const { isMobile } = useDevice();
  if (isMobile) return <MobileCalendar />;
  return <CalendarDesktop />;
}

function CalendarDesktop() {
  // ─── State ──────
  const onMenuClick = useMobileMenu();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('calendar_categoryFilter') || 'resort';
    return 'resort';
  });

  useEffect(() => {
    localStorage.setItem('calendar_categoryFilter', categoryFilter);
  }, [categoryFilter]);
  const [statusFilter, setStatusFilter] = useState('');
  const [cleaningFilter, setCleaningFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [viewBooking, setViewBooking] = useState<BookingRow | null>(null);
  const [editBooking, setEditBooking] = useState<BookingRow | null>(null);
  const [calPayments, setCalPayments] = useState<any[]>([]);
  const [calRegistrations, setCalRegistrations] = useState<any[]>([]);
  const [calActivityLog, setCalActivityLog] = useState<any[]>([]);
  const [bookingSources, setBookingSources] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<{ id: string; unit_id: string; date_from: string; date_to: string; notes: string }[]>([]);
  const [toast, setToast] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', type: 'partial', notes: '' });

  // Modals
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showRoomAllocation, setShowRoomAllocation] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Zoom & Navigation
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [navOffset, setNavOffset] = useState(0); // weeks offset from today

  // Two-click date range selection
  const [rangeStart, setRangeStart] = useState<{ unitId: string; date: string } | null>(null);

  // Booking form data
  const [unitTypes, setUnitTypes] = useState<any[]>([]);
  const [allUnits, setAllUnits] = useState<any[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, Record<string, number>>>({});
  const [newBookingPrefill, setNewBookingPrefill] = useState<{
    category?: string; unitTypeId?: string; unitId?: string; checkIn?: string; checkOut?: string;
  } | null>(null);
  const [tooltip, setTooltip] = useState<{ booking: BookingRow; x: number; y: number } | null>(null);

  // Build dynamic source map
  const sourceMap = useMemo(() => {
    const map: Record<string, { label: string; color: string }> = {};
    for (const s of bookingSources) {
      map[s.code] = { label: s.name, color: s.color };
    }
    return map;
  }, [bookingSources]);

  const CZK_TO_EUR = 23.5;
  const toEur = (czk: number) => (czk / CZK_TO_EUR).toFixed(1);
  const METHOD_LABELS: Record<string, string> = {
    cash: '💵 Готівка', card: '💳 Картою',
    bank_transfer: '🏦 На рахунок', invoice: '📄 Фактура', online: '🌐 Онлайн',
    booking_platform: '🏨 Платформа бронювання',
  };
  const TYPE_LABELS: Record<string, string> = {
    deposit: 'Передпл.', full: 'Повна', partial: 'Частк.', refund: 'Поверн.',
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const availRef = useRef<HTMLDivElement>(null);

  // Dynamic timeline based on zoom + navigation
  const zoomCfg = ZOOM_LEVELS[zoom];
  const DAY_W = zoomCfg.dayW;
  const TOTAL_DAYS = zoomCfg.totalDays;
  const timelineStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14 + navOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [navOffset]);
  const days = useMemo(() => getDays(timelineStart, TOTAL_DAYS), [timelineStart, TOTAL_DAYS]);
  const todayIndex = useMemo(() => days.findIndex(d => isToday(d)), [days]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ─── Fetch data ──────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [unitsRes, bookingsRes, sourcesRes, utRes] = await Promise.all([
        fetch('/api/units'),
        fetch('/api/bookings'),
        fetch('/api/booking-sources'),
        fetch('/api/unit-types'),
      ]);
      const u = await unitsRes.json();
      const b = await bookingsRes.json();
      const srcs = await sourcesRes.json();
      const uts = await utRes.json();
      if (Array.isArray(u)) { setUnits(u); setAllUnits(u); }
      if (Array.isArray(b)) setBookings(b);
      if (Array.isArray(srcs)) setBookingSources(srcs);
      if (Array.isArray(uts)) setUnitTypes(uts);
      // Fetch availability blocks (host closures)
      try {
        const blkRes = await fetch('/api/availability-blocks');
        if (blkRes.ok) {
          const blk = await blkRes.json();
          if (Array.isArray(blk)) setBlocks(blk);
        }
      } catch { /* ignore */ }
    } catch (e) { console.error('Calendar fetch error:', e); }
    // Fetch draft pool count
    try {
      const dcRes = await fetch('/api/booking/drafts-count');
      if (dcRes.ok) {
        const dcData = await dcRes.json();
        setDraftCount(dcData.count || 0);
      }
    } catch { /* non-critical */ }
    setLoading(false);
  }, []);

  // Fetch prices for visible range
  const fetchPrices = useCallback(async () => {
    try {
      const startStr = fmtDate(days[0]);
      const endStr = fmtDate(days[days.length - 1]);
      const res = await fetch(`/api/pricing/bulk?startDate=${startStr}&endDate=${endStr}`);
      if (res.ok) {
        const data = await res.json();
        // data is array of { unit_type_id, date, effective_price }
        const map: Record<string, Record<string, number>> = {};
        if (Array.isArray(data)) {
          for (const row of data) {
            if (!map[row.unit_type_id]) map[row.unit_type_id] = {};
            map[row.unit_type_id][row.date] = row.effective_price || row.base_price || 0;
          }
        }
        setPriceMap(map);
      }
    } catch (e) { console.error('Price fetch error:', e); }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (days.length > 0) fetchPrices(); }, [days, fetchPrices]);

  // ─── Scroll to today on mount (today = ~2nd column) ──────
  useEffect(() => {
    if (!loading && scrollRef.current && todayIndex >= 0) {
      scrollRef.current.scrollLeft = Math.max(0, todayIndex * DAY_W - DAY_W);
    }
  }, [loading, todayIndex]);

  // ─── Keyboard shortcuts ──────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') {
        setViewBooking(null); setEditBooking(null); setShowNewBooking(false); setShowGroupModal(false); setRangeStart(null);
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setNavOffset(p => p - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setNavOffset(p => p + 1); }
      if (e.key === 't' || e.key === 'T') scrollToToday();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);



  // ─── Sync scroll ──────
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    if (leftRef.current) leftRef.current.scrollTop = scrollRef.current.scrollTop;
    if (headerRef.current) headerRef.current.scrollLeft = scrollRef.current.scrollLeft;
    if (availRef.current) availRef.current.scrollLeft = scrollRef.current.scrollLeft;
  }, []);

  // ─── Filter units ──────
  const filteredUnits = useMemo(() => {
    return units.filter(u => {
      if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.code.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter && u.category_type !== categoryFilter) return false;
      if (cleaningFilter && u.cleaning_status !== cleaningFilter) return false;
      return true;
    });
  }, [units, search, categoryFilter, cleaningFilter]);

  const filteredBookings = useMemo(() => {
    // Always hide cancelled bookings from calendar (they sync to external platforms)
    let result = bookings.filter(b => b.status !== 'cancelled');
    if (statusFilter) result = result.filter(b => b.status === statusFilter);
    if (paymentFilter) result = result.filter(b => b.payment_status === paymentFilter);
    return result;
  }, [bookings, statusFilter, paymentFilter]);

  // ─── Group units ──────
  const groups = useMemo(() => {
    const result: { key: string; label: string; category: string; units: UnitRow[] }[] = [];
    const cats = ['glamping', 'resort', 'camping'];
    for (const cat of cats) {
      const catUnits = filteredUnits.filter(u => u.category_type === cat);
      if (catUnits.length === 0) continue;
      if (cat === 'resort') {
        const bldgs = [...new Set(catUnits.map(u => u.building_name || 'Other'))];
        for (const b of bldgs) {
          const bUnits = catUnits.filter(u => u.building_name === b);
          result.push({ key: `resort-${b}`, label: `Resort / ${b}`, category: cat, units: bUnits });
        }
      } else if (cat === 'camping') {
        const zones = [...new Set(catUnits.map(u => u.zone || 'Other'))];
        for (const z of zones) {
          const zUnits = catUnits.filter(u => u.zone === z);
          result.push({ key: `camping-${z}`, label: `Camping / ${z}`, category: cat, units: zUnits });
        }
      } else {
        result.push({ key: cat, label: categoryConfig[cat]?.label || cat, category: cat, units: catUnits });
      }
    }
    return result;
  }, [filteredUnits]);

  // ─── Flat unit list (for row indexing) ──────
  const flatRows = useMemo(() => {
    const rows: { type: 'group'; key: string; label: string; category: string; count: number }[] | { type: 'unit'; unit: UnitRow }[] = [];
    const allRows: any[] = [];
    for (const g of groups) {
      allRows.push({ type: 'group', key: g.key, label: g.label, category: g.category, count: g.units.length });
      if (!collapsed[g.key]) {
        for (const u of g.units) allRows.push({ type: 'unit', unit: u });
      }
    }
    return allRows;
  }, [groups, collapsed]);

  // ─── Booking for a unit ──────
  const getUnitBookings = useCallback((unitId: string) => {
    return filteredBookings.filter(b => b.unit_id === unitId);
  }, [filteredBookings]);

  // ─── Booking bar style ──────
  const getBarStyle = useCallback((b: BookingRow) => {
    const ci = new Date(b.check_in + 'T00:00:00');
    const co = new Date(b.check_out + 'T00:00:00');
    const start = days[0];
    const end = days[days.length - 1];
    if (co <= start || ci > end) return null;
    const startIdx = Math.max(0, Math.round((ci.getTime() - start.getTime()) / 86400000));
    const endIdx = Math.min(days.length, Math.round((co.getTime() - start.getTime()) / 86400000));
    // Airbnb-style offset: bar starts 40% into check-in cell, extends 40% into check-out cell
    // For 2-night stay (4→6): left at 4.4*W, right at 6.4*W → width = 2*DAY_W
    const OFFSET = Math.round(DAY_W * 0.4);
    return { left: startIdx * DAY_W + OFFSET, width: (endIdx - startIdx) * DAY_W };
  }, [days]);

  // ─── Count free units per day ──────
  const freePerDay = useMemo(() => {
    return days.map(day => {
      const dateStr = fmtDate(day);
      const booked = new Set(filteredBookings.filter(b => dateStr >= b.check_in && dateStr < b.check_out).map(b => b.unit_id));
      return filteredUnits.length - booked.size;
    });
  }, [days, filteredBookings, filteredUnits]);

  // ─── Occupancy rate per day (for heatmap) ──────
  const occupancyRate = useMemo(() => {
    if (filteredUnits.length === 0) return days.map(() => 0);
    return days.map((_, i) => {
      const free = freePerDay[i];
      return 1 - (free / filteredUnits.length);
    });
  }, [days, freePerDay, filteredUnits]);


  // ─── Toggle group ──────
  const toggleGroup = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  // ─── Today alerts ──────
  const todayAlerts = useMemo(() => {
    const todayStr = fmtDate(new Date());
    const checkIns = bookings.filter(b => b.check_in === todayStr && b.status !== 'cancelled');
    const checkOuts = bookings.filter(b => b.check_out === todayStr && b.status !== 'cancelled');
    const unpaid = bookings.filter(b => (b.payment_status === 'unpaid' || b.payment_status === 'partial') && b.status !== 'cancelled' && b.check_in >= todayStr);
    return { checkIns, checkOuts, unpaid };
  }, [bookings]);

  // ─── Scroll to today ──────
  const scrollToToday = () => {
    setNavOffset(0);
    setTimeout(() => {
      if (scrollRef.current) {
        const idx = days.findIndex(d => isToday(d));
        if (idx >= 0) scrollRef.current.scrollLeft = Math.max(0, idx * DAY_W - DAY_W);
      }
    }, 50);
  };

  // ─── Cell click handler (two-click range) ──────
  const handleCellClick = (unitId: string, day: Date) => {
    const dateStr = fmtDate(day);
    const unit = units.find(u => u.id === unitId);
    if (!rangeStart || rangeStart.unitId !== unitId) {
      setRangeStart({ unitId, date: dateStr });
    } else {
      let ci = rangeStart.date;
      let co = dateStr;
      if (co <= ci) { const tmp = ci; ci = co; co = tmp; }
      if (ci === co) {
        const nd = new Date(day); nd.setDate(nd.getDate() + 1);
        co = fmtDate(nd);
      }
      setRangeStart(null);
      setNewBookingPrefill({
        unitId,
        category: unit?.category_type,
        unitTypeId: unit?.unit_type_id,
        checkIn: ci,
        checkOut: co,
      });
      setShowNewBooking(true);
    }
  };

  // ─── View booking modal ──────
  const fetchCalPayments = useCallback(async (resId: string) => {
    try {
      const res = await fetch(`/api/payments?reservation_id=${resId}`);
      const data = await res.json();
      if (Array.isArray(data)) setCalPayments(data);
    } catch (e) { console.error('Failed to fetch payments', e); }
  }, []);

  const openBookingDetails = async (bookingId: string) => {
    try {
      const [bookRes, payRes, regRes, actRes] = await Promise.all([
        fetch(`/api/bookings/${bookingId}`),
        fetch(`/api/payments?reservation_id=${bookingId}`),
        fetch(`/api/bookings/${bookingId}/registrations`),
        fetch(`/api/bookings/${bookingId}/activity`),
      ]);
      if (bookRes.ok) {
        const data = await bookRes.json();
        setViewBooking(data);
        setShowPayForm(false);
      }
      const payData = await payRes.json();
      if (Array.isArray(payData)) setCalPayments(payData);
      const regData = await regRes.json().catch(() => []);
      if (Array.isArray(regData)) setCalRegistrations(regData);
      const actData = await actRes.json().catch(() => []);
      if (Array.isArray(actData)) setCalActivityLog(actData);
    } catch (e) { console.error(e); }
  };

  // ─── Status change ──────
  const changeStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchData();
        if (viewBooking && viewBooking.id === id) {
          setViewBooking({ ...viewBooking, status: newStatus });
        }
        showToast('Статус оновлено');
      }
    } catch (e) { console.error(e); }
  };

  // ─── Open Edit ──────
  const openEditBooking = (b: BookingRow) => {
    setEditBooking(b);
    setViewBooking(null);
  };

  const editInitial = useMemo(() => {
    if (!editBooking) return undefined;
    const b = editBooking as any;
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
      commissionAmount: String(b.commission_amount || ''),
      cityTaxAmount: String(b.city_tax_amount || ''),
      cityTaxIncluded: !!b.city_tax_included,
      cityTaxPaid: b.city_tax_paid || 'pending',
      internalNotes: b.internal_notes || '',
    };
  }, [editBooking]);

  // ─── Total width ──────
  const totalW = TOTAL_DAYS * DAY_W;

  if (loading) {
    return (
      <>
        <Header title="Календар" onMenuClick={onMenuClick} />
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <Loader2 size={24} className="animate-pulse" /> <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>Завантаження...</span>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Календар" onMenuClick={onMenuClick} />
      <div className="app-content" style={{ padding: '16px 24px', paddingTop: 'calc(var(--header-height) + 16px)', display: 'grid', gridTemplateRows: 'auto auto 1fr', height: 'calc(100vh - 16px)', overflow: 'hidden' }}>

        {/* ─── Toolbar ───────────────────── */}
        <div style={{
          flexShrink: 0, padding: '8px 12px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', borderBottom: 'none',
          display: 'flex', flexDirection: 'column', gap: 6,
          overflow: 'hidden', boxSizing: 'border-box',
        }}>
          {/* Row 1: Nav + Month + Zoom + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setNavOffset(p => p - 2)} title="−2 тижні" style={{ padding: '4px 6px' }}><ChevronLeft size={14} /><ChevronLeft size={14} style={{ marginLeft: -8 }} /></button>
              <button className="btn btn-secondary btn-sm" onClick={() => setNavOffset(p => p - 1)} title="−1 тиждень" style={{ padding: '4px 6px' }}><ChevronLeft size={14} /></button>
              <button className="btn btn-secondary btn-sm" onClick={scrollToToday} style={{ fontSize: 11, padding: '4px 8px' }}>Сьогодні</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setNavOffset(p => p + 1)} title="+1 тиждень" style={{ padding: '4px 6px' }}><ChevronRight size={14} /></button>
              <button className="btn btn-secondary btn-sm" onClick={() => setNavOffset(p => p + 2)} title="+2 тижні" style={{ padding: '4px 6px' }}><ChevronRight size={14} /><ChevronRight size={14} style={{ marginLeft: -8 }} /></button>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginLeft: 8, whiteSpace: 'nowrap' }}>
                {MONTH_NAMES[timelineStart.getMonth()]} – {MONTH_NAMES[days[days.length - 1]?.getMonth()]} {days[days.length - 1]?.getFullYear()}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* Zoom */}
              <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
                {(Object.keys(ZOOM_LEVELS) as ZoomLevel[]).map(z => (
                  <button key={z} onClick={() => setZoom(z)} style={{
                    padding: '3px 8px', fontSize: 11, fontWeight: zoom === z ? 700 : 400, border: 'none', cursor: 'pointer',
                    background: zoom === z ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: zoom === z ? '#fff' : 'var(--text-secondary)',
                  }}>{ZOOM_LEVELS[z].label}</button>
                ))}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => fetchData()} title="Оновити дані" style={{ padding: '4px 6px' }}><RefreshCw size={14} /></button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  setSyncing(true);
                  try {
                    const res = await fetch('/api/hostex/sync', { method: 'POST' });
                    const data = await res.json();
                    await fetchData();
                    let msg = `✅ Hostex: +${data.created || 0} нових, ${data.updated || 0} оновлено`;
                    if (data.unmappedProperties?.length) {
                      msg += `\n⚠️ ${data.unmappedProperties.length} непривʼязаних: ${data.unmappedProperties.map((p: any) => `${p.title} (id:${p.id})`).join(', ')}`;
                    }
                    if (data.error) msg = `❌ ${data.error}`;
                    showToast(msg);
                  } catch { showToast('❌ Помилка синхронізації'); }
                  setSyncing(false);
                }}
                disabled={syncing}
                title="Синхронізувати з Hostex"
                style={{ padding: '4px 8px', fontSize: 11, gap: 4, opacity: syncing ? 0.6 : 1 }}
              >
                {syncing ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <span>🔄</span>}
                {syncing ? ' Синх...' : ' Hostex'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowGroupModal(true)} style={{ fontSize: 11, padding: '4px 8px', gap: 4 }}><Users size={14} /> Групове</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowRoomAllocation(true)} title="Розселення по кімнатах (Building View)" style={{ fontSize: 11, padding: '4px 8px', gap: 4 }}><Building2 size={14} /> Будова</button>
              {draftCount > 0 && (
                <button
                  className="draft-pool-badge"
                  onClick={() => setShowRoomAllocation(true)}
                  title={`${draftCount} бронювань у чорновику — натисніть для розподілу`}
                >
                  📋 {draftCount} в чорновику
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setShowExportModal(true)} title="Скачати звіт" style={{ fontSize: 11, padding: '4px 8px', gap: 4 }}><Download size={14} /> Звіт</button>
              <button className="btn btn-primary btn-sm" onClick={() => { setNewBookingPrefill(null); setShowNewBooking(true); }} style={{ fontSize: 11, padding: '4px 8px', gap: 4 }}><Plus size={14} /> Нове</button>
            </div>
          </div>

          {/* Row 2: Filters + Range indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <select className="form-select" style={{ width: 100, fontSize: 11, padding: '4px 6px' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="">Категорії</option>
              <option value="glamping">Glamping</option>
              <option value="resort">Resort</option>
              <option value="camping">Camping</option>
            </select>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input className="form-input" placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ fontSize: 11, padding: '4px 8px 4px 22px', width: 120 }} />
            </div>
            <select className="form-select" style={{ width: 110, fontSize: 11, padding: '4px 6px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">Статуси</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
            </select>
            <select className="form-select" style={{ width: 110, fontSize: 11, padding: '4px 6px' }} value={cleaningFilter} onChange={e => setCleaningFilter(e.target.value)}>
              <option value="">🧹 Все</option>
              <option value="clean">✓ Чисто</option>
              <option value="dirty">✗ Брудно</option>
              <option value="in_progress">⟳ Прибір.</option>
            </select>
            <select className="form-select" style={{ width: 110, fontSize: 11, padding: '4px 6px' }} value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
              <option value="">💰 Все</option>
              {Object.entries(PAYMENT_STATUS_MAP).map(([k, v]) => (<option key={k} value={k}>{v.icon} {v.label}</option>))}
            </select>
            {rangeStart && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600 }}>
                <CalendarDays size={12} /> Заїзд: {rangeStart.date} — оберіть виїзд
                <button className="btn btn-ghost btn-sm" onClick={() => setRangeStart(null)} style={{ padding: '2px 6px', fontSize: 10 }}><X size={10} /> Скасувати</button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Today Alerts Banner ─── */}
        {!loading && (todayAlerts.checkIns.length > 0 || todayAlerts.checkOuts.length > 0 || todayAlerts.unpaid.length > 0) && (
          <div style={{ display: 'flex', gap: 12, padding: '6px 12px', fontSize: 11, fontWeight: 600, flexWrap: 'wrap', borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', margin: '0 0 4px 0' }}>
            {todayAlerts.checkIns.length > 0 && <span style={{ color: 'var(--accent-success)' }}>✈ {todayAlerts.checkIns.length} заїздів сьогодні</span>}
            {todayAlerts.checkOuts.length > 0 && <span style={{ color: 'var(--accent-primary)' }}>🚶 {todayAlerts.checkOuts.length} виїздів сьогодні</span>}
            {todayAlerts.unpaid.length > 0 && <span style={{ color: 'var(--accent-warning)' }}>⚠ {todayAlerts.unpaid.length} неоплачених</span>}
          </div>
        )}

        {/* ─── Calendar Grid ───────────────── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          minWidth: 0, width: '100%',
          border: '1px solid var(--border-primary)', borderTop: '1px solid var(--border-primary)',
          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', background: 'var(--bg-card)',
        }}>
          {/* Top section: fixed header + dates */}
          <div style={{ display: 'flex', flexShrink: 0, minWidth: 0, overflow: 'hidden' }}>
            {/* Top-left corner */}
            <div style={{
              width: LEFT_W, minWidth: LEFT_W, height: HEADER_H + AVAIL_H,
              borderRight: '1px solid var(--border-primary)', borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ height: HEADER_H, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                Юніти ({filteredUnits.length})
              </div>
              <div style={{ height: AVAIL_H, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, borderTop: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)' }}>
                Вільних
              </div>
            </div>

            {/* Date headers */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div ref={headerRef} style={{ overflowX: 'hidden', overflowY: 'hidden' }}>
                {/* Date cells */}
                <div style={{ display: 'flex', width: totalW, height: HEADER_H, borderBottom: '1px solid var(--border-primary)' }}>
                  {days.map((day, i) => {
                    const isTd = isToday(day);
                    const isWknd = isWeekend(day);
                    const showMonth = i === 0 || day.getDate() === 1;
                    return (
                      <div key={i} style={{
                        width: DAY_W, minWidth: DAY_W, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', fontSize: 11,
                        borderRight: '1px solid var(--border-primary)',
                        borderLeft: isTd ? '2px solid var(--accent-primary)' : 'none',
                        borderRightColor: isTd ? 'var(--accent-primary)' : 'var(--border-primary)',
                        background: isTd ? 'rgba(96, 165, 250, 0.08)' : isWknd ? 'rgba(255,255,255,0.02)' : 'transparent',
                        position: 'relative',
                      }}>
                        {showMonth && <div style={{ fontSize: 9, color: 'var(--accent-primary)', fontWeight: 700, position: 'absolute', top: 1, left: 2, background: 'var(--bg-secondary)', padding: '0 3px', borderRadius: 2, zIndex: 2, whiteSpace: 'nowrap' }}>{MONTH_NAMES[day.getMonth()].substring(0, 3)}</div>}
                        <div style={{ fontWeight: isTd ? 800 : 600, color: isTd ? 'var(--accent-primary)' : 'var(--text-primary)', marginTop: showMonth ? 8 : 0, fontSize: zoom === 'quarter' ? 9 : 11 }}>{day.getDate()}</div>
                        {zoom !== 'quarter' && <div style={{ fontSize: 9, color: isWknd ? 'var(--accent-danger)' : 'var(--text-tertiary)' }}>{DAY_NAMES[day.getDay()]}</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Availability row */}
                <div style={{ display: 'flex', width: totalW, height: AVAIL_H, borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)' }}>
                  {days.map((day, i) => {
                    const free = freePerDay[i];
                    const isTd = isToday(day);
                    return (
                      <div key={i} style={{
                        width: DAY_W, minWidth: DAY_W, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700,
                        color: free <= 0 ? 'var(--accent-danger)' : free <= 10 ? 'var(--accent-warning)' : 'var(--accent-success)',
                        borderRight: '1px solid var(--border-primary)',
                        borderLeft: isTd ? '2px solid var(--accent-primary)' : 'none',
                        borderRightColor: isTd ? 'var(--accent-primary)' : 'var(--border-primary)',
                        background: isTd ? 'rgba(96, 165, 250, 0.08)'
                          : occupancyRate[i] >= 0.9 ? 'rgba(239,68,68,0.12)'
                          : occupancyRate[i] >= 0.7 ? 'rgba(250,204,21,0.10)'
                          : occupancyRate[i] >= 0.4 ? 'rgba(34,197,94,0.06)'
                          : 'transparent',
                      }}>
                        {zoom !== 'quarter' ? Math.max(0, free) : (free <= 0 ? '×' : free)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom section: left panel + scrollable grid */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minWidth: 0 }}>
            {/* Left panel */}
            <div ref={leftRef} style={{
              width: LEFT_W, minWidth: LEFT_W, overflowY: 'hidden', overflowX: 'hidden',
              borderRight: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-start'
            }}>
              {groups.map(group => (
                <div key={group.key}>
                  {/* Group header */}
                  <div
                    onClick={() => toggleGroup(group.key)}
                    style={{
                      height: GROUP_H, display: 'flex', alignItems: 'center', gap: 6,
                      padding: '0 10px', cursor: 'pointer', background: 'var(--bg-tertiary)',
                      borderBottom: '1px solid var(--border-primary)', fontSize: 12, fontWeight: 600,
                    }}
                  >
                    {collapsed[group.key] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span style={{ color: categoryConfig[group.category]?.color || 'var(--text-primary)' }}>
                      {categoryConfig[group.category]?.icon}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>{group.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>({group.units.length})</span>
                  </div>

                  {/* Unit rows */}
                  {!collapsed[group.key] && group.units.map(unit => (
                    <div key={unit.id} style={{
                      height: ROW_H, display: 'flex', alignItems: 'center', gap: 8,
                      padding: '0 10px', borderBottom: '1px solid var(--border-primary)',
                      fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{unit.name}</div>
                        {unit.beds > 0 && <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{unit.beds} місць</div>}
                      </div>
                      {/* Cleaning status indicator */}
                      <div title={`Прибирання: ${unit.cleaning_status}`} style={{
                        fontSize: 12, fontWeight: 700, width: 18, textAlign: 'center',
                        color: CLEAN_MAP[unit.cleaning_status]?.color || 'var(--text-tertiary)',
                      }}>
                        {CLEAN_MAP[unit.cleaning_status]?.label || '?'}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Scrollable grid */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              style={{ flex: 1, overflow: 'auto' }}
            >
              <div style={{ width: totalW, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                {groups.map(group => (
                  <div key={group.key}>
                    {/* Group spacer */}
                    <div style={{ height: GROUP_H, display: 'flex', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-primary)' }}>
                      {days.map((day, i) => {
                        const isTd = isToday(day);
                        return (
                          <div key={i} style={{
                            width: DAY_W, minWidth: DAY_W, height: GROUP_H,
                            borderRight: '1px solid var(--border-primary)',
                            borderLeft: isTd ? '2px solid var(--accent-primary)' : 'none',
                            borderRightColor: isTd ? 'var(--accent-primary)' : 'var(--border-primary)',
                            background: isTd ? 'rgba(96, 165, 250, 0.06)' : 'transparent',
                          }} />
                        );
                      })}
                    </div>

                    {/* Unit rows */}
                    {!collapsed[group.key] && group.units.map(unit => {
                      const unitBookings = getUnitBookings(unit.id);
                      return (
                        <div key={unit.id} style={{ height: ROW_H, position: 'relative', display: 'flex', borderBottom: '1px solid var(--border-primary)' }}>
                          {/* Day grid cells */}
                          {days.map((day, i) => {
                            const isTd = isToday(day);
                            const isWknd = isWeekend(day);
                            const dateStr = fmtDate(day);
                            const isRangeStart = rangeStart?.unitId === unit.id && rangeStart?.date === dateStr;
                            return (
                              <div key={i} style={{
                                width: DAY_W, minWidth: DAY_W, height: ROW_H,
                                borderRight: '1px solid var(--border-primary)',
                                borderLeft: isTd ? '2px solid var(--accent-primary)' : 'none',
                                borderRightColor: isTd ? 'var(--accent-primary)' : 'var(--border-primary)',
                                background: isRangeStart ? 'rgba(96,165,250,0.25)' : isTd ? 'rgba(96, 165, 250, 0.06)' : isWknd ? 'rgba(255,255,255,0.015)' : 'transparent',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                                paddingBottom: 2,
                              }}
                              onClick={() => handleCellClick(unit.id, day)}
                              >
                                {/* Show nightly price if no booking occupies this cell */}
                                {(() => {
                                  const hasBooking = unitBookings.some(bk => dateStr >= bk.check_in && dateStr < bk.check_out);
                                  if (hasBooking) return null;
                                  const price = priceMap[unit.unit_type_id]?.[dateStr];
                                  if (!price) return null;
                                  return <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 500, opacity: 0.7 }}>{price}</span>;
                                })()}
                              </div>
                            );
                          })}

                          {/* Booking bars */}
                          {unitBookings.map(booking => {
                            const bar = getBarStyle(booking);
                            if (!bar) return null;
                            const srcColor = sourceMap[booking.source]?.color || '#6c7086';
                            const stColor = statusColors[booking.status] || '#6c7086';
                            return (
                              <div
                                key={booking.id}
                                onClick={() => openBookingDetails(booking.id)}
                                onMouseEnter={e => {
                                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                                  setTooltip({ booking, x: rect.left + rect.width / 2, y: rect.top - 8 });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                                style={{
                                  position: 'absolute', top: 4, height: ROW_H - 8,
                                  left: bar.left, width: bar.width,
                                  background: `linear-gradient(135deg, ${srcColor}dd, ${srcColor}99)`,
                                  borderLeft: `3px solid ${stColor}`,
                                  borderRadius: 6, display: 'flex', alignItems: 'center',
                                  padding: '0 8px', overflow: 'hidden', cursor: 'pointer',
                                  gap: 4, zIndex: 2,
                                  boxShadow: `0 1px 4px ${srcColor}44`,
                                  transition: 'transform 0.15s, box-shadow 0.15s',
                                }}
                              >
                                {/* Top-left alert badges */}
                                <div style={{ position: 'absolute', top: -4, left: -4, display: 'flex', gap: 2, zIndex: 10 }}>
                                  {(booking.payment_status === 'unpaid' || booking.payment_status === 'partial') && (
                                    <div title="Не оплачено / Борг" style={{ background: '#3b82f6', color: '#fff', width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                                      <Coins size={10} />
                                    </div>
                                  )}
                                  {booking.registration_status !== 'registered' && (
                                    <div title="Немає документів / Не зареєстровано" style={{ background: '#3b82f6', color: '#fff', width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                                      <FileText size={10} />
                                    </div>
                                  )}
                                </div>

                                <span style={{ fontWeight: 700, fontSize: 11, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {booking.first_name} {booking.last_name}
                                </span>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                                  {booking.nights}н.
                                </span>
                                {(booking as any).parent_id && (
                                  <span style={{ fontSize: 10 }} title="Дочірнє бронювання (група)">🔗</span>
                                )}
                                {(booking as any).hostex_channel_type && (
                                  <span style={{ fontSize: 10 }} title={`Hostex: ${(booking as any).hostex_channel_type}`}>🌐</span>
                                )}
                                {((booking as any).internal_notes || booking.notes) && (
                                  <span style={{ fontSize: 9 }}>📝</span>
                                )}
                                {booking.payment_status && booking.payment_status !== 'paid' && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, lineHeight: 1,
                                    color: PAYMENT_STATUS_MAP[booking.payment_status]?.color || '#888',
                                    background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '1px 4px',
                                  }}>
                                    {PAYMENT_STATUS_MAP[booking.payment_status]?.icon || '●'}
                                  </span>
                                )}
                              </div>
                            );
                          })}

                          {/* Blocked date bars (owner closures from Hostex) */}
                          {blocks
                            .filter(blk => blk.unit_id === unit.id)
                            .map(blk => {
                              const bar = getBarStyle({ check_in: blk.date_from, check_out: blk.date_to } as any);
                              if (!bar) return null;
                              return (
                                <div
                                  key={blk.id}
                                  title={`🔒 Закрито: ${blk.notes || 'Hostex block'}\n${blk.date_from} → ${blk.date_to}`}
                                  style={{
                                    position: 'absolute', top: 4, height: ROW_H - 8,
                                    left: bar.left, width: bar.width,
                                    background: 'repeating-linear-gradient(45deg, #3a3a4a, #3a3a4a 6px, #2a2a38 6px, #2a2a38 12px)',
                                    border: '1px solid #555',
                                    borderLeft: '3px solid #888',
                                    borderRadius: 6, display: 'flex', alignItems: 'center',
                                    padding: '0 8px', overflow: 'hidden', cursor: 'default',
                                    gap: 4, zIndex: 1, opacity: 0.85,
                                  }}
                                >
                                  <span style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    🔒 Закрито
                                  </span>
                                </div>
                              );
                            })
                          }
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, background: 'var(--accent-success)', color: '#fff', padding: '12px 20px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'fadeIn 0.3s ease' }}>
          <Check size={16} /> {toast}
        </div>
      )}

      {/* ─── Today Red Vertical Line (overlay hint) ─── */}
      <style>{`
        @keyframes todayPulse { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.5; } }
      `}</style>

      {/* ─── Custom Tooltip ───────── */}
      {tooltip && (() => {
        const b = tooltip.booking;
        const pm = PAYMENT_STATUS_MAP[b.payment_status] || PAYMENT_STATUS_MAP.unpaid;
        return (
          <div style={{
            position: 'fixed', left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)',
            zIndex: 9999, pointerEvents: 'none',
            background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
            borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            minWidth: 220, maxWidth: 300,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{b.first_name} {b.last_name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12 }}>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Заїзд:</span> {b.check_in}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Виїзд:</span> {b.check_out}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Ночей:</span> {b.nights}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Гостей:</span> {b.adults} дор.{b.children > 0 ? ` + ${b.children} діт.` : ''}</div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Сума:</span> <strong>{(b.total_price || 0).toLocaleString()} CZK</strong></div>
              <div><span style={{ color: pm.color }}>{pm.icon} {pm.label}</span></div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="badge" style={{
                background: (sourceMap[b.source]?.color || (b.source === 'widget' || b.source?.startsWith('widget:') ? '#6366f1' : '#6c7086')) + '22',
                color: sourceMap[b.source]?.color || (b.source === 'widget' || b.source?.startsWith('widget:') ? '#6366f1' : '#6c7086'),
                fontSize: 11
              }}>
                {sourceMap[b.source]?.label || (b.source === 'widget' || b.source?.startsWith('widget:') ? '🌐 Віджет' : b.source)}
              </span>
              <span className={`badge ${STATUS_MAP[b.status]?.badge}`} style={{ fontSize: 11 }}>{STATUS_MAP[b.status]?.label || b.status}</span>
            </div>
            {b.guest_phone && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>📞 {b.guest_phone}</div>}
            {(b as any).internal_notes && <div style={{ fontSize: 11, color: '#facc15', marginTop: 4 }}>📝 {(b as any).internal_notes.substring(0, 60)}{(b as any).internal_notes.length > 60 ? '...' : ''}</div>}
            <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 10, height: 10, background: 'var(--bg-card)', borderRight: '1px solid var(--border-primary)', borderBottom: '1px solid var(--border-primary)' }} />
          </div>
        );
      })()}

      {/* ─── View Booking Modal (shared component) ───────── */}
      {viewBooking && (
        <BookingViewModal
          booking={viewBooking}
          payments={calPayments}
          registrations={calRegistrations}
          activityLog={calActivityLog}
          sourceMap={sourceMap}
          onClose={() => setViewBooking(null)}
          onEdit={() => openEditBooking(viewBooking)}
          onChangeStatus={(id, st) => changeStatus(id, st)}
          onFetchPayments={(id) => fetchCalPayments(id)}
          onFetchBookings={() => fetchData()}
          onFetchRegistrations={async (id) => {
            const res = await fetch(`/api/bookings/${id}/registrations`);
            const data = await res.json().catch(() => []);
            if (Array.isArray(data)) setCalRegistrations(data);
          }}
          showToast={showToast}
          setBooking={(b) => setViewBooking(b)}
        />
      )}

      {/* ─── Edit Booking Modal ───────── */}
      {editBooking && (
        <div className="modal-overlay" onClick={() => setEditBooking(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Редагувати бронювання</h3>
              <button className="modal-close" onClick={() => setEditBooking(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <BookingForm
                mode="edit"
                bookingId={editBooking.id}
                initial={editInitial}
                unitTypes={unitTypes}
                allUnits={allUnits}
                bookingSources={bookingSources}
                onSaved={() => {
                  setEditBooking(null);
                  showToast('Бронювання оновлено!');
                  fetchData();
                }}
                onCancel={() => setEditBooking(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── New Booking Modal ───────── */}
      {showNewBooking && (
        <div className="modal-overlay" onClick={() => { setShowNewBooking(false); setRangeStart(null); setNewBookingPrefill(null); }}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Нове бронювання</h3>
              <button className="modal-close" onClick={() => { setShowNewBooking(false); setRangeStart(null); setNewBookingPrefill(null); }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <BookingForm
                mode="create"
                initial={newBookingPrefill || undefined}
                unitTypes={unitTypes}
                allUnits={allUnits}
                bookingSources={bookingSources}
                onSaved={() => {
                  setShowNewBooking(false);
                  setNewBookingPrefill(null);
                  setRangeStart(null);
                  showToast('Бронювання створено!');
                  fetchData();
                }}
                onCancel={() => { setShowNewBooking(false); setRangeStart(null); setNewBookingPrefill(null); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Group Booking Modal ───────── */}
      <GroupBookingModal
        open={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onCreated={() => { fetchData(); showToast('Групове бронювання створено!'); }}
        bookingSources={bookingSources}
      />

      {/* ─── Room Allocation Modal (Building View) ───────── */}
      <RoomAllocationModal
        open={showRoomAllocation}
        onClose={() => setShowRoomAllocation(false)}
        onChanged={() => fetchData()}
      />

      {/* ─── Export Report Modal ───────── */}
      {showExportModal && (
        <ExportReportModal
          onClose={() => setShowExportModal(false)}
          timelineStart={timelineStart}
          timelineEnd={days[days.length - 1]}
        />
      )}

      {/* Floating "Today" button – mobile only */}
      <button className="floating-btn" onClick={scrollToToday}>
        Сьогодні
      </button>

      {/* ─── Mobile responsive styles ─── */}
      <style>{`
        @keyframes pulse-draft {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          50% { opacity: 0.85; box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
        }
        .draft-pool-badge {
          animation: pulse-draft 2s ease-in-out infinite;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          white-space: nowrap;
          letter-spacing: 0.3px;
        }
        .draft-pool-badge:hover {
          animation: none;
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          transform: scale(1.05);
        }
        @media (max-width: 768px) {
          .cal-toolbar-row1 { flex-wrap: wrap !important; gap: 4px !important; }
          .cal-toolbar-row1 > div { flex-wrap: wrap !important; }
          .cal-toolbar-row1 button { font-size: 10px !important; padding: 3px 6px !important; }
          .floating-btn { display: flex !important; position: fixed; bottom: 20px; right: 20px; z-index: 100;
            background: var(--accent-primary); color: #fff; border: none; border-radius: 50px;
            padding: 10px 20px; font-weight: 700; font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            cursor: pointer; align-items: center; gap: 6px; }
        }
        @media (min-width: 769px) {
          .floating-btn { display: none !important; }
        }
      `}</style>
    </>
  );
}

// ─── Export Report Modal ──────────────────────────────────
function ExportReportModal({ onClose, timelineStart, timelineEnd }: {
  onClose: () => void;
  timelineStart: Date;
  timelineEnd: Date;
}) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [fromDate, setFromDate] = useState(fmtDate(firstOfMonth));
  const [toDate, setToDate] = useState(fmtDate(lastOfMonth));
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [category, setCategory] = useState('');
  const [downloading, setDownloading] = useState(false);

  const presets = [
    {
      label: 'Цей місяць',
      from: fmtDate(firstOfMonth),
      to: fmtDate(lastOfMonth),
    },
    {
      label: 'Минулий місяць',
      from: fmtDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: fmtDate(new Date(today.getFullYear(), today.getMonth(), 0)),
    },
    {
      label: 'Цей квартал',
      from: fmtDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)),
      to: fmtDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 0)),
    },
    {
      label: 'Календар (поточний вид)',
      from: fmtDate(timelineStart),
      to: fmtDate(timelineEnd),
    },
    {
      label: 'Весь рік',
      from: `${today.getFullYear()}-01-01`,
      to: `${today.getFullYear()}-12-31`,
    },
  ];

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate, format });
      if (category) params.set('category', category);
      const url = `/api/bookings/export-csv?${params}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bookings_${fromDate}_${toDate}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      onClose();
    } catch (err) {
      alert('Помилка при скачуванні звіту');
      console.error(err);
    }
    setDownloading(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-xl, 16px)', padding: '24px 28px',
        width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileSpreadsheet size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Звіт по бронюваннях</h3>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>Оберіть діапазон та формат</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-tertiary)', padding: 4,
          }}><X size={18} /></button>
        </div>

        {/* Quick presets */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {presets.map((p, i) => (
            <button key={i} onClick={() => { setFromDate(p.from); setToDate(p.to); }} style={{
              padding: '5px 10px', fontSize: 11, fontWeight: 500,
              borderRadius: 8, cursor: 'pointer',
              border: fromDate === p.from && toDate === p.to
                ? '1.5px solid var(--accent-primary)'
                : '1px solid var(--border-primary)',
              background: fromDate === p.from && toDate === p.to
                ? 'rgba(59,130,246,0.15)'
                : 'var(--bg-tertiary)',
              color: fromDate === p.from && toDate === p.to
                ? 'var(--accent-primary)'
                : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}>{p.label}</button>
          ))}
        </div>

        {/* Date range */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Від</label>
            <input type="date" className="form-input" value={fromDate} onChange={e => setFromDate(e.target.value)}
              style={{ width: '100%', fontSize: 13, padding: '8px 10px' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>До</label>
            <input type="date" className="form-input" value={toDate} onChange={e => setToDate(e.target.value)}
              style={{ width: '100%', fontSize: 13, padding: '8px 10px' }} />
          </div>
        </div>

        {/* Category + Format */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Категорія</label>
            <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}
              style={{ width: '100%', fontSize: 13, padding: '8px 10px' }}>
              <option value="">Всі категорії</option>
              <option value="glamping">Glamping</option>
              <option value="resort">Resort</option>
              <option value="camping">Camping</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Формат</label>
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
              {(['xlsx', 'csv'] as const).map(f => (
                <button key={f} onClick={() => setFormat(f)} style={{
                  flex: 1, padding: '8px 0', fontSize: 12, fontWeight: format === f ? 700 : 400,
                  border: 'none', cursor: 'pointer',
                  background: format === f ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: format === f ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}>{f.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Info */}
        <div style={{
          background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 11,
          color: 'var(--text-secondary)', lineHeight: 1.5,
        }}>
          📊 Звіт містить: ім&apos;я гостя, юніт, дати заїзду/виїзду, кількість ночей, канал бронювання, вартість, спосіб оплати, комісію, депозит, харчування, контакти та примітки.
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '8px 16px', fontSize: 13 }}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleDownload} disabled={downloading || !fromDate || !toDate}
            style={{
              padding: '8px 20px', fontSize: 13, gap: 6,
              display: 'flex', alignItems: 'center',
              opacity: downloading ? 0.7 : 1,
            }}>
            {downloading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
            {downloading ? 'Завантаження...' : `Скачати ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
