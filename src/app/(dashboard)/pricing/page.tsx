'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  ChevronLeft,
  ChevronRight,
  Calculator,
  Save,
  Lock,
  Unlock,
  X,
  Edit3,
  Loader2,
  Check,
  AlertTriangle,
  Calendar,
  List,
} from 'lucide-react';

/* ================================================================
   Types
   ================================================================ */
interface UnitType {
  id: string;
  name: string;
  code: string;
  category_type: string;
}

interface PriceDay {
  date: string;
  day: number;
  dayOfWeek: number;
  isWeekend: boolean;
  base_price: number;
  weekend_price: number | null;
  effective_price: number;
  min_stay: number;
  max_stay: number | null;
  closed: number;
  cta: number;
  ctd: number;
  hasData: boolean;
}

interface QuoteResult {
  nights: number;
  breakdown: { date: string; dayName: string; price: number; isWeekend: boolean }[];
  accommodationTotal: number;
  feeBreakdown: { name: string; amount: number }[];
  feesTotal: number;
  total: number;
  missingDays: number;
  hasPricing: boolean;
}

/* ================================================================
   Constants
   ================================================================ */
const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];
const DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const CZK_TO_EUR = 23.5;

/* ================================================================
   Edit Cell Modal
   ================================================================ */
function EditDayModal({ day, onSave, onClose }: {
  day: PriceDay;
  onSave: (data: Partial<PriceDay>) => void;
  onClose: () => void;
}) {
  const [basePrice, setBasePrice] = useState(day.base_price);
  const [weekendPrice, setWeekendPrice] = useState(day.weekend_price ?? '');
  const [minStay, setMinStay] = useState(day.min_stay);
  const [closed, setClosed] = useState(!!day.closed);
  const [cta, setCta] = useState(!!day.cta);
  const [ctd, setCtd] = useState(!!day.ctd);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {day.day} {MONTH_NAMES[new Date(day.date).getMonth()]} ({DAY_NAMES[day.dayOfWeek]})
          </h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Базова ціна (CZK)</label>
            <input className="form-input" type="number" value={basePrice} onChange={e => setBasePrice(Number(e.target.value))} min={0} />
          </div>
          <div className="form-group">
            <label className="form-label">Ціна вихідних — Пт/Сб/Нд (CZK)</label>
            <input className="form-input" type="number" value={weekendPrice} onChange={e => setWeekendPrice(e.target.value === '' ? '' : Number(e.target.value))} min={0} placeholder="Як базова" />
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Залиште порожнім щоб = базовій</span>
          </div>
          <div className="form-group">
            <label className="form-label">Мін. ночей</label>
            <input className="form-input" type="number" value={minStay} onChange={e => setMinStay(Number(e.target.value))} min={1} max={30} />
          </div>
          <div className="form-row" style={{ gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={closed} onChange={e => setClosed(e.target.checked)} /> Закрито
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={cta} onChange={e => setCta(e.target.checked)} /> CTA
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={ctd} onChange={e => setCtd(e.target.checked)} /> CTD
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={() => onSave({
            base_price: basePrice,
            weekend_price: weekendPrice === '' ? null : Number(weekendPrice),
            min_stay: minStay,
            closed: closed ? 1 : 0,
            cta: cta ? 1 : 0,
            ctd: ctd ? 1 : 0,
          })}>
            <Save size={14} /> Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Bulk Edit Modal
   ================================================================ */
function BulkEditModal({ onSave, onClose }: {
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [weekendPrice, setWeekendPrice] = useState('');
  const [minStay, setMinStay] = useState('');
  const [closed, setClosed] = useState<boolean | undefined>(undefined);
  const [applyTo, setApplyTo] = useState<'all' | 'weekdays' | 'weekends'>('all');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!dateFrom || !dateTo) { alert('Вкажіть діапазон дат'); return; }
    setSaving(true);
    await onSave({
      dateFrom, dateTo, applyTo,
      base_price: basePrice !== '' ? Number(basePrice) : undefined,
      weekend_price: weekendPrice !== '' ? Number(weekendPrice) : undefined,
      min_stay: minStay !== '' ? Number(minStay) : undefined,
      closed: closed,
    });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3 className="modal-title"><Edit3 size={16} style={{ display: 'inline', marginRight: 6 }} />Масове редагування цін</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Від</label>
              <input className="form-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">До</label>
              <input className="form-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Застосувати до</label>
            <select className="form-select" value={applyTo} onChange={e => setApplyTo(e.target.value as any)}>
              <option value="all">Всі дні</option>
              <option value="weekdays">Тільки будні (Пн-Чт)</option>
              <option value="weekends">Тільки вихідні (Пт-Нд)</option>
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Базова ціна (CZK)</label>
              <input className="form-input" type="number" placeholder="Не змінювати" value={basePrice} onChange={e => setBasePrice(e.target.value)} min={0} />
            </div>
            <div className="form-group">
              <label className="form-label">Ціна вихідних (CZK)</label>
              <input className="form-input" type="number" placeholder="Не змінювати" value={weekendPrice} onChange={e => setWeekendPrice(e.target.value)} min={0} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Мін. ночей</label>
              <input className="form-input" type="number" placeholder="Не змінювати" value={minStay} onChange={e => setMinStay(e.target.value)} min={1} />
            </div>
            <div className="form-group">
              <label className="form-label">Статус</label>
              <select className="form-select" value={closed === undefined ? '' : closed ? 'closed' : 'open'}
                onChange={e => setClosed(e.target.value === '' ? undefined : e.target.value === 'closed')}>
                <option value="">Не змінювати</option>
                <option value="open">Відкрито</option>
                <option value="closed">Закрито</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />} Застосувати
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Test Quote Section
   ================================================================ */
function TestQuoteSection({ unitTypes }: { unitTypes: UnitType[] }) {
  const [unitTypeId, setUnitTypeId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (unitTypes.length > 0 && !unitTypeId) setUnitTypeId(unitTypes[0].id);
  }, [unitTypes, unitTypeId]);

  const calculate = async () => {
    if (!unitTypeId || !checkIn || !checkOut) return;
    setLoading(true);
    try {
      const res = await fetch('/api/pricing/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitTypeId, checkIn, checkOut, adults, children }),
      });
      const data = await res.json();
      if (res.ok) setQuote(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <h3 className="card-title">
          <Calculator size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
          Калькулятор вартості
        </h3>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Тип розміщення</label>
          <select className="form-select" value={unitTypeId} onChange={e => setUnitTypeId(e.target.value)}>
            {unitTypes.map(ut => <option key={ut.id} value={ut.id}>{ut.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Заїзд</label>
          <input className="form-input" type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Виїзд</label>
          <input className="form-input" type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Дорослих</label>
          <input className="form-input" type="number" value={adults} onChange={e => setAdults(Number(e.target.value))} min={1} max={6} />
        </div>
        <div className="form-group">
          <label className="form-label">Дітей</label>
          <input className="form-input" type="number" value={children} onChange={e => setChildren(Number(e.target.value))} min={0} max={4} />
        </div>
        <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn btn-primary" onClick={calculate} disabled={loading || !checkIn || !checkOut}>
            {loading ? <Loader2 size={14} className="animate-pulse" /> : <Calculator size={14} />} Розрахувати
          </button>
        </div>
      </div>

      {quote && (
        <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
          {!quote.hasPricing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 12, borderRadius: 'var(--radius-md)', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 13 }}>
              <AlertTriangle size={14} /> Для {quote.missingDays} дн. не задано ціни — показано 0
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Покажчик вартості ({quote.nights} ночей)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            {quote.breakdown.map(b => (
              <div key={b.date} className="flex justify-between" style={{ color: b.price === 0 ? 'var(--text-tertiary)' : undefined }}>
                <span>{b.date} ({b.dayName}){b.isWeekend ? ' 🌙' : ''}</span>
                <span style={{ fontWeight: b.price > 0 ? 600 : 400 }}>{b.price.toLocaleString()} CZK</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 6, marginTop: 4 }} className="flex justify-between">
              <span>Проживання</span>
              <span style={{ fontWeight: 600 }}>{quote.accommodationTotal.toLocaleString()} CZK</span>
            </div>
            {quote.feeBreakdown.map(f => (
              <div key={f.name} className="flex justify-between" style={{ color: 'var(--text-tertiary)' }}>
                <span>{f.name}</span>
                <span>{f.amount.toLocaleString()} CZK</span>
              </div>
            ))}
            <div style={{ borderTop: '2px solid var(--accent-primary)', paddingTop: 8, marginTop: 4 }} className="flex justify-between">
              <span style={{ fontWeight: 700, fontSize: 15 }}>Всього</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent-primary)' }}>{quote.total.toLocaleString()} CZK</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>≈ {(quote.total / CZK_TO_EUR).toFixed(0)} EUR</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   Main Page
   ================================================================ */
export default function PricingPage() {
  const today = new Date();
  const onMenuClick = useMobileMenu();

  // State
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [selectedUnitType, setSelectedUnitType] = useState('');
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [priceData, setPriceData] = useState<PriceDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDay, setEditDay] = useState<PriceDay | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [toast, setToast] = useState('');

  // Fetch unit types
  useEffect(() => {
    fetch('/api/unit-types').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setUnitTypes(data);
        if (data.length > 0 && !selectedUnitType) setSelectedUnitType(data[0].id);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch prices
  const fetchPrices = useCallback(async () => {
    if (!selectedUnitType) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pricing?unitTypeId=${selectedUnitType}&month=${month}&year=${year}`);
      const data = await res.json();
      if (data.days) setPriceData(data.days);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [selectedUnitType, month, year]);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  // Calendar grid
  const calendarWeeks = useMemo(() => {
    if (priceData.length === 0) return [];
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const weeks: (PriceDay | null)[][] = [];
    let week: (PriceDay | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) week.push(null);
    for (const day of priceData) {
      week.push(day);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [priceData, month, year]);

  // Month navigation
  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Save single day
  const handleSaveDay = async (data: Partial<PriceDay>) => {
    if (!editDay) return;
    try {
      const res = await fetch('/api/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitTypeId: selectedUnitType,
          prices: [{ date: editDay.date, ...data }],
        }),
      });
      if (res.ok) {
        showToast('Ціну збережено');
        setEditDay(null);
        fetchPrices();
      }
    } catch (e) { console.error(e); }
  };

  // Bulk edit
  const handleBulkSave = async (data: any) => {
    try {
      const res = await fetch('/api/pricing/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitTypeId: selectedUnitType, ...data }),
      });
      const result = await res.json();
      if (res.ok) {
        showToast(`Оновлено ${result.updated} днів`);
        setShowBulkEdit(false);
        fetchPrices();
      }
    } catch (e) { console.error(e); }
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Stats
  const stats = useMemo(() => {
    const withData = priceData.filter(d => d.hasData);
    const avgPrice = withData.length > 0
      ? Math.round(withData.reduce((s, d) => s + d.effective_price, 0) / withData.length)
      : 0;
    const closedDays = priceData.filter(d => d.closed).length;
    return { total: priceData.length, withData: withData.length, avgPrice, closedDays };
  }, [priceData]);

  const selectedUT = unitTypes.find(ut => ut.id === selectedUnitType);

  return (
    <>
      <Header title="Ціноутворення" onMenuClick={onMenuClick} />
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

        {/* Header */}
        <div className="page-header">
          <div>
            <h2 className="page-title">Ціноутворення</h2>
            <div className="page-subtitle">
              {selectedUT ? `${selectedUT.name}` : 'Виберіть тип розміщення'} · {MONTH_NAMES[month - 1]} {year}
            </div>
          </div>
          <div className="flex gap-2">
            <a className="btn btn-secondary" href="/pricing/pricelabs" title="Подивитися ціни з PriceLabs та запустити sync">
              📈 PriceLabs
            </a>
            <button className="btn btn-secondary" onClick={() => setShowBulkEdit(true)}>
              <Edit3 size={16} /> Масове редагування
            </button>
          </div>
        </div>

        {/* Selectors */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Тип розміщення</label>
              <select className="form-select" value={selectedUnitType} onChange={e => setSelectedUnitType(e.target.value)}>
                {unitTypes.map(ut => (
                  <option key={ut.id} value={ut.id}>{ut.category_type === 'glamping' ? '🏕️' : ut.category_type === 'resort' ? '🏨' : '⛺'} {ut.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Режим</label>
              <div className="flex gap-2">
                <button className={`btn btn-sm ${viewMode === 'calendar' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode('calendar')}>
                  <Calendar size={14} /> Календар
                </button>
                <button className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode('list')}>
                  <List size={14} /> Таблиця
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-primary)' }}>{stats.avgPrice.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Серед. ціна CZK</div>
          </div>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: stats.withData === stats.total ? 'var(--accent-success)' : '#f59e0b' }}>{stats.withData}/{stats.total}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Днів з ціною</div>
          </div>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: stats.closedDays > 0 ? 'var(--accent-danger)' : 'var(--accent-success)' }}>{stats.closedDays}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Закритих днів</div>
          </div>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.avgPrice > 0 ? Math.round(stats.avgPrice / CZK_TO_EUR) : 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Серед. EUR</div>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button className="btn btn-ghost btn-icon" onClick={prevMonth}><ChevronLeft size={20} /></button>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{MONTH_NAMES[month - 1]} {year}</h3>
          <button className="btn btn-ghost btn-icon" onClick={nextMonth}><ChevronRight size={20} /></button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
            <Loader2 size={24} className="animate-pulse" style={{ display: 'inline-block' }} /> Завантаження...
          </div>
        ) : viewMode === 'calendar' ? (
          /* ── Calendar View ── */
          <div>
            <div className="pricing-grid" style={{ marginBottom: 2 }}>
              {DAY_NAMES.map(d => (
                <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  {d}
                </div>
              ))}
            </div>
            {calendarWeeks.map((week, wi) => (
              <div key={wi} className="pricing-grid" style={{ marginBottom: 2 }}>
                {week.map((day, di) => (
                  <div key={di}>
                    {day ? (
                      <div
                        className={`pricing-cell ${day.closed ? 'closed' : ''} ${!day.hasData ? 'no-data' : ''}`}
                        onClick={() => setEditDay(day)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="pricing-cell-date">
                          {day.day} {DAY_NAMES[day.dayOfWeek]}
                        </div>
                        <div className="pricing-cell-price" style={{
                          color: !day.hasData ? 'var(--text-tertiary)' : day.isWeekend ? '#f59e0b' : undefined,
                          fontSize: day.hasData ? 15 : 13,
                        }}>
                          {day.hasData ? `${day.effective_price.toLocaleString()}` : '—'}
                        </div>
                        {day.hasData && day.isWeekend && day.weekend_price != null && day.weekend_price !== day.base_price && (
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                            буд. {day.base_price}
                          </div>
                        )}
                        <div className="pricing-cell-badges">
                          {day.isWeekend && <span className="pricing-cell-badge">WE</span>}
                          {day.min_stay > 1 && <span className="pricing-cell-badge">min {day.min_stay}</span>}
                          {day.cta ? <span className="pricing-cell-badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>CTA</span> : null}
                          {day.ctd ? <span className="pricing-cell-badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>CTD</span> : null}
                          {day.closed ? <span className="pricing-cell-badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Closed</span> : null}
                        </div>
                      </div>
                    ) : (
                      <div style={{ minHeight: 80 }} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          /* ── Table View ── */
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>День</th>
                  <th>Базова (CZK)</th>
                  <th>Вихідні (CZK)</th>
                  <th>Ефективна</th>
                  <th>Min Stay</th>
                  <th>CTA</th>
                  <th>CTD</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {priceData.map(day => (
                  <tr key={day.date} style={{ opacity: day.hasData ? 1 : 0.5 }}>
                    <td>{day.date}</td>
                    <td>
                      <span style={day.isWeekend ? { color: '#f59e0b', fontWeight: 600 } : {}}>
                        {DAY_NAMES[day.dayOfWeek]}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{day.hasData ? day.base_price.toLocaleString() : '—'}</td>
                    <td>{day.weekend_price != null ? day.weekend_price.toLocaleString() : '—'}</td>
                    <td style={{ fontWeight: 700, color: day.isWeekend ? '#f59e0b' : 'var(--accent-primary)' }}>
                      {day.hasData ? day.effective_price.toLocaleString() : '—'}
                    </td>
                    <td>{day.min_stay}</td>
                    <td>{day.cta ? <Lock size={14} style={{ color: '#ef4444' }} /> : <Unlock size={14} style={{ color: 'var(--text-tertiary)' }} />}</td>
                    <td>{day.ctd ? <Lock size={14} style={{ color: '#ef4444' }} /> : <Unlock size={14} style={{ color: 'var(--text-tertiary)' }} />}</td>
                    <td>{day.closed ? <span className="badge badge-danger">Closed</span> : <span className="badge badge-success">Open</span>}</td>
                    <td><button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditDay(day)}><Edit3 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Test Quote */}
        <TestQuoteSection unitTypes={unitTypes} />

        {/* ═══ Widget Price List ═══ */}
        <WidgetPriceListSection />

        {/* Edit Day Modal */}
        {editDay && <EditDayModal day={editDay} onSave={handleSaveDay} onClose={() => setEditDay(null)} />}

        {/* Bulk Edit Modal */}
        {showBulkEdit && <BulkEditModal onSave={handleBulkSave} onClose={() => setShowBulkEdit(false)} />}
      </div>
    </>
  );
}

/* ================================================================
   Widget Price List Section
   ================================================================ */
interface PriceListItem {
  id: string; category: string; item_code: string; item_name: string;
  rate_standard: number; rate_holiday: number | null; rate_side_season: number | null;
  unit_label: string; notes: string | null; sort_order: number; is_active: number;
}

function WidgetPriceListSection() {
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<PriceListItem>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetch('/api/widget/prices').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setItems(data);
    }).finally(() => setLoading(false));
  }, []);

  const startEdit = (item: PriceListItem) => {
    setEditing(item.id);
    setEditValues({ rate_standard: item.rate_standard, rate_holiday: item.rate_holiday, rate_side_season: item.rate_side_season });
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/widget/prices', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editValues }),
      });
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, ...editValues } as PriceListItem : i));
        setEditing(null);
        setToast('Ціну збережено'); setTimeout(() => setToast(''), 2000);
      }
    } catch { /* */ }
    setSaving(false);
  };

  const categories = ['glamping', 'buildings', 'camping'];
  const catLabels: Record<string, string> = { glamping: '🏕️ Glamping', buildings: '🏠 Buildings', camping: '⛺ Camping' };

  if (loading) return null;

  return (
    <div className="card" style={{ marginTop: 24 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, background: 'var(--accent-success)', color: '#fff', padding: '12px 20px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <Check size={16} /> {toast}
        </div>
      )}
      <div className="card-header">
        <h3 className="card-title">
          <List size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
          Прайс-лист (Booking Widget)
        </h3>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '0 16px 12px' }}>
        Ці ціни використовуються у віджеті бронювання (book.kempcarlsbad.cz). Змініть тут — віджет підтягне автоматично.
      </div>

      {categories.map(cat => {
        const catItems = items.filter(i => i.category === cat);
        if (catItems.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-primary)' }}>
              {catLabels[cat] || cat}
            </div>
            <div className="table-wrapper">
              <table className="table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Назва</th>
                    <th>Standard (Kč)</th>
                    <th>Holiday (Kč)</th>
                    <th>Side Season (Kč)</th>
                    <th>Одиниця</th>
                    <th>Примітка</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {catItems.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                      <td>
                        {editing === item.id ? (
                          <input className="form-input" type="number" style={{ width: 90, padding: '4px 8px', fontSize: 13 }}
                            value={editValues.rate_standard ?? ''} onChange={e => setEditValues(v => ({ ...v, rate_standard: Number(e.target.value) }))} />
                        ) : (
                          <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{item.rate_standard?.toLocaleString()}</span>
                        )}
                      </td>
                      <td>
                        {editing === item.id ? (
                          <input className="form-input" type="number" style={{ width: 90, padding: '4px 8px', fontSize: 13 }}
                            value={editValues.rate_holiday ?? ''} onChange={e => setEditValues(v => ({ ...v, rate_holiday: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="—" />
                        ) : (
                          <span style={{ color: item.rate_holiday != null ? '#f59e0b' : 'var(--text-tertiary)' }}>{item.rate_holiday != null ? item.rate_holiday.toLocaleString() : '—'}</span>
                        )}
                      </td>
                      <td>
                        {editing === item.id ? (
                          <input className="form-input" type="number" style={{ width: 90, padding: '4px 8px', fontSize: 13 }}
                            value={editValues.rate_side_season ?? ''} onChange={e => setEditValues(v => ({ ...v, rate_side_season: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="—" />
                        ) : (
                          <span style={{ color: item.rate_side_season != null ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{item.rate_side_season != null ? item.rate_side_season.toLocaleString() : '—'}</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{item.unit_label}</td>
                      <td style={{ color: 'var(--text-tertiary)', fontSize: 12, maxWidth: 140 }}>{item.notes || '—'}</td>
                      <td>
                        {editing === item.id ? (
                          <div className="flex gap-1">
                            <button className="btn btn-sm btn-primary" onClick={() => saveEdit(item.id)} disabled={saving}>
                              {saving ? <Loader2 size={12} className="animate-pulse" /> : <Save size={12} />}
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}><X size={12} /></button>
                          </div>
                        ) : (
                          <button className="btn btn-sm btn-ghost btn-icon" onClick={() => startEdit(item)}><Edit3 size={14} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
