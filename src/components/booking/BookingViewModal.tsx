'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Edit3, X, Save, Plus, Check, Copy, ExternalLink,
  Loader2, Trash2, Phone, Mail, MessageCircle, Receipt, RefreshCw,
  CreditCard, FileText, Users, Landmark, StickyNote, History,
  Clock, Lock,
} from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_LABELS: Record<string, string> = {
  draft: 'Чернетка',
  tentative: 'Очікується',
  confirmed: 'Підтверджено',
  checked_in: 'Заселено',
  checked_out: 'Виселено',
  cancelled: 'Скасовано',
};

const METHOD_LABELS: Record<string, string> = {
  cash: '💵 Готівка', card: '💳 Картою', bank_transfer: '🏦 На рахунок', invoice: '📄 Фактура',
  booking_platform: '🏨 Платформа бронювання',
};

const TYPE_LABELS: Record<string, string> = {
  deposit: 'Передплата', full: 'Повна', partial: 'Часткова', refund: 'Повернення',
};

const WEEKDAY_SHORT = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function formatDate(iso: string): { date: string; day: string } {
  if (!iso) return { date: '—', day: '' };
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return { date: iso, day: '' };
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return { date: `${dd}.${mm}.${d.getFullYear()}`, day: WEEKDAY_SHORT[d.getDay()] };
}

function toEur(czk: number) { return Math.round(czk / 25.5).toLocaleString(); }

function nightsLabel(n: number): string {
  if (n === 1) return 'ніч';
  if (n >= 2 && n <= 4) return 'ночі';
  return 'ночей';
}

function adultsLabel(n: number): string {
  if (n === 1) return 'дорослий';
  return 'дорослих';
}

interface Props {
  booking: any;
  payments: any[];
  registrations: any[];
  activityLog: any[];
  sourceMap: Record<string, { label: string; color: string }>;
  onClose: () => void;
  onEdit: () => void;
  onChangeStatus: (id: string, status: string) => void;
  onFetchPayments: (id: string) => void;
  onFetchBookings: () => void;
  onFetchRegistrations: (id: string) => void;
  showToast: (msg: string) => void;
  setBooking: (b: any) => void;
}

export default function BookingViewModal({
  booking: b, payments, registrations, activityLog, sourceMap,
  onClose, onEdit, onChangeStatus, onFetchPayments, onFetchBookings, onFetchRegistrations,
  showToast, setBooking,
}: Props) {
  const [viewTab, setViewTab] = useState<'payment' | 'registration' | 'groups' | 'tax' | 'notes' | 'history'>('payment');
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', type: 'partial', notes: '' });
  const [savingPay, setSavingPay] = useState(false);
  const [regForm, setRegForm] = useState({ firstName: '', lastName: '', dateOfBirth: '', documentType: 'ID_CARD', documentNumber: '', nationality: '', country: '', address: '' });
  const [savingReg, setSavingReg] = useState(false);
  const [invoice, setInvoice] = useState<{ id: string; invoice_number: string; issued_at: string; amount: number; currency: string } | null>(null);
  const [reissuing, setReissuing] = useState(false);

  const [subBookings, setSubBookings] = useState<any[]>([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupForm, setGroupForm] = useState({ label: '', unitId: '', adults: 1, children: 0, subtotal: 0, notes: '' });
  const [savingGroup, setSavingGroup] = useState(false);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [editingLineItems, setEditingLineItems] = useState<string | null>(null);
  const [newLineItem, setNewLineItem] = useState({ description: '', quantity: 1, unit_price: 0 });
  const [availableUnits, setAvailableUnits] = useState<{ id: string; name: string; code: string; category_name: string }[]>([]);

  const bAny = b as any;
  const [companyMode, setCompanyMode] = useState(!!bAny.invoice_company_name);
  const [company, setCompany] = useState({
    name: bAny.invoice_company_name || '',
    ico: bAny.invoice_company_ico || '',
    dic: bAny.invoice_company_dic || '',
    address: bAny.invoice_company_address || '',
    city: bAny.invoice_company_city || '',
    country: bAny.invoice_company_country || '',
    email: bAny.invoice_company_email || '',
  });
  const [savingCompany, setSavingCompany] = useState(false);

  const persistCompany = async (mode: boolean, fields: typeof company) => {
    setSavingCompany(true);
    try {
      const payload = mode
        ? {
            invoice_company_name: fields.name || null,
            invoice_company_ico: fields.ico || null,
            invoice_company_dic: fields.dic || null,
            invoice_company_address: fields.address || null,
            invoice_company_city: fields.city || null,
            invoice_company_country: fields.country || null,
            invoice_company_email: fields.email || null,
          }
        : {
            invoice_company_name: null, invoice_company_ico: null, invoice_company_dic: null,
            invoice_company_address: null, invoice_company_city: null, invoice_company_country: null,
            invoice_company_email: null,
          };
      const res = await fetch(`/api/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) showToast('❌ Не вдалося зберегти');
    } catch { showToast('❌ Помилка'); }
    finally { setSavingCompany(false); }
  };

  useEffect(() => {
    if (!b?.id) return;
    fetch(`/api/bookings/${b.id}/invoice`)
      .then(r => r.json())
      .then(data => setInvoice(data))
      .catch(() => setInvoice(null));
  }, [b?.id, b?.payment_status]);

  const fetchSubBookings = async () => {
    if (!b?.id) return;
    try {
      const res = await fetch(`/api/bookings/${b.id}/sub-bookings`);
      const data = await res.json();
      if (Array.isArray(data)) setSubBookings(data);
    } catch { setSubBookings([]); }
  };
  useEffect(() => { fetchSubBookings(); }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/units')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAvailableUnits(data); })
      .catch(() => {});
  }, []);

  const handleReissue = async () => {
    const isFresh = !invoice;
    const confirmMsg = isFresh
      ? 'Згенерувати фактуру для цього бронювання?'
      : `Перевиставити фактуру ${invoice!.invoice_number}? Стара буде скасована.`;
    if (!confirm(confirmMsg)) return;
    setReissuing(true);
    try {
      const res = await fetch(`/api/bookings/${b.id}/invoice/reissue`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setInvoice(data.invoice);
        showToast(isFresh
          ? `✅ Фактуру ${data.invoice.invoice_number} створено`
          : `✅ Фактуру ${data.invoice.invoice_number} перевиставлено`);
      } else {
        showToast(isFresh ? '❌ Помилка створення' : '❌ Помилка перевиставлення');
      }
    } catch { showToast('❌ Помилка'); }
    finally { setReissuing(false); }
  };

  const handleAddPayment = async () => {
    if (savingPay) return;
    if (!payForm.amount || Number(payForm.amount) <= 0) return;
    setSavingPay(true);
    try {
      let res: Response;
      try {
        res = await fetch('/api/payments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservation_id: b.id, amount: Number(payForm.amount), method: payForm.method, type: payForm.type, notes: payForm.notes || undefined }),
        });
      } catch (netErr: any) {
        showToast(`❌ Мережева помилка: ${netErr?.message || 'нема відповіді'}`);
        return;
      }
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        showToast(`❌ ${data?.error || `Помилка ${res.status}`}`);
        return;
      }
      setPayForm({ amount: '', method: 'cash', type: 'partial', notes: '' });
      setShowPayForm(false);
      onFetchPayments(b.id);
      onFetchBookings();
      const msg = data?.kind === 'marker'
        ? '✅ Позначка збережена. Реальна транзакція з\'явиться через Teya / банк.'
        : 'Платіж додано!';
      showToast(msg);
    } finally {
      setSavingPay(false);
    }
  };

  const total = b.total_price || 0;
  const paidFromOps = payments.filter(p => p.status === 'completed').reduce((s: number, p: any) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
  const isPaid = b.payment_status === 'paid' || b.payment_status === 'prepaid';
  const paid = isPaid && paidFromOps === 0 ? total : paidFromOps;
  const remaining = Math.max(0, total - paid);
  const pct = isPaid ? 100 : total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const barColor = pct >= 100 ? '#22c55e' : pct > 0 ? '#3b82f6' : '#ef4444';
  const isRegistered = b.registration_status === 'registered';
  const canCheckIn = isPaid && isRegistered;
  const regNeeded = b.adults || 1;
  const regBadge = `${registrations.length}/${regNeeded}`;
  const sourceInfo = sourceMap[b.source] || { label: b.source || 'Direct', color: '#6c7086' };
  const checkIn = formatDate(b.check_in);
  const checkOut = formatDate(b.check_out);
  const guestPhoneClean = useMemo(() => (b.guest_phone || '').replace(/[^\d+]/g, ''), [b.guest_phone]);

  const saveRegistration = async (formData: any) => {
    setSavingReg(true);
    try {
      const res = await fetch(`/api/bookings/${b.id}/registrations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Помилка'); return; }
      setRegForm({ firstName: '', lastName: '', dateOfBirth: '', documentType: 'ID_CARD', documentNumber: '', nationality: '', country: '', address: '' });
      onFetchRegistrations(b.id);
      onFetchBookings();
      showToast('Гостя зареєстровано!');
    } catch { showToast('Помилка реєстрації'); }
    finally { setSavingReg(false); }
  };

  const deleteRegistration = async (regId: string) => {
    if (!confirm('Видалити реєстрацію гостя?')) return;
    await fetch(`/api/bookings/${b.id}/registrations?reg_id=${regId}`, { method: 'DELETE' });
    onFetchRegistrations(b.id);
    onFetchBookings();
    showToast('Реєстрацію видалено');
  };

  const handleTogglePaymentRequest = async () => {
    const ns = b.payment_status === 'payment_requested' ? 'unpaid' : 'payment_requested';
    await fetch(`/api/bookings/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_status: ns }),
    });
    setBooking({ ...b, payment_status: ns });
    onFetchBookings();
    showToast(ns === 'payment_requested' ? 'Запит надіслано' : 'Скасовано');
  };

  const StatusIcon = ({ kind, label, sub }: { kind: 'ok' | 'wait' | 'fail' | 'default'; label: string; sub?: string }) => {
    const colors: Record<string, { bg: string; fg: string }> = {
      ok:      { bg: 'rgba(74,222,128,0.14)',  fg: '#4ADE80' },
      wait:    { bg: 'rgba(245,184,71,0.14)',  fg: '#F5B847' },
      fail:    { bg: 'rgba(242,107,107,0.14)', fg: '#F26B6B' },
      default: { bg: 'var(--bg-tertiary)',     fg: 'var(--text-tertiary)' },
    };
    const c = colors[kind];
    const Icon = kind === 'ok' ? Check : kind === 'wait' ? Clock : kind === 'fail' ? X : Lock;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, background: c.bg, color: c.fg }}>
          <Icon size={20} strokeWidth={2.2} />
        </div>
        <div style={{ fontSize: 12, color: kind === 'default' ? 'var(--text-secondary)' : c.fg, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'ui-monospace, monospace', marginTop: -2 }}>{sub}</div>}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          width: 'min(900px, 94vw)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.25s ease',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderBottom: '1px solid var(--border-primary)',
          flexShrink: 0,
        }}>
          <button onClick={onClose} className="modal-close" aria-label="Закрити"
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}>
            <X size={20} />
          </button>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Бронювання</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'ui-monospace, monospace' }}>#{b.id}</span>
          </div>
          <div style={{ width: 32 }}>
            <span className={`badge ${({
              draft: 'badge-info', tentative: 'badge-warning', confirmed: 'badge-success',
              checked_in: 'badge-primary', checked_out: 'badge-info', cancelled: 'badge-danger',
            } as Record<string, string>)[b.status] || ''}`} style={{ fontSize: 10 }}>
              {STATUS_LABELS[b.status] || b.status}
            </span>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Multi-room warning */}
          {(b as any).is_multi_room && (
            <div style={{
              margin: '12px 18px 0', padding: '10px 14px', borderRadius: 8,
              background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.3)', fontSize: 12, lineHeight: 1.45,
            }}>
              <strong>⚠️ Multi-room</strong> — Hostex колапсує групове бронювання Booking.com в один запис.
              Сума {total.toLocaleString()} CZK може покривати <strong>кілька будинків</strong>.
              Перевір у Hostex (маркер <code>{(b as any).multi_room_marker || '?'}</code>) і за потреби створи окремі рядки —
              інакше календар не заблокує інші будинки.
            </div>
          )}

          {/* Guest section */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px' }}>
                {b.first_name} {b.last_name}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-primary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {total.toLocaleString()} CZK
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span style={{ padding: '2px 8px', background: 'var(--bg-tertiary)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>
                  {b.unit_code || b.unit_name}
                </span>
                <span style={{ padding: '2px 8px', background: `${sourceInfo.color}26`, borderRadius: 4, fontSize: 11, fontWeight: 600, color: sourceInfo.color, fontFamily: 'ui-monospace, monospace' }}>
                  {sourceInfo.label}
                </span>
                {b.hostex_channel_type && (
                  <span style={{ padding: '2px 8px', background: 'rgba(255,107,53,0.15)', color: '#ff6b35', borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
                    Hostex: {b.hostex_channel_type}
                  </span>
                )}
                {(b as any).is_multi_room && (
                  <span style={{ padding: '2px 8px', background: 'rgba(245,158,11,0.15)', color: '#92400e', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                    ⚠️ Multi-room
                  </span>
                )}
                <span style={{ width: 3, height: 3, background: 'var(--text-tertiary)', borderRadius: '50%' }} />
                <span>{b.nights} {nightsLabel(b.nights)}</span>
                <span style={{ width: 3, height: 3, background: 'var(--text-tertiary)', borderRadius: '50%' }} />
                <span>{b.adults} {adultsLabel(b.adults)}{b.children > 0 ? ` + ${b.children} діт.` : ''}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'right' }}>
                ≈ {toEur(total)} EUR
                {(b.commission_amount || 0) > 0 && (
                  <span style={{ marginLeft: 8, color: '#f59e0b' }}>· комісія {(b.commission_amount || 0).toLocaleString()}</span>
                )}
              </div>
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              {[
                { lbl: 'Заїзд', val: checkIn },
                { lbl: 'Виїзд', val: checkOut },
              ].map(d => (
                <div key={d.lbl} style={{
                  display: 'flex', flexDirection: 'column', gap: 3,
                  padding: '9px 12px', background: 'var(--bg-tertiary)',
                  borderRadius: 8, border: '1px solid var(--border-primary)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 600 }}>{d.lbl}</div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {d.val.date}
                    {d.val.day && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6, fontWeight: 400 }}>{d.val.day}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Contacts */}
            {(b.guest_phone || b.guest_email) && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {b.guest_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}>
                    <Phone size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{b.guest_phone}</span>
                    <a href={`tel:${guestPhoneClean}`} title="Подзвонити"
                      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(74,222,128,0.4)', background: 'rgba(74,222,128,0.1)', color: '#4ADE80', textDecoration: 'none' }}>
                      <Phone size={13} />
                    </a>
                    <a href={`https://wa.me/${guestPhoneClean.replace(/^\+/, '')}`} target="_blank" rel="noopener" title="WhatsApp"
                      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(74,222,128,0.4)', background: 'rgba(74,222,128,0.1)', color: '#4ADE80', textDecoration: 'none' }}>
                      <MessageCircle size={13} />
                    </a>
                  </div>
                )}
                {b.guest_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 240 }}>
                    <Mail size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{b.guest_email}</span>
                    <a href={`mailto:${b.guest_email}`} title="Email"
                      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(91,124,255,0.4)', background: 'rgba(91,124,255,0.1)', color: '#5B7CFF', textDecoration: 'none' }}>
                      <Mail size={13} />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status icons row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '12px 18px', borderBottom: '1px solid var(--border-primary)' }}>
            <StatusIcon
              kind={['confirmed','checked_in','checked_out'].includes(b.status) ? 'ok' : 'default'}
              label="Підтверджено"
            />
            <StatusIcon
              kind={isPaid ? 'ok' : (b.payment_status === 'payment_requested' ? 'wait' : 'fail')}
              label="Оплата"
              sub={isPaid ? undefined : `${pct}%`}
            />
            <StatusIcon
              kind={isRegistered ? 'ok' : 'fail'}
              label="Реєстрація"
              sub={regBadge}
            />
            <StatusIcon
              kind={['checked_in','checked_out'].includes(b.status) ? 'ok' : 'default'}
              label="Заселено"
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderBottom: '1px solid var(--border-primary)', flexWrap: 'wrap' }}>
            {b.status === 'confirmed' && (
              <button className="btn btn-sm btn-primary" disabled={!canCheckIn}
                onClick={() => onChangeStatus(b.id, 'checked_in')}
                title={!canCheckIn ? 'Спочатку оплата та реєстрація' : ''}>
                <Check size={14} /> Заселити
                {!canCheckIn && <Lock size={11} style={{ marginLeft: 4, opacity: 0.7 }} />}
              </button>
            )}
            {b.status === 'checked_in' && (
              <button className="btn btn-sm btn-primary" onClick={() => onChangeStatus(b.id, 'checked_out')}>
                <Check size={14} /> Виселити
              </button>
            )}
            {b.status === 'tentative' && (
              <button className="btn btn-sm btn-primary" onClick={() => onChangeStatus(b.id, 'confirmed')}>
                <Check size={14} /> Підтвердити
              </button>
            )}
            {!['cancelled', 'checked_out'].includes(b.status) && (
              <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }}
                onClick={() => { if (confirm('Скасувати бронювання?')) onChangeStatus(b.id, 'cancelled'); }}>
                <X size={14} /> Скасувати
              </button>
            )}
            <button className={`btn btn-sm ${b.payment_status === 'payment_requested' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={handleTogglePaymentRequest}>
              <Mail size={13} /> {b.payment_status === 'payment_requested' ? 'Запит надіслано' : 'Запит оплати'}
            </button>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', padding: '0 14px', borderBottom: '1px solid var(--border-primary)', overflowX: 'auto' }}>
            {([
              { k: 'payment' as const, l: 'Оплата', Icon: CreditCard, badge: !isPaid && total > 0 ? `${pct}%` : undefined },
              { k: 'registration' as const, l: 'Реєстрація', Icon: FileText, badge: !isRegistered ? regBadge : undefined },
              { k: 'groups' as const, l: 'Групи', Icon: Users, badge: subBookings.length > 0 ? String(subBookings.length) : undefined },
              { k: 'tax' as const, l: 'Збір', Icon: Landmark, badge: undefined as string | undefined },
              { k: 'notes' as const, l: 'Примітки', Icon: StickyNote, badge: undefined as string | undefined },
              { k: 'history' as const, l: 'Історія', Icon: History, badge: undefined as string | undefined },
            ]).map(t => (
              <button key={t.k} onClick={() => setViewTab(t.k)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '11px 14px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: viewTab === t.k ? 700 : 500,
                  color: viewTab === t.k ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  borderBottom: viewTab === t.k ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  whiteSpace: 'nowrap',
                }}>
                <t.Icon size={14} strokeWidth={1.8} />
                {t.l}
                {t.badge && (
                  <span style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(242,107,107,0.15)', color: '#F26B6B', borderRadius: 3, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '16px 18px', minHeight: 200 }}>

            {viewTab === 'payment' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>Всього</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{total.toLocaleString()} CZK</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>Оплачено</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#22c55e', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{paid.toLocaleString()} CZK</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>Залишок</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: remaining > 0 ? '#f59e0b' : '#22c55e', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{remaining.toLocaleString()} CZK</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, background: 'var(--bg-tertiary)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: barColor, minWidth: 36, fontFamily: 'ui-monospace, monospace' }}>{pct}%</span>
                </div>

                {/* Zero-price warning */}
                {total === 0 && !isPaid && (
                  <div style={{ padding: '14px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>
                      <span style={{ fontSize: 18 }}>⚠️</span>
                      Безоплатне бронювання
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Ціна = 0 CZK. Це може бути промокод, бартер або помилка. Підтвердіть свідомо або встановіть реальну ціну.
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-primary"
                        onClick={async () => {
                          if (!confirm('Підтвердити безоплатне бронювання? Гість зможе заселитись без оплати.')) return;
                          await fetch(`/api/bookings/${b.id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ payment_status: 'paid' }),
                          });
                          setBooking({ ...b, payment_status: 'paid' });
                          onFetchBookings();
                          showToast('✅ Безоплатне бронювання підтверджено');
                        }}>
                        ✅ Підтвердити — це свідоме рішення
                      </button>
                      <button className="btn btn-sm btn-secondary" onClick={onEdit}>
                        ✏️ Встановити ціну
                      </button>
                    </div>
                  </div>
                )}

                {/* Payments list */}
                {payments.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700, marginBottom: 6 }}>Транзакції</div>
                    {payments.map((p: any) => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'var(--bg-secondary)', borderRadius: 7, marginBottom: 4, fontSize: 12.5 }}>
                        <span style={{ color: 'var(--text-tertiary)', minWidth: 80, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>{p.paid_at || '—'}</span>
                        <span style={{ fontWeight: 700, color: p.type === 'refund' ? '#ef4444' : '#22c55e', minWidth: 100, fontVariantNumeric: 'tabular-nums' }}>{p.type === 'refund' ? '-' : '+'}{p.amount.toLocaleString()} CZK</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{METHOD_LABELS[p.method] || p.method}</span>
                        <span style={{ color: 'var(--text-tertiary)' }}>{TYPE_LABELS[p.type] || p.type}</span>
                        {p.notes && <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes}</span>}
                        <button title="Видалити"
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                          onClick={async () => {
                            if (!confirm('Видалити?')) return;
                            await fetch(`/api/payments/${p.id}`, { method: 'DELETE' });
                            onFetchPayments(b.id);
                            onFetchBookings();
                            showToast('Видалено');
                          }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add payment */}
                {!showPayForm ? (
                  <button className="btn btn-sm btn-secondary" style={{ width: '100%' }} onClick={() => setShowPayForm(true)}>
                    <Plus size={14} /> Додати платіж
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="form-input" type="number" placeholder="Сума CZK" style={{ flex: 1, fontSize: 13 }} value={payForm.amount}
                        onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} />
                      <select className="form-select" style={{ width: 170, fontSize: 13 }} value={payForm.method}
                        onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}>
                        <option value="cash">💵 Готівка</option>
                        <option value="card">💳 Картою</option>
                        <option value="bank_transfer">🏦 Рахунок</option>
                        <option value="invoice">📄 Фактура</option>
                        <option value="booking_platform">🏨 Платформа</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select className="form-select" style={{ flex: 1, fontSize: 13 }} value={payForm.type}
                        onChange={e => setPayForm(p => ({ ...p, type: e.target.value }))}>
                        <option value="deposit">Передплата</option>
                        <option value="partial">Часткова</option>
                        <option value="full">Повна</option>
                        <option value="refund">Повернення</option>
                      </select>
                      <input className="form-input" placeholder="Примітка" style={{ flex: 2, fontSize: 13 }} value={payForm.notes}
                        onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                    {payForm.method !== 'cash' && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '6px 10px', background: 'rgba(99,102,241,0.08)', borderRadius: 6, lineHeight: 1.4 }}>
                        ℹ️ Це <b>позначка статусу</b> — реальна транзакція з&apos;явиться в Операціях, коли надійде з{' '}
                        {payForm.method === 'card' ? 'Teya sync' : payForm.method === 'bank_transfer' ? 'банківської виписки' : payForm.method === 'booking_platform' ? 'виписки платформи' : 'фактичного джерела'}.
                        Оплата картою / банком / платформою тут не створює подвійних записів у фінансах.
                      </div>
                    )}
                    {remaining > 0 && (
                      <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, alignSelf: 'flex-start' }}
                        onClick={() => setPayForm(p => ({ ...p, amount: String(remaining), type: remaining === total ? 'full' : 'partial' }))}>
                        Залишок: {remaining.toLocaleString()} CZK
                      </button>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm btn-ghost" disabled={savingPay} onClick={() => setShowPayForm(false)}>Скасувати</button>
                      <button className="btn btn-sm btn-primary"
                        disabled={savingPay || !payForm.amount || Number(payForm.amount) <= 0}
                        onClick={handleAddPayment}>
                        {savingPay ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        {' '}{payForm.method === 'cash' ? 'Зберегти платіж' : 'Позначити як оплачено'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Invoice-to-company override */}
                <div style={{ padding: '10px 14px', background: 'var(--surface-elevated, var(--bg-secondary))', border: '1px solid var(--border, var(--border-primary))', borderRadius: 'var(--radius-md)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={companyMode}
                      onChange={async (e) => {
                        const next = e.target.checked;
                        setCompanyMode(next);
                        await persistCompany(next, company);
                        if (invoice) {
                          showToast('ℹ️ Натисни "Перевиставити" щоб оновити фактуру');
                        }
                      }}
                    />
                    🏢 Виставити фактуру на компанію
                    {savingCompany && <Loader2 size={12} className="animate-spin" style={{ marginLeft: 'auto' }} />}
                  </label>
                  {companyMode && (
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input placeholder="Назва компанії *" value={company.name}
                        onChange={(e) => setCompany({ ...company, name: e.target.value })}
                        onBlur={() => persistCompany(true, company)}
                        style={{ gridColumn: 'span 2', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-primary)', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                      <input placeholder="IČO" value={company.ico}
                        onChange={(e) => setCompany({ ...company, ico: e.target.value })}
                        onBlur={() => persistCompany(true, company)}
                        style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-primary)', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                      <input placeholder="DIČ (опціонально)" value={company.dic}
                        onChange={(e) => setCompany({ ...company, dic: e.target.value })}
                        onBlur={() => persistCompany(true, company)}
                        style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-primary)', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                      <input placeholder="Адреса" value={company.address}
                        onChange={(e) => setCompany({ ...company, address: e.target.value })}
                        onBlur={() => persistCompany(true, company)}
                        style={{ gridColumn: 'span 2', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-primary)', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                      <input placeholder="Місто" value={company.city}
                        onChange={(e) => setCompany({ ...company, city: e.target.value })}
                        onBlur={() => persistCompany(true, company)}
                        style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-primary)', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                      <input placeholder="Країна (CZ, SK, DE, …)" value={company.country}
                        onChange={(e) => setCompany({ ...company, country: e.target.value.toUpperCase() })}
                        onBlur={() => persistCompany(true, company)}
                        style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-primary)', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                      <input placeholder="Email" value={company.email}
                        onChange={(e) => setCompany({ ...company, email: e.target.value })}
                        onBlur={() => persistCompany(true, company)}
                        style={{ gridColumn: 'span 2', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-primary)', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                      {invoice && (
                        <div style={{ gridColumn: 'span 2', fontSize: 11, color: 'var(--text-tertiary)' }}>
                          ℹ️ Після зміни — натисни &quot;Перевиставити&quot; в блоці фактури нижче, щоб оновити документ.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Invoice block */}
                {invoice ? (
                  <div style={{ padding: '12px 14px', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Receipt size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>Фактура {invoice.invoice_number}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{invoice.issued_at} · {invoice.amount.toLocaleString()} {invoice.currency}</div>
                    </div>
                    <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() => window.open(`/api/invoices/${invoice.id}`, '_blank')}>
                      👁 Переглянути
                    </button>
                    <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: '4px 8px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={handleReissue} disabled={reissuing}>
                      {reissuing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Перевиставити
                    </button>
                  </div>
                ) : isPaid ? (
                  <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-md)', fontSize: 12, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Receipt size={14} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>Інвойс ще не згенеровано</span>
                    <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={handleReissue} disabled={reissuing}>
                      {reissuing ? <Loader2 size={12} className="animate-spin" /> : <Receipt size={12} />}
                      Згенерувати
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            {viewTab === 'registration' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 10,
                  background: isRegistered ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${isRegistered ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                  <span style={{ fontSize: 18 }}>{isRegistered ? '✅' : '❌'}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: isRegistered ? '#22c55e' : '#ef4444' }}>
                      {isRegistered ? 'Реєстрація завершена' : `Зареєструйте ще ${regNeeded - registrations.length} гостей`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{registrations.length} з {regNeeded}</div>
                  </div>
                </div>

                {registrations.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>Зареєстровані</div>
                    {registrations.map((r: any) => (
                      <div key={r.reg_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', marginBottom: 6 }}>
                        <span style={{ fontSize: 20 }}>👤</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.last_name} {r.first_name} {r.is_primary ? '⭐' : ''}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span>🪪 {r.document_type}: {r.document_number}</span>
                            {r.nationality && <span>🌐 {r.nationality}</span>}
                            {r.country && <span>🏳️ {r.country}</span>}
                            {r.date_of_birth && <span>🎂 {r.date_of_birth}</span>}
                          </div>
                          {r.address && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>🏠 {r.address}</div>}
                        </div>
                        <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => deleteRegistration(r.reg_id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {registrations.length < regNeeded && (
                  <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-primary)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>➕ Гість #{registrations.length + 1}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Прізвище *</label>
                        <input className="form-input" placeholder="ROTARU" value={regForm.lastName} onChange={e => setRegForm(p => ({ ...p, lastName: e.target.value }))} style={{ textTransform: 'uppercase' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Ім&apos;я *</label>
                        <input className="form-input" placeholder="MARIN" value={regForm.firstName} onChange={e => setRegForm(p => ({ ...p, firstName: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Дата народження</label>
                        <input className="form-input" type="date" value={regForm.dateOfBirth} onChange={e => setRegForm(p => ({ ...p, dateOfBirth: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Тип документа</label>
                        <select className="form-select" value={regForm.documentType} onChange={e => setRegForm(p => ({ ...p, documentType: e.target.value }))}>
                          <option value="ID_CARD">ID Card</option>
                          <option value="PASSPORT">Passport</option>
                          <option value="DRIVING_LICENCE">Driving Licence</option>
                          <option value="TRAVEL_DOCUMENT">Travel Document</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Номер документа *</label>
                        <input className="form-input" placeholder="RK381280" value={regForm.documentNumber} onChange={e => setRegForm(p => ({ ...p, documentNumber: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Національність</label>
                        <input className="form-input" placeholder="Romanian" value={regForm.nationality} onChange={e => setRegForm(p => ({ ...p, nationality: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Країна (код)</label>
                        <input className="form-input" placeholder="ROU" maxLength={3} value={regForm.country} onChange={e => setRegForm(p => ({ ...p, country: e.target.value.toUpperCase() }))} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Адреса</label>
                        <input className="form-input" placeholder="Str.C.A.Rosetti nr.15..." value={regForm.address} onChange={e => setRegForm(p => ({ ...p, address: e.target.value }))} />
                      </div>
                    </div>
                    <button className="btn btn-sm btn-primary" style={{ marginTop: 12, width: '100%' }}
                      disabled={savingReg || !regForm.lastName || !regForm.firstName || !regForm.documentNumber}
                      onClick={() => saveRegistration({ ...regForm, isPrimary: registrations.length === 0 })}>
                      {savingReg ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Зареєструвати
                    </button>
                  </div>
                )}
              </div>
            )}

            {viewTab === 'tax' && (() => {
              const taxAmt = b.city_tax_amount || 0;
              const taxIncluded = !!b.city_tax_included;
              const taxPaid = b.city_tax_paid || 'pending';
              const txMap: Record<string, { label: string; color: string; icon: string }> = {
                pending: { label: 'Очікує', color: '#f59e0b', icon: '⏳' },
                paid: { label: 'Оплачено', color: '#22c55e', icon: '✅' },
                exempt: { label: 'Звільнено', color: '#6c7086', icon: '🚫' },
              };
              const ts = txMap[taxPaid] || txMap.pending;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>🏛️ Туристичний збір</div>
                      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{taxAmt.toLocaleString()} CZK</div>
                      {taxIncluded && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Включено у вартість</div>}
                    </div>
                    <span className="badge" style={{ background: ts.color + '22', color: ts.color, fontSize: 13 }}>{ts.icon} {ts.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {b.adults} дор. × {b.nights} н. × 25 CZK = {b.adults * b.nights * 25} CZK
                  </div>
                </div>
              );
            })()}

            {viewTab === 'notes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {b.notes && (
                  <div style={{ padding: 14, background: 'rgba(59,130,246,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <div style={{ fontSize: 11, color: '#3b82f6', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>📋 Інформація (Hostex)</div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{b.notes}</div>
                  </div>
                )}
                {b.internal_notes ? (
                  <div style={{ padding: 14, background: 'rgba(250,204,21,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(250,204,21,0.2)' }}>
                    <div style={{ fontSize: 11, color: '#facc15', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>📝 Внутрішні примітки</div>
                    <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{b.internal_notes}</div>
                  </div>
                ) : (
                  !b.notes && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>Немає приміток</div>
                )}
              </div>
            )}

            {viewTab === 'groups' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {subBookings.length === 0 && !showGroupForm && (
                  <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🏠</div>
                    <p style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-secondary)' }}>Мульти-групове бронювання</p>
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4, maxWidth: 420, margin: '0 auto 16px' }}>
                      Додайте групи гостей — кожна група прив&apos;язується до свого юніту (кімната, будинок, місце на кемпінгу).
                      Юніт автоматично блокується в календарі на ті ж дати.
                    </p>
                  </div>
                )}

                {subBookings.map((sb: any, idx: number) => {
                  const isExpanded = expandedSubs.has(sb.id);
                  return (
                    <div key={sb.id} style={{
                      border: '1px solid var(--border-primary)', borderRadius: 10,
                      background: 'var(--bg-secondary)', overflow: 'hidden',
                    }}>
                      <div
                        onClick={() => setExpandedSubs(prev => {
                          const next = new Set(prev);
                          if (next.has(sb.id)) next.delete(sb.id); else next.add(sb.id);
                          return next;
                        })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                          cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--border-primary)' : 'none',
                        }}
                      >
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 700, minWidth: 20 }}>#{idx + 1}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{sb.label || 'Без назви'}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span>👥 {sb.adults} дор.{sb.children > 0 ? `, ${sb.children} діт.` : ''}</span>
                            {sb.child_unit_name ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 6, background: 'rgba(99,102,241,0.12)', color: '#6366f1', fontSize: 11, fontWeight: 600 }}>
                                📅 {sb.child_unit_name} <span style={{ fontSize: 9, opacity: 0.7 }}>(в календарі)</span>
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>— той самий юніт</span>
                            )}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-primary)' }}>
                          {Number(sb.subtotal).toLocaleString()} CZK
                        </div>
                        {sb.child_payment_status && (
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 6, fontWeight: 600,
                            color: sb.child_payment_status === 'paid' ? '#22c55e' : '#f59e0b',
                            background: sb.child_payment_status === 'paid' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                          }}>
                            {sb.child_payment_status === 'paid' ? '✅' : '⏳'}
                          </span>
                        )}
                        {sb.child_guest_page_token && (
                          <button
                            onClick={(e) => { e.stopPropagation(); window.open(`/guest/${sb.child_guest_page_token}`, '_blank'); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: 4 }}
                            title="Гостьова сторінка цієї групи">
                            <ExternalLink size={14} />
                          </button>
                        )}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Видалити групу «${sb.label}»?`)) return;
                            await fetch(`/api/bookings/${b.id}/sub-bookings/${sb.id}`, { method: 'DELETE' });
                            fetchSubBookings();
                            if (onFetchBookings) onFetchBookings();
                            showToast('Групу видалено');
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}
                          title="Видалити групу">
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: '10px 14px' }}>
                          {sb.lineItems && sb.lineItems.length > 0 ? (
                            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-primary)', color: 'var(--text-tertiary)' }}>
                                  <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 500 }}>Опис</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500, width: 50 }}>К-ть</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500, width: 70 }}>Ціна</th>
                                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 500, width: 80 }}>Разом</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sb.lineItems.map((li: any) => (
                                  <tr key={li.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                                    <td style={{ padding: '6px 0' }}>{li.description}</td>
                                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{li.quantity}</td>
                                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{Number(li.unit_price).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600 }}>{Number(li.total).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>Немає деталізації</div>
                          )}

                          {editingLineItems === sb.id ? (
                            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'end' }}>
                              <input placeholder="Опис" value={newLineItem.description}
                                onChange={e => setNewLineItem(p => ({ ...p, description: e.target.value }))}
                                style={{ flex: 1, padding: '6px 8px', fontSize: 12, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, color: 'var(--text-primary)' }} />
                              <input type="number" placeholder="К-ть" value={newLineItem.quantity}
                                onChange={e => setNewLineItem(p => ({ ...p, quantity: Number(e.target.value) }))}
                                style={{ width: 50, padding: '6px 4px', fontSize: 12, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, color: 'var(--text-primary)', textAlign: 'right' }} />
                              <input type="number" placeholder="Ціна" value={newLineItem.unit_price}
                                onChange={e => setNewLineItem(p => ({ ...p, unit_price: Number(e.target.value) }))}
                                style={{ width: 70, padding: '6px 4px', fontSize: 12, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, color: 'var(--text-primary)', textAlign: 'right' }} />
                              <button
                                onClick={async () => {
                                  if (!newLineItem.description) return;
                                  const items = [...(sb.lineItems || []), { ...newLineItem, total: newLineItem.quantity * newLineItem.unit_price }];
                                  await fetch(`/api/bookings/${b.id}/sub-bookings/${sb.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ lineItems: items.map((li: any) => ({ description: li.description, quantity: li.quantity, unit_price: li.unit_price, total: li.total, category: li.category || 'other' })) }),
                                  });
                                  setNewLineItem({ description: '', quantity: 1, unit_price: 0 });
                                  fetchSubBookings();
                                }}
                                style={{ padding: '6px 10px', fontSize: 12, background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <Plus size={12} />
                              </button>
                              <button onClick={() => setEditingLineItems(null)}
                                style={{ padding: '6px 8px', fontSize: 12, background: 'none', border: '1px solid var(--border-primary)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setEditingLineItems(sb.id)}
                              style={{ marginTop: 8, padding: '4px 10px', fontSize: 11, background: 'none', border: '1px dashed var(--border-primary)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                              + Додати рядок
                            </button>
                          )}

                          {sb.notes && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, fontStyle: 'italic' }}>💬 {sb.notes}</div>}

                          {sb.child_guest_page_token && (
                            <div style={{
                              marginTop: 10, padding: '8px 10px', borderRadius: 8,
                              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
                              display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                              <ExternalLink size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Гостьова сторінка цієї групи</div>
                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  /guest/{sb.child_guest_page_token}
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  const url = `${window.location.origin}/guest/${sb.child_guest_page_token}`;
                                  navigator.clipboard.writeText(url);
                                  showToast('🔗 Посилання скопійовано');
                                }}
                                style={{ padding: '3px 8px', fontSize: 10, background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Copy size={10} /> Копіювати
                              </button>
                              <button
                                onClick={() => window.open(`/guest/${sb.child_guest_page_token}`, '_blank')}
                                style={{ padding: '3px 8px', fontSize: 10, background: 'none', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                Відкрити
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {subBookings.length > 0 && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', borderRadius: 10,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Σ Sub-bookings</div>
                      <div style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                        {subBookings.reduce((s: number, sb: any) => s + Number(sb.subtotal || 0), 0).toLocaleString()} CZK
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Total бронювання</div>
                      <div style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                        {Number(b.total_price || 0).toLocaleString()} CZK
                      </div>
                    </div>
                    {(() => {
                      const subSum = subBookings.reduce((s: number, sb: any) => s + Number(sb.subtotal || 0), 0);
                      const diff = Math.abs(subSum - Number(b.total_price || 0));
                      if (diff < 1) return <span style={{ fontSize: 18 }}>✅</span>;
                      return <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>⚠️ Δ {diff.toLocaleString()}</span>;
                    })()}
                  </div>
                )}

                {showGroupForm ? (
                  <div style={{
                    border: '1px solid var(--accent-primary)', borderRadius: 10,
                    padding: 14, background: 'var(--bg-secondary)',
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>➕ Нова група гостей</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>🏠 Юніт (кімната / місце) <span style={{ color: 'var(--accent-primary)' }}>*</span></label>
                        <select value={groupForm.unitId} onChange={e => setGroupForm(p => ({ ...p, unitId: e.target.value }))}
                          style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, color: 'var(--text-primary)' }}>
                          <option value="">— Той самий юніт що й master ({(b as any).unit_name}) —</option>
                          {availableUnits.filter(u => u.id !== (b as any).unit_id).map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.code}) — {u.category_name}</option>
                          ))}
                        </select>
                        {groupForm.unitId && (
                          <div style={{ fontSize: 11, color: '#22c55e', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            📅 Цей юніт буде заблоковано в календарі на {(b as any).check_in} — {(b as any).check_out}
                          </div>
                        )}
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Назва групи</label>
                        <input value={groupForm.label} onChange={e => setGroupForm(p => ({ ...p, label: e.target.value }))}
                          placeholder="Напр. Сім'я Петренко — Mirror 1" style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, color: 'var(--text-primary)' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Дорослі</label>
                        <input type="number" min={1} value={groupForm.adults} onChange={e => setGroupForm(p => ({ ...p, adults: Number(e.target.value) }))}
                          style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, color: 'var(--text-primary)' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Діти</label>
                        <input type="number" min={0} value={groupForm.children} onChange={e => setGroupForm(p => ({ ...p, children: Number(e.target.value) }))}
                          style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, color: 'var(--text-primary)' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>💰 Вартість цієї групи (CZK)</label>
                        <input type="number" min={0} value={groupForm.subtotal} onChange={e => setGroupForm(p => ({ ...p, subtotal: Number(e.target.value) }))}
                          style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, color: 'var(--text-primary)' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Примітка</label>
                        <input value={groupForm.notes} onChange={e => setGroupForm(p => ({ ...p, notes: e.target.value }))}
                          style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, color: 'var(--text-primary)' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setShowGroupForm(false); setGroupForm({ label: '', unitId: '', adults: 1, children: 0, subtotal: 0, notes: '' }); }}
                        style={{ padding: '6px 14px', fontSize: 12, background: 'none', border: '1px solid var(--border-primary)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        Скасувати
                      </button>
                      <button
                        disabled={savingGroup || !groupForm.label}
                        onClick={async () => {
                          setSavingGroup(true);
                          try {
                            const res = await fetch(`/api/bookings/${b.id}/sub-bookings`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ ...groupForm, unitId: groupForm.unitId || undefined }),
                            });
                            if (res.ok) {
                              showToast(groupForm.unitId ? '✅ Групу додано — юніт заблоковано в календарі' : '✅ Групу додано');
                              setShowGroupForm(false);
                              setGroupForm({ label: '', unitId: '', adults: 1, children: 0, subtotal: 0, notes: '' });
                              fetchSubBookings();
                              if (onFetchBookings) onFetchBookings();
                            } else {
                              const err = await res.json();
                              showToast(err.error || 'Помилка');
                            }
                          } finally { setSavingGroup(false); }
                        }}
                        style={{ padding: '6px 14px', fontSize: 12, background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {savingGroup ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Додати групу
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowGroupForm(true)}
                    style={{
                      padding: '10px 16px', fontSize: 13, fontWeight: 600,
                      background: 'none', border: '1px dashed var(--accent-primary)',
                      borderRadius: 10, cursor: 'pointer', color: 'var(--accent-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                    <Plus size={14} /> Додати групу
                  </button>
                )}
              </div>
            )}

            {viewTab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {activityLog.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>Немає записів</div>}
                {activityLog.map((log: any) => {
                  const icons: Record<string, string> = { status_change: '🔄', payment_status_change: '💳', price_change: '💰', note: '📝', created: '➕', payment_marker: '📌' };
                  return (
                    <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-primary)' }}>
                      <span style={{ fontSize: 16 }}>{icons[log.action] || '•'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13 }}>{log.details}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{log.created_at}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer (sticky) ── */}
        <div style={{
          display: 'flex', gap: 8, padding: '11px 18px',
          borderTop: '1px solid var(--border-primary)',
          flexShrink: 0, justifyContent: 'flex-end', flexWrap: 'wrap',
        }}>
          <button className="btn btn-secondary" onClick={onClose}>Закрити</button>
          {b.guest_page_token && (
            <>
              <button className="btn btn-secondary" title="Скопіювати посилання"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/guest/${b.guest_page_token}`).then(() => showToast('Скопійовано!'));
                }}>
                <Copy size={14} /> Копіювати
              </button>
              <button className="btn btn-secondary" style={{ color: 'var(--accent-primary)' }}
                onClick={() => window.open(`/guest/${b.guest_page_token}`, '_blank')}>
                <ExternalLink size={14} /> Гостьова
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={onEdit}>
            <Edit3 size={14} /> Редагувати
          </button>
        </div>
      </div>
    </div>
  );
}
