'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { useDevice } from '@/lib/useDevice';
import MobileGuests from '@/components/mobile/pages/MobileGuests';
import {
  Plus, Search, Eye, Edit3, X, Save, Trash2, Check,
  RefreshCw, Loader2, Mail, Phone, MapPin, FileText,
  Calendar, User, ExternalLink,
} from 'lucide-react';

/* ================================================================
   Types
   ================================================================ */
interface GuestRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  document_type: string | null;
  document_number: string | null;
  date_of_birth: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  adults: number;
  children: number;
  status: string;
  payment_status: string;
  source: string;
  total_price: number;
  currency: string;
  unit_name: string;
  unit_code: string;
  category_name: string;
  category_type: string;
}

interface GuestDetail extends GuestRow {
  reservations: ReservationRow[];
}

/* ================================================================
   Status maps
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
  payment_requested: { label: 'Запит', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  prepaid: { label: 'Передплата', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  paid: { label: 'Оплачено', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
};

const DOC_TYPES: Record<string, string> = {
  passport: 'Паспорт',
  id_card: 'ID картка',
  drivers_license: 'Водійське посвідчення',
  other: 'Інше',
};

const COUNTRIES: Record<string, string> = {
  CZ: '🇨🇿 Чехія', DE: '🇩🇪 Німеччина', UA: '🇺🇦 Україна',
  GB: '🇬🇧 Великобританія', PL: '🇵🇱 Польща', SK: '🇸🇰 Словаччина',
  AT: '🇦🇹 Австрія', FR: '🇫🇷 Франція', IT: '🇮🇹 Італія',
  US: '🇺🇸 США', NL: '🇳🇱 Нідерланди', ES: '🇪🇸 Іспанія',
};

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
   Empty form
   ================================================================ */
function emptyForm() {
  return {
    firstName: '', lastName: '', email: '', phone: '',
    country: '', city: '', address: '',
    documentType: '', documentNumber: '', dateOfBirth: '',
    notes: '',
  };
}

/* ================================================================
   Main
   ================================================================ */
function DesktopGuests() {
  /* ── data state ──────────────────────────────────── */
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);

  /* ── filters ─────────────────────────────────────── */
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  /* ── modals ──────────────────────────────────────── */
  const [viewGuest, setViewGuest] = useState<GuestDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editGuest, setEditGuest] = useState<GuestRow | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const onMenuClick = useMobileMenu();

  /* ── fetch guests list ───────────────────────────── */
  const fetchGuests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (countryFilter) params.set('country', countryFilter);
      params.set('page', page.toString());
      params.set('limit', limit.toString());

      const res = await fetch(`/api/guests?${params}`);
      const result = await res.json();
      if (result && Array.isArray(result.data)) {
        setGuests(result.data);
        setTotal(result.total || 0);
        setTotalPages(result.totalPages || 1);
      } else if (Array.isArray(result)) {
        setGuests(result); // Fallback
      }
    } catch (e) {
      console.error('Failed to fetch guests', e);
    } finally {
      setLoading(false);
    }
  }, [search, countryFilter, page, limit]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
  }, [search, countryFilter]);

  useEffect(() => {
    const debounce = setTimeout(fetchGuests, 300);
    return () => clearTimeout(debounce);
  }, [fetchGuests]);

  /* ── fetch single guest detail ───────────────────── */
  const openGuestDetail = async (guestId: string) => {
    setViewLoading(true);
    try {
      const res = await fetch(`/api/guests/${guestId}`);
      const data = await res.json();
      if (res.ok) setViewGuest(data);
    } catch (e) {
      console.error('Failed to fetch guest detail', e);
    } finally {
      setViewLoading(false);
    }
  };

  /* ── open add ────────────────────────────────────── */
  const openAddGuest = () => {
    setForm(emptyForm());
    setShowAddModal(true);
  };

  /* ── open edit ───────────────────────────────────── */
  const openEditGuest = (g: GuestRow) => {
    setForm({
      firstName: g.first_name,
      lastName: g.last_name,
      email: g.email || '',
      phone: g.phone || '',
      country: g.country || '',
      city: g.city || '',
      address: g.address || '',
      documentType: g.document_type || '',
      documentNumber: g.document_number || '',
      dateOfBirth: g.date_of_birth || '',
      notes: g.notes || '',
    });
    setEditGuest(g);
  };

  /* ── create guest ────────────────────────────────── */
  const handleCreate = async () => {
    if (!form.firstName || !form.lastName) {
      showToast("Будь ласка, заповніть обов'язкові поля: Ім'я та Прізвище", 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowAddModal(false);
        showToast('Гостя успішно створено!');
        fetchGuests();
      } else {
        const data = await res.json();
        showToast(data.error || 'Помилка створення', 'error');
      }
    } catch {
      showToast('Помилка мережі', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── update guest ────────────────────────────────── */
  const handleSaveEdit = async () => {
    if (!editGuest) return;
    if (!form.firstName || !form.lastName) {
      showToast("Ім'я та Прізвище обов'язкові", 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/guests/${editGuest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setEditGuest(null);
        showToast('Дані гостя оновлено!');
        fetchGuests();
        // Also refresh detail view if open
        if (viewGuest && viewGuest.id === editGuest.id) {
          openGuestDetail(editGuest.id);
        }
      } else {
        const data = await res.json();
        showToast(data.error || 'Помилка збереження', 'error');
      }
    } catch {
      showToast('Помилка мережі', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── delete guest ────────────────────────────────── */
  const handleDelete = async (g: GuestRow) => {
    if (!confirm(`Видалити гостя ${g.first_name} ${g.last_name}?`)) return;
    try {
      const res = await fetch(`/api/guests/${g.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast(`Гостя ${g.first_name} ${g.last_name} видалено`);
        if (viewGuest?.id === g.id) setViewGuest(null);
        fetchGuests();
      } else {
        showToast(data.error || 'Помилка видалення', 'error');
      }
    } catch {
      showToast('Помилка мережі', 'error');
    }
  };

  /* ── toast ───────────────────────────────────────── */
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(''), 4000);
  };

  /* ── unique countries for filter ─────────────────── */
  const uniqueCountries = [...new Set(guests.map(g => g.country).filter(Boolean))] as string[];

  /* ── render guest form ───────────────────────────── */
  const renderForm = () => (
    <>
      <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: 16, marginBottom: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <User size={14} /> Основна інформація
        </h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Ім&apos;я *</label>
            <input className="form-input" placeholder="Ім'я" value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Прізвище *</label>
            <input className="form-input" placeholder="Прізвище" value={form.lastName} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="email@example.com" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Телефон</label>
            <input className="form-input" type="tel" placeholder="+420..." value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: 16, marginBottom: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={14} /> Адреса
        </h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Країна</label>
            <select className="form-select" value={form.country} onChange={(e) => setForm(p => ({ ...p, country: e.target.value }))}>
              <option value="">Не вказано</option>
              {Object.entries(COUNTRIES).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Місто</label>
            <input className="form-input" placeholder="Місто" value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Адреса</label>
          <input className="form-input" placeholder="Вулиця, будинок, квартира" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} />
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: 16, marginBottom: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={14} /> Документи
        </h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Тип документа</label>
            <select className="form-select" value={form.documentType} onChange={(e) => setForm(p => ({ ...p, documentType: e.target.value }))}>
              <option value="">Не вказано</option>
              {Object.entries(DOC_TYPES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Номер документа</label>
            <input className="form-input" placeholder="AB123456" value={form.documentNumber} onChange={(e) => setForm(p => ({ ...p, documentNumber: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Дата народження</label>
          <input className="form-input" type="date" value={form.dateOfBirth} onChange={(e) => setForm(p => ({ ...p, dateOfBirth: e.target.value }))} />
        </div>
      </div>

      <div>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Нотатки</h4>
        <textarea
          className="form-input"
          placeholder="Додаткова інформація..."
          rows={3}
          style={{ resize: 'vertical' }}
          value={form.notes}
          onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
        />
      </div>
    </>
  );

  return (
    <>
      <Header title="Гості" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 80, right: 24, zIndex: 1000,
            background: toastType === 'error' ? 'var(--accent-danger)' : 'var(--accent-success)', color: '#fff',
            padding: '12px 20px', borderRadius: 'var(--radius-md)',
            fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'fadeIn 0.3s ease',
            maxWidth: 420,
          }}>
            {toastType === 'error' ? <X size={16} /> : <Check size={16} />} {toast}
          </div>
        )}

        <div className="page-header">
          <div>
            <h2 className="page-title">База гостей</h2>
            <div className="page-subtitle">{total > 0 ? `${total} записів` : `${guests.length} записів`}</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={fetchGuests} title="Оновити">
              <RefreshCw size={16} />
            </button>
            <button className="btn btn-primary" onClick={openAddGuest}>
              <Plus size={16} /> Додати гостя
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card desktop-filter-card" style={{ marginBottom: 16 }}>
          <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
            <div className="search-box" style={{ minWidth: 280 }}>
              <Search size={14} className="search-icon" />
              <input
                className="form-input"
                placeholder="Пошук по імені, email або телефону..."
                style={{ paddingLeft: 34 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="form-select" style={{ width: 170 }} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
              <option value="">Всі країни</option>
              {uniqueCountries.map(c => (
                <option key={c} value={c}>{COUNTRIES[c] || c}</option>
              ))}
            </select>
            {(search || countryFilter) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setCountryFilter(''); }}>
                <X size={14} /> Скинути
              </button>
            )}
          </div>
        </div>

        {/* Mobile Search */}
        <div className="mobile-only" style={{ marginBottom: 10 }}>
          <div className="search-box" style={{ width: '100%' }}>
            <Search size={14} className="search-icon" />
            <input
              className="form-input"
              placeholder="Пошук гостя..."
              style={{ paddingLeft: 34, fontSize: 13 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Desktop Table */}
        <div className="table-wrapper desktop-only">
          <table className="table">
            <thead>
              <tr>
                <th>Ім&apos;я</th>
                <th>Email</th>
                <th>Телефон</th>
                <th>Країна</th>
                <th>Візитів</th>
                <th>Останній візит</th>
                <th>Дохід</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>
                  <Loader2 size={20} className="animate-pulse" style={{ display: 'inline-block' }} /> Завантаження...
                </td></tr>
              )}
              {!loading && guests.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
                  Гостей не знайдено
                </td></tr>
              )}
              {guests.map((g) => (
                <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => openGuestDetail(g.id)}>
                  <td style={{ fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-hover))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {g.first_name[0]}{g.last_name[0]}
                      </div>
                      <div>
                        <div>{g.first_name} {g.last_name}</div>
                        {g.document_type && (
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {DOC_TYPES[g.document_type] || g.document_type}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    {g.email ? (
                      <span className="flex items-center gap-2" style={{ fontSize: 13 }}>
                        <Mail size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} /> {g.email}
                      </span>
                    ) : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    {g.phone ? (
                      <span className="flex items-center gap-2" style={{ fontSize: 13 }}>
                        <Phone size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} /> {g.phone}
                      </span>
                    ) : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    {g.country ? (
                      <span className="badge badge-info">{COUNTRIES[g.country] || g.country}</span>
                    ) : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 24, height: 22, borderRadius: 11,
                      fontSize: 12, fontWeight: 700,
                      background: g.total_stays > 0 ? 'rgba(99,102,241,0.15)' : 'var(--bg-tertiary)',
                      color: g.total_stays > 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                      padding: '0 6px',
                    }}>
                      {g.total_stays}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {g.last_check_in || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                  </td>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>
                    {g.total_revenue ? `${g.total_revenue.toLocaleString()} CZK` : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                  </td>
                  <td>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-ghost btn-icon" title="Переглянути" onClick={() => openGuestDetail(g.id)}><Eye size={14} /></button>
                      <button className="btn btn-sm btn-ghost btn-icon" title="Редагувати" onClick={() => openEditGuest(g)}><Edit3 size={14} /></button>
                      <button className="btn btn-sm btn-ghost btn-icon" title="Видалити" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDelete(g)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Desktop Pagination */}
        {!loading && totalPages > 1 && (
          <div className="desktop-only" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16, marginBottom: 32 }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Назад</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Сторінка {page} з {totalPages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Вперед</button>
          </div>
        )}

        {/* Mobile Card List */}
        <div className="mobile-only">
          {loading && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
              <Loader2 size={20} className="animate-pulse" style={{ display: 'inline-block' }} /> Завантаження...
            </div>
          )}
          {!loading && guests.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
              Гостей не знайдено
            </div>
          )}
          <div className="card-list">
            {guests.map((g) => (
              <div key={g.id} className="guest-card" onClick={() => openGuestDetail(g.id)}>
                <div className="guest-card-avatar">
                  {g.first_name[0]}{g.last_name[0]}
                </div>
                <div className="guest-card-info">
                  <div className="guest-card-name">{g.first_name} {g.last_name}</div>
                  <div className="guest-card-detail">
                    {g.phone && <><Phone size={11} /> {g.phone}</>}
                    {!g.phone && g.email && <><Mail size={11} /> {g.email}</>}
                    {!g.phone && !g.email && <span>Немає контактів</span>}
                  </div>
                  {g.country && (
                    <div className="guest-card-detail" style={{ marginTop: 1 }}>
                      <MapPin size={11} /> {COUNTRIES[g.country] || g.country}
                    </div>
                  )}
                </div>
                <div className="guest-card-right">
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 24, height: 22, borderRadius: 11,
                    fontSize: 12, fontWeight: 700,
                    background: g.total_stays > 0 ? 'rgba(99,102,241,0.15)' : 'var(--bg-tertiary)',
                    color: g.total_stays > 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                    padding: '0 6px',
                  }}>
                    {g.total_stays}
                  </span>
                  <div className="guest-card-stays">візитів</div>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Pagination */}
          {!loading && totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 24 }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Назад</button>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{page} / {totalPages}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Вперед</button>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════
           View Guest Detail Modal
           ═══════════════════════════════════════════════════ */}
        <Modal open={!!viewGuest || viewLoading} onClose={() => { setViewGuest(null); setViewLoading(false); }} title="Картка гостя" size="lg"
          footer={viewGuest ? <>
            <button className="btn btn-secondary" onClick={() => setViewGuest(null)}>Закрити</button>
            <div className="flex gap-2">
              <button className="btn btn-secondary" style={{ color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}
                onClick={() => { if (viewGuest) { handleDelete(viewGuest as GuestRow); } }}>
                <Trash2 size={14} /> Видалити
              </button>
              <button className="btn btn-primary"
                onClick={() => { if (viewGuest) { openEditGuest(viewGuest as GuestRow); } }}>
                <Edit3 size={14} /> Редагувати
              </button>
            </div>
          </> : undefined}>
          {viewLoading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Loader2 size={24} className="animate-pulse" style={{ display: 'inline-block' }} />
              <div style={{ marginTop: 8, color: 'var(--text-tertiary)' }}>Завантаження...</div>
            </div>
          )}
          {viewGuest && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Person info header */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-hover))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 20, fontWeight: 700, flexShrink: 0,
                }}>
                  {viewGuest.first_name[0]}{viewGuest.last_name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{viewGuest.first_name} {viewGuest.last_name}</div>
                  <div className="flex gap-3" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                    {viewGuest.email && (
                      <span className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        <Mail size={13} /> {viewGuest.email}
                      </span>
                    )}
                    {viewGuest.phone && (
                      <span className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        <Phone size={13} /> {viewGuest.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Візити</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--accent-primary)' }}>{viewGuest.total_stays}</div>
                </div>
                <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Загальний дохід</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--accent-success)' }}>{(viewGuest.total_revenue || 0).toLocaleString()} CZK</div>
                </div>
                <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Дата створення</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{viewGuest.created_at?.split('T')[0] || viewGuest.created_at?.split(' ')[0]}</div>
                </div>
              </div>

              {/* Detail grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Address block */}
                <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={12} /> Адреса
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                    {viewGuest.country && <div>{COUNTRIES[viewGuest.country] || viewGuest.country}</div>}
                    {viewGuest.city && <div>{viewGuest.city}</div>}
                    {viewGuest.address && <div>{viewGuest.address}</div>}
                    {!viewGuest.country && !viewGuest.city && !viewGuest.address && (
                      <span style={{ color: 'var(--text-tertiary)' }}>Не вказано</span>
                    )}
                  </div>
                </div>

                {/* Document block */}
                <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={12} /> Документ
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                    {viewGuest.document_type && <div>{DOC_TYPES[viewGuest.document_type] || viewGuest.document_type}</div>}
                    {viewGuest.document_number && <div style={{ fontWeight: 600, fontFamily: 'monospace', letterSpacing: 1 }}>{viewGuest.document_number}</div>}
                    {viewGuest.date_of_birth && (
                      <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                        <Calendar size={12} style={{ color: 'var(--text-tertiary)' }} />
                        <span>Дата народження: {viewGuest.date_of_birth}</span>
                      </div>
                    )}
                    {!viewGuest.document_type && !viewGuest.document_number && !viewGuest.date_of_birth && (
                      <span style={{ color: 'var(--text-tertiary)' }}>Не вказано</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes */}
              {viewGuest.notes && (
                <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Нотатки</div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{viewGuest.notes}</div>
                </div>
              )}

              {/* Reservations */}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={16} /> Історія бронювань
                  <span style={{
                    fontSize: 11, fontWeight: 700, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)',
                    padding: '2px 8px', borderRadius: 10,
                  }}>
                    {viewGuest.reservations?.length || 0}
                  </span>
                </div>
                {(!viewGuest.reservations || viewGuest.reservations.length === 0) ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                    Бронювань немає
                  </div>
                ) : (
                  <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
                    <table className="table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Заїзд</th>
                          <th>Виїзд</th>
                          <th>Юніт</th>
                          <th>Гостей</th>
                          <th>Статус</th>
                          <th>Оплата</th>
                          <th>Сума</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewGuest.reservations.map((r) => (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 500 }}>{r.check_in}</td>
                            <td>{r.check_out}</td>
                            <td><span className="badge badge-primary">{r.unit_name}</span></td>
                            <td style={{ fontSize: 12 }}>
                              {r.adults}{r.children > 0 && <span style={{ color: 'var(--text-tertiary)' }}> +{r.children}</span>}
                            </td>
                            <td>
                              <span className={`badge ${STATUS_MAP[r.status]?.badge || 'badge-info'}`}>
                                {STATUS_MAP[r.status]?.label || r.status}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                color: PAYMENT_STATUS_MAP[r.payment_status]?.color || '#888',
                                background: PAYMENT_STATUS_MAP[r.payment_status]?.bg || 'rgba(128,128,128,0.1)',
                              }}>
                                {PAYMENT_STATUS_MAP[r.payment_status]?.label || r.payment_status}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700 }}>{(r.total_price || 0).toLocaleString()} {r.currency}</td>
                            <td>
                              <a href="/bookings" style={{ color: 'var(--accent-primary)' }} title="Перейти до бронювань">
                                <ExternalLink size={14} />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* ═══════════════════════════════════════════════════
           Add Guest Modal
           ═══════════════════════════════════════════════════ */}
        <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Додати гостя" size="lg"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Скасувати</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />} Додати гостя
            </button>
          </>}>
          {renderForm()}
        </Modal>

        {/* ═══════════════════════════════════════════════════
           Edit Guest Modal
           ═══════════════════════════════════════════════════ */}
        <Modal open={!!editGuest} onClose={() => setEditGuest(null)} title="Редагувати гостя" size="lg"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setEditGuest(null)}>Скасувати</button>
            <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />} Зберегти зміни
            </button>
          </>}>
          {renderForm()}
        </Modal>
      </div>
    </>
  );
}

function GuestsPageContent() {
  const { isMobile } = useDevice();
  const searchParams = useSearchParams();
  const openNew = searchParams?.get('new') === '1' || searchParams?.get('create') === '1';

  if (isMobile) {
    return <MobileGuests openNew={openNew} />;
  }

  return <DesktopGuests />;
}

export default function GuestsPage() {
  return (
    <Suspense fallback={null}>
      <GuestsPageContent />
    </Suspense>
  );
}
