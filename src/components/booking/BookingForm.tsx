'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Loader2, Save, Plus } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BookingFormValues {
  category: string;
  unitTypeId: string;
  unitId: string;
  source: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  paymentStatus: string;
  totalPrice: string;
  commissionAmount: string;
  cityTaxAmount: string;
  cityTaxIncluded: boolean;
  cityTaxPaid: string;
  internalNotes: string;
}

export interface UnitTypeRow {
  id: string;
  name: string;
  category_type: string;
  unit_count?: number;
}

export interface UnitRow {
  id: string;
  name: string;
  code?: string;
  category_type: string;
  unit_type_id: string;
}

export interface BookingSourceRow {
  code: string;
  name: string;
  color?: string;
  commission_percent?: number;
  city_tax_included_default?: number | boolean;
}

export interface WidgetSiteSourceRow {
  code: string;   // 'widget:<siteId>'
  name: string;
  color?: string;
  site_url?: string | null;
  site_id?: string;
}

interface BookingFormProps {
  mode: 'create' | 'edit';
  bookingId?: string;
  initial?: Partial<BookingFormValues>;
  currency?: string;
  unitTypes: UnitTypeRow[];
  allUnits: UnitRow[];
  bookingSources: BookingSourceRow[];
  /** Active booking_sites to show under the "Widgets" optgroup */
  widgetSources?: WidgetSiteSourceRow[];
  onSaved: (bookingId: string) => void;
  onCancel: () => void;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'draft', label: 'Чернетка' },
  { value: 'tentative', label: 'Очікується' },
  { value: 'confirmed', label: 'Підтверджено' },
  { value: 'checked_in', label: 'Заселено' },
  { value: 'checked_out', label: 'Виселено' },
  { value: 'cancelled', label: 'Скасовано' },
];

const PAYMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'unpaid', label: 'Не оплачено' },
  { value: 'payment_requested', label: 'Запит на оплату' },
  { value: 'prepaid', label: 'Передплата' },
  { value: 'paid', label: 'Оплачено' },
];

const CITY_TAX_PAID_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: '⏳ Очікує оплати' },
  { value: 'paid', label: '✅ Оплачено' },
  { value: 'exempt', label: '🚫 Звільнено' },
];

const CITY_TAX_PER_ADULT_PER_NIGHT = 25;

function emptyValues(): BookingFormValues {
  return {
    category: 'glamping',
    unitTypeId: '',
    unitId: '',
    source: 'direct',
    checkIn: '',
    checkOut: '',
    adults: 2,
    children: 0,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: '',
    commissionAmount: '',
    cityTaxAmount: '',
    cityTaxIncluded: false,
    cityTaxPaid: 'pending',
    internalNotes: '',
  };
}

function calcNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.floor((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
}

function nightsLabel(n: number): string {
  if (n === 1) return 'ніч';
  if (n >= 2 && n <= 4) return 'ночі';
  return 'ночей';
}

export default function BookingForm({
  mode,
  bookingId,
  initial,
  currency: propCurrency,
  unitTypes,
  allUnits,
  bookingSources,
  widgetSources = [],
  onSaved,
  onCancel,
}: BookingFormProps) {
  const [form, setForm] = useState<BookingFormValues>(() => {
    const base = emptyValues();
    if (!initial) return base;
    return { ...base, ...initial };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currency = propCurrency || 'CZK';

  const getCommissionPct = useCallback((sourceCode: string) => {
    const src = bookingSources.find(s => s.code === sourceCode);
    return src?.commission_percent || 0;
  }, [bookingSources]);

  const recalcCommission = useCallback((price: string, sourceCode: string) => {
    const pct = getCommissionPct(sourceCode);
    if (pct > 0 && Number(price) > 0) return String(Math.round(Number(price) * pct / 100));
    return '0';
  }, [getCommissionPct]);

  const recalcCityTax = useCallback((adults: number, checkIn: string, checkOut: string) => {
    const nights = calcNights(checkIn, checkOut);
    if (nights > 0 && adults > 0) return String(adults * nights * CITY_TAX_PER_ADULT_PER_NIGHT);
    return '0';
  }, []);

  const unitTypesForCategory = useMemo(
    () => unitTypes.filter(ut => ut.category_type === form.category),
    [unitTypes, form.category],
  );

  const unitsForType = useMemo(() => {
    if (!form.unitTypeId) return allUnits.filter(u => u.category_type === form.category);
    return allUnits.filter(u => u.unit_type_id === form.unitTypeId);
  }, [allUnits, form.unitTypeId, form.category]);

  useEffect(() => {
    if (mode !== 'create') return;
    if (form.unitTypeId) return;
    if (unitTypesForCategory.length === 0) return;
    setForm(p => ({ ...p, unitTypeId: unitTypesForCategory[0].id }));
  }, [mode, form.unitTypeId, unitTypesForCategory]);

  const nights = calcNights(form.checkIn, form.checkOut);

  const onCategoryChange = (category: string) => {
    const firstType = unitTypes.find(ut => ut.category_type === category);
    setForm(p => ({ ...p, category, unitTypeId: firstType?.id || '', unitId: '' }));
  };

  const onUnitTypeChange = (utId: string) => {
    setForm(p => ({ ...p, unitTypeId: utId, unitId: '' }));
  };

  const onSourceChange = (code: string) => {
    const src = bookingSources.find(s => s.code === code);
    setForm(p => ({
      ...p,
      source: code,
      commissionAmount: recalcCommission(p.totalPrice, code),
      cityTaxIncluded: src?.city_tax_included_default ? true : p.cityTaxIncluded,
    }));
  };

  const onDateOrAdultsChange = (next: Partial<BookingFormValues>) => {
    setForm(p => {
      const merged = { ...p, ...next };
      const previousAuto = recalcCityTax(p.adults, p.checkIn, p.checkOut);
      const cityTaxAmount = !p.cityTaxAmount || p.cityTaxAmount === previousAuto
        ? recalcCityTax(merged.adults, merged.checkIn, merged.checkOut)
        : p.cityTaxAmount;
      return { ...merged, cityTaxAmount };
    });
  };

  const onPriceChange = (price: string) => {
    setForm(p => ({ ...p, totalPrice: price, commissionAmount: recalcCommission(price, p.source) }));
  };

  const validate = (): string => {
    if (!form.firstName.trim()) return "Ім'я обовʼязкове";
    if (!form.lastName.trim()) return 'Прізвище обовʼязкове';
    if (!form.checkIn || !form.checkOut) return 'Дати заїзду та виїзду обовʼязкові';
    if (nights <= 0) return 'Дата виїзду має бути після заїзду';
    if (mode === 'edit' && !form.unitId) return 'Юніт обовʼязковий';
    return '';
  };

  const resolveUnitId = (): string => {
    if (form.unitId) return form.unitId;
    return unitsForType[0]?.id || '';
  };

  const fetchQuoteIfNeeded = async (unitTypeId: string): Promise<number> => {
    if (Number(form.totalPrice) > 0) return Number(form.totalPrice);
    if (!unitTypeId) return 0;
    try {
      const res = await fetch('/api/pricing/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitTypeId,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          adults: form.adults,
          children: form.children,
        }),
      });
      if (!res.ok) return 0;
      const data = await res.json();
      return Number(data.total) || 0;
    } catch {
      return 0;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (mode === 'create') {
        const unitId = resolveUnitId();
        if (!unitId) {
          setError('Немає доступних юнітів для цього типу');
          setSaving(false);
          return;
        }
        const unitTypeForQuote = form.unitTypeId
          || allUnits.find(u => u.id === unitId)?.unit_type_id
          || '';
        const totalPrice = await fetchQuoteIfNeeded(unitTypeForQuote);

        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            unitId,
            checkIn: form.checkIn,
            checkOut: form.checkOut,
            nights,
            adults: form.adults,
            children: form.children,
            status: form.status,
            paymentStatus: form.paymentStatus,
            source: form.source,
            totalPrice,
            commissionAmount: form.commissionAmount ? Number(form.commissionAmount) : undefined,
            cityTaxAmount: Number(form.cityTaxAmount) || 0,
            cityTaxIncluded: form.cityTaxIncluded,
            cityTaxPaid: form.cityTaxPaid,
            internalNotes: form.internalNotes.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Помилка створення');
          setSaving(false);
          return;
        }
        onSaved(data.id);
      } else {
        if (!bookingId) {
          setError('Відсутній ID бронювання для редагування');
          setSaving(false);
          return;
        }
        const res = await fetch(`/api/bookings/${bookingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unit_id: form.unitId,
            check_in: form.checkIn,
            check_out: form.checkOut,
            nights,
            adults: form.adults,
            children: form.children,
            status: form.status,
            payment_status: form.paymentStatus,
            source: form.source,
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim() || undefined,
            phone: form.phone.trim() || undefined,
            total_price: form.totalPrice ? Number(form.totalPrice) : undefined,
            commission_amount: form.commissionAmount ? Number(form.commissionAmount) : 0,
            city_tax_amount: Number(form.cityTaxAmount) || 0,
            city_tax_included: form.cityTaxIncluded ? 1 : 0,
            city_tax_paid: form.cityTaxPaid,
            internal_notes: form.internalNotes.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Помилка збереження');
          setSaving(false);
          return;
        }
        onSaved(bookingId);
      }
    } catch {
      setError('Помилка мережі');
      setSaving(false);
    }
  };

  const commissionPct = getCommissionPct(form.source);
  const netRate = Number(form.totalPrice) > 0 && Number(form.commissionAmount) > 0
    ? Number(form.totalPrice) - Number(form.commissionAmount)
    : 0;

  return (
    <form onSubmit={handleSubmit} className="booking-form">
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Категорія *</label>
          <select className="form-select" value={form.category} onChange={e => onCategoryChange(e.target.value)}>
            <option value="glamping">Glamping</option>
            <option value="resort">Resort</option>
            <option value="camping">Camping</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Тип розміщення *</label>
          <select className="form-select" value={form.unitTypeId} onChange={e => onUnitTypeChange(e.target.value)}>
            {unitTypesForCategory.length === 0 && <option value="">—</option>}
            {unitTypesForCategory.map(ut => (
              <option key={ut.id} value={ut.id}>{ut.name}{ut.unit_count ? ` (${ut.unit_count})` : ''}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Юніт {mode === 'edit' && '*'}</label>
          <select className="form-select" value={form.unitId} onChange={e => setForm(p => ({ ...p, unitId: e.target.value }))}>
            {mode === 'create' && <option value="">Автоматично (перший вільний)</option>}
            {unitsForType.map(u => (
              <option key={u.id} value={u.id}>{u.code ? `${u.code} — ${u.name}` : u.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Джерело</label>
          <select className="form-select" value={form.source} onChange={e => onSourceChange(e.target.value)}>
            {bookingSources.length === 0 && widgetSources.length === 0 && (
              <option value="direct">Direct</option>
            )}
            {/* ── Standard channels ── */}
            {bookingSources.length > 0 && (
              <optgroup label="Канали">
                {bookingSources.map(s => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </optgroup>
            )}
            {/* ── Booking widget sites ── */}
            {widgetSources.length > 0 && (
              <optgroup label="🌐 Віджети бронювань">
                {widgetSources.map(s => (
                  <option key={s.code} value={s.code}>🌐 {s.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Заїзд *</label>
          <input
            className="form-input"
            type="date"
            value={form.checkIn}
            onChange={e => onDateOrAdultsChange({ checkIn: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Виїзд *</label>
          <input
            className="form-input"
            type="date"
            value={form.checkOut}
            onChange={e => onDateOrAdultsChange({ checkOut: e.target.value })}
          />
        </div>
      </div>

      {nights > 0 && (
        <div style={{ fontSize: 13, color: 'var(--accent-primary)', fontWeight: 600, marginBottom: 12 }}>
          📅 {nights} {nightsLabel(nights)}
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Дорослих</label>
          <input
            className="form-input"
            type="number"
            min={1}
            max={20}
            value={form.adults}
            onChange={e => onDateOrAdultsChange({ adults: Number(e.target.value) || 1 })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Дітей</label>
          <input
            className="form-input"
            type="number"
            min={0}
            max={20}
            value={form.children}
            onChange={e => setForm(p => ({ ...p, children: Number(e.target.value) || 0 }))}
          />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: 16, paddingTop: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Дані гостя</h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Ім&apos;я *</label>
            <input className="form-input" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} placeholder="Іван" />
          </div>
          <div className="form-group">
            <label className="form-label">Прізвище *</label>
            <input className="form-input" value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} placeholder="Іваненко" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Телефон</label>
            <input className="form-input" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+420..." />
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: 16, paddingTop: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>💰 Фінанси</h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Вартість ({currency})</label>
            <input
              className="form-input"
              type="number"
              min={0}
              placeholder={mode === 'create' ? 'авто з прайсингу' : '0'}
              value={form.totalPrice}
              onChange={e => onPriceChange(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              Комісія ({currency})
              {commissionPct > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>авто: {commissionPct}%</span>
              )}
            </label>
            <input
              className="form-input"
              type="number"
              min={0}
              placeholder="0"
              value={form.commissionAmount}
              onChange={e => setForm(p => ({ ...p, commissionAmount: e.target.value }))}
            />
          </div>
        </div>
        {netRate > 0 && (
          <div style={{ fontSize: 12, color: '#22c55e', marginBottom: 8 }}>
            Чиста ставка: {netRate.toLocaleString()} {currency}
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Статус</label>
            <select className="form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Статус оплати</label>
            <select className="form-select" value={form.paymentStatus} onChange={e => setForm(p => ({ ...p, paymentStatus: e.target.value }))}>
              {PAYMENT_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: 16, paddingTop: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🏛️ Туристичний збір</h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">
              Сума збору ({currency})
              {form.checkIn && form.checkOut && form.adults > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>
                  авто: {form.adults}×{nights}×{CITY_TAX_PER_ADULT_PER_NIGHT}
                </span>
              )}
            </label>
            <input
              className="form-input"
              type="number"
              min={0}
              placeholder="0"
              value={form.cityTaxAmount}
              onChange={e => setForm(p => ({ ...p, cityTaxAmount: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Статус збору</label>
            <select className="form-select" value={form.cityTaxPaid} onChange={e => setForm(p => ({ ...p, cityTaxPaid: e.target.value }))}>
              {CITY_TAX_PAID_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <input
            type="checkbox"
            id="bf-cityTaxIncluded"
            checked={form.cityTaxIncluded}
            onChange={e => setForm(p => ({ ...p, cityTaxIncluded: e.target.checked }))}
          />
          <label htmlFor="bf-cityTaxIncluded" style={{ fontSize: 13, cursor: 'pointer' }}>
            Збір включено у вартість бронювання
          </label>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: 16, paddingTop: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📝 Примітки</h4>
        <textarea
          className="form-input"
          placeholder="Внутрішні примітки (бачить лише персонал)..."
          value={form.internalNotes}
          onChange={e => setForm(p => ({ ...p, internalNotes: e.target.value }))}
          style={{ minHeight: 60, resize: 'vertical', width: '100%' }}
        />
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div className="booking-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-primary)' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Скасувати
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving
            ? <><Loader2 size={14} className="animate-pulse" /> Збереження...</>
            : mode === 'create'
              ? <><Plus size={14} /> Створити бронювання</>
              : <><Save size={14} /> Зберегти зміни</>
          }
        </button>
      </div>
    </form>
  );
}
