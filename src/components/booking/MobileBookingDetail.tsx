'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  X, MoreVertical, Phone, Mail, MessageCircle, Check, Clock, Lock,
  Plus, Copy, ExternalLink, Edit3, Loader2, Save, Receipt,
  CreditCard, FileText, Users, Trash2,
} from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface MobileBookingDetailProps {
  booking: any;
  payments: any[];
  registrations: any[];
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

const STATUS_LABELS: Record<string, string> = {
  draft: 'Чернетка',
  tentative: 'Очікується',
  confirmed: 'Підтверджено',
  checked_in: 'Заселено',
  checked_out: 'Виселено',
  cancelled: 'Скасовано',
};

const METHOD_LABELS: Record<string, string> = {
  cash: '💵 Готівка',
  card: '💳 Картою',
  bank_transfer: '🏦 На рахунок',
  invoice: '📄 Фактура',
  booking_platform: '🏨 Платформа',
};

const TYPE_LABELS: Record<string, string> = {
  deposit: 'Передплата',
  full: 'Повна',
  partial: 'Часткова',
  refund: 'Повернення',
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

function toEur(czk: number): string {
  return Math.round(czk / 25.5).toLocaleString();
}

function nightsLabel(n: number): string {
  if (n === 1) return 'ніч';
  if (n >= 2 && n <= 4) return 'ночі';
  return 'ночей';
}

function adultsLabel(n: number): string {
  if (n === 1) return 'дорослий';
  if (n >= 2 && n <= 4) return 'дорослих';
  return 'дорослих';
}

export default function MobileBookingDetail({
  booking: b,
  payments,
  registrations,
  sourceMap,
  onClose, onEdit, onChangeStatus,
  onFetchPayments, onFetchBookings, onFetchRegistrations,
  showToast, setBooking,
}: MobileBookingDetailProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useBodyScrollLock(Boolean(b));
  const [tab, setTab] = useState<'payment' | 'registration' | 'groups' | 'audit'>('payment');
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', type: 'partial', notes: '' });
  const [showRegForm, setShowRegForm] = useState(false);
  const [regForm, setRegForm] = useState({
    firstName: '', lastName: '', dateOfBirth: '', documentType: 'ID_CARD',
    documentNumber: '', nationality: '', country: '', address: '',
  });
  const [savingReg, setSavingReg] = useState(false);
  const [invoice, setInvoice] = useState<{ id: string; invoice_number: string; issued_at: string; amount: number; currency: string } | null>(null);
  const [subBookings, setSubBookings] = useState<any[]>([]);
  const [ocrScanning, setOcrScanning] = useState(false);
  const ocrFileRef = useRef<HTMLInputElement>(null);

  // Owner-only audit tab
  const [isOwner, setIsOwner] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(data => {
      if (data.user?.role === 'owner' || data.role === 'owner') setIsOwner(true);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (tab === 'audit' && b?.id) {
      fetch(`/api/audit/bookings?reservation_id=${b.id}`)
        .then(r => r.json())
        .then(data => setAuditLogs(data.items || []))
        .catch(() => {});
    }
  }, [tab, b?.id]);

  const checkIn = formatDate(b.check_in);
  const checkOut = formatDate(b.check_out);

  const total = b.total_price || 0;
  const paidFromOps = payments.filter(p => p.status === 'completed').reduce((s: number, p: any) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
  const isPaid = b.payment_status === 'paid' || b.payment_status === 'prepaid';
  const paid = isPaid && paidFromOps === 0 ? total : paidFromOps;
  const remaining = Math.max(0, total - paid);
  const pct = isPaid ? 100 : total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const isRegistered = b.registration_status === 'registered';
  const canCheckIn = isPaid && isRegistered;
  const regNeeded = b.adults || 1;
  const regBadge = `${registrations.length}/${regNeeded}`;

  const sourceInfo = sourceMap[b.source] || (b.source === 'widget' || b.source?.startsWith('widget:')
    ? { label: '🌐 Віджет', color: '#6366f1' }
    : { label: b.source || 'Direct', color: '#6B7392' });

  // Lock body scroll when sheet is open
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, []);

  useEffect(() => {
    if (!b?.id) return;
    fetch(`/api/bookings/${b.id}/invoice`)
      .then(r => r.json())
      .then(data => setInvoice(data))
      .catch(() => setInvoice(null));
  }, [b?.id, b?.payment_status]);

  useEffect(() => {
    if (!b?.id) return;
    fetch(`/api/bookings/${b.id}/sub-bookings`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSubBookings(data); })
      .catch(() => setSubBookings([]));
  }, [b?.id]);

  const guestPhoneClean = useMemo(() => (b.guest_phone || '').replace(/[^\d+]/g, ''), [b.guest_phone]);

  const handleAddPayment = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0) return;
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservation_id: b.id,
        amount: Number(payForm.amount),
        method: payForm.method,
        type: payForm.type,
        notes: payForm.notes || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPayForm({ amount: '', method: 'cash', type: 'partial', notes: '' });
    setShowPayForm(false);
    onFetchPayments(b.id);
    onFetchBookings();
    const msg = data?.kind === 'marker'
      ? '✅ Позначка збережена'
      : 'Платіж додано!';
    showToast(msg);
  };

  const handleDeletePayment = async (pId: string) => {
    if (!confirm('Видалити платіж?')) return;
    await fetch(`/api/payments/${pId}`, { method: 'DELETE' });
    onFetchPayments(b.id);
    onFetchBookings();
    showToast('Видалено');
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

  const handleSaveRegistration = async () => {
    if (!regForm.firstName || !regForm.lastName) {
      showToast('Імʼя та прізвище обовʼязкові');
      return;
    }
    setSavingReg(true);
    try {
      const res = await fetch(`/api/bookings/${b.id}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Помилка');
        return;
      }
      setRegForm({ firstName: '', lastName: '', dateOfBirth: '', documentType: 'ID_CARD', documentNumber: '', nationality: '', country: '', address: '' });
      setShowRegForm(false);
      onFetchRegistrations(b.id);
      onFetchBookings();
      showToast('Гостя зареєстровано');
    } catch { showToast('Помилка'); }
    finally { setSavingReg(false); }
  };

  const handleDeleteRegistration = async (regId: string) => {
    if (!confirm('Видалити реєстрацію?')) return;
    await fetch(`/api/bookings/${b.id}/registrations?reg_id=${regId}`, { method: 'DELETE' });
    onFetchRegistrations(b.id);
    onFetchBookings();
    showToast('Видалено');
  };

  const handleCopyGuestLink = async () => {
    let token = b.guest_page_token;
    if (!token) {
      // Auto-generate token
      try {
        const res = await fetch(`/api/bookings/${b.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generate_guest_token: true }),
        });
        const data = await res.json();
        token = data.guest_page_token;
        if (token) setBooking({ ...b, guest_page_token: token });
      } catch { /* ignore */ }
    }
    if (!token) { showToast('Не вдалося створити посилання'); return; }
    navigator.clipboard.writeText(`${window.location.origin}/guest/${token}`)
      .then(() => showToast('Посилання скопійовано'));
  };

  const handleOpenGuestPage = async () => {
    let token = b.guest_page_token;
    if (!token) {
      try {
        const res = await fetch(`/api/bookings/${b.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generate_guest_token: true }),
        });
        const data = await res.json();
        token = data.guest_page_token;
        if (token) setBooking({ ...b, guest_page_token: token });
      } catch { /* ignore */ }
    }
    if (!token) { showToast('Не вдалося створити посилання'); return; }
    window.open(`/guest/${token}`, '_blank');
  };

  // ── Render helpers
  const PipelineStep = ({
    stepNum,
    label,
    sub,
    status,
    onClick,
  }: {
    stepNum: number;
    label: string;
    sub?: string;
    status: 'ok' | 'wait' | 'fail' | 'default';
    onClick?: () => void;
  }) => {
    const isOk = status === 'ok';
    const isWait = status === 'wait';
    const isFail = status === 'fail';

    let bg = 'var(--bg-tertiary)';
    let border = 'var(--border-primary)';
    let color = 'var(--text-tertiary)';
    let badgeBg = 'var(--bg-secondary)';

    if (isOk) {
      bg = 'rgba(34, 197, 94, 0.16)';
      border = '#22c55e';
      color = '#22c55e';
      badgeBg = '#22c55e';
    } else if (isWait) {
      bg = 'rgba(245, 158, 11, 0.16)';
      border = '#f59e0b';
      color = '#f59e0b';
      badgeBg = '#f59e0b';
    } else if (isFail) {
      bg = 'rgba(239, 68, 68, 0.16)';
      border = '#ef4444';
      color = '#ef4444';
      badgeBg = '#ef4444';
    }

    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          padding: '8px 4px',
          borderRadius: 10,
          background: bg,
          border: `1px solid ${border}`,
          color: color,
          cursor: onClick ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: badgeBg,
          color: isOk || isWait || isFail ? '#fff' : 'var(--text-tertiary)',
          fontSize: 10,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {isOk ? <Check size={11} strokeWidth={3} /> : stepNum}
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 9.5, opacity: 0.9, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
            {sub}
          </div>
        )}
      </button>
    );
  };

  if (!mounted) return null;

  const content = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      <div
        className="m-sheet-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          touchAction: 'none',
        }}
      />
      <div
        className="m-sheet mbd-sheet"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(100dvh - 12px)',
          maxHeight: 'calc(100dvh - 12px)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1001,
          borderRadius: '20px 20px 0 0',
          overflow: 'hidden',
          background: 'var(--bg-card)',
        }}
      >
        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', minHeight: 0 }}>

          {/* Multi-room warning */}
          {Boolean(b.is_multi_room) && (
            <div style={{
              margin: '10px 14px', padding: '8px 12px', borderRadius: 8,
              background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.3)', fontSize: 11, lineHeight: 1.4,
            }}>
              <strong>⚠️ Multi-room</strong> — Hostex колапсує групове бронювання Booking.com в один запис. Перевір у Hostex (маркер {b.multi_room_marker || '?'}).
            </div>
          )}

          {/* Guest section */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-primary)' }}>
            {/* Handle bar */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4, paddingBottom: 8 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-primary)' }} />
            </div>
            {/* Name row with close button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={onClose} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }} aria-label="Закрити">
                <X size={16} />
              </button>
              <div style={{ flex: 1, fontSize: 19, fontWeight: 700, letterSpacing: '-0.3px' }}>
                {b.first_name} {b.last_name}
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--accent-primary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {total.toLocaleString()} {b.currency || 'CZK'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 4 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span style={{ padding: '2px 7px', background: 'var(--bg-tertiary)', borderRadius: 4, fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace' }}>
                  {b.unit_code || b.unit_name}
                </span>
                <span style={{ padding: '2px 7px', background: `${sourceInfo.color}26`, borderRadius: 4, fontSize: 10.5, fontWeight: 600, color: sourceInfo.color, fontFamily: 'ui-monospace, monospace' }}>
                  {sourceInfo.label}
                </span>
                <span style={{ width: 3, height: 3, background: 'var(--text-tertiary)', borderRadius: '50%' }} />
                <span>{b.nights} {nightsLabel(b.nights)}</span>
                <span style={{ width: 3, height: 3, background: 'var(--text-tertiary)', borderRadius: '50%' }} />
                <span>{b.adults} {adultsLabel(b.adults)}{b.children > 0 ? ` + ${b.children} діт.` : ''}</span>
              </div>
              {b.currency !== 'EUR' && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                  ≈ {toEur(total)} €
                </div>
              )}
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              {[
                { lbl: 'Заїзд', val: checkIn },
                { lbl: 'Виїзд', val: checkOut },
              ].map(d => (
                <div key={d.lbl} style={{
                  display: 'flex', flexDirection: 'column', gap: 2,
                  padding: '7px 10px', background: 'var(--bg-tertiary)',
                  borderRadius: 8, border: '1px solid var(--border-primary)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 600 }}>{d.lbl}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {d.val.date}
                    {d.val.day && <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginLeft: 4, fontWeight: 400 }}>{d.val.day}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Contacts */}
            {(b.guest_phone || b.guest_email) && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {b.guest_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Phone size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {b.guest_phone}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <a href={`tel:${guestPhoneClean}`} style={contactBtnStyle('#4ADE80')} aria-label="Подзвонити">
                        <Phone size={14} />
                      </a>
                      <a href={`https://wa.me/${guestPhoneClean.replace(/^\+/, '')}`} target="_blank" rel="noopener" style={contactBtnStyle('#4ADE80')} aria-label="WhatsApp">
                        <MessageCircle size={14} />
                      </a>
                    </div>
                  </div>
                )}
                {b.guest_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mail size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.guest_email}
                    </span>
                    <a href={`mailto:${b.guest_email}`} style={contactBtnStyle('#5B7CFF')} aria-label="Email">
                      <Mail size={14} />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Interactive Pipeline Stepper */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
            padding: '10px 12px', borderBottom: '1px solid var(--border-primary)',
            background: 'var(--bg-secondary)',
          }}>
            <PipelineStep
              stepNum={1}
              label="Бронь"
              status={['confirmed','checked_in','checked_out'].includes(b.status) ? 'ok' : 'default'}
              onClick={onEdit}
            />
            <PipelineStep
              stepNum={2}
              label="Оплата"
              sub={isPaid ? '100%' : `${pct}%`}
              status={isPaid ? 'ok' : (b.payment_status === 'payment_requested' ? 'wait' : 'fail')}
              onClick={() => setTab('payment')}
            />
            <PipelineStep
              stepNum={3}
              label="Реєстрація"
              sub={regBadge}
              status={isRegistered ? 'ok' : 'fail'}
              onClick={() => setTab('registration')}
            />
            <PipelineStep
              stepNum={4}
              label="Заселено"
              status={['checked_in','checked_out'].includes(b.status) ? 'ok' : 'default'}
              onClick={() => {
                if (b.status === 'confirmed') onChangeStatus(b.id, 'checked_in');
                else setTab('payment');
              }}
            />
          </div>


          {/* Tabs */}
          <div style={{ display: 'flex', padding: '0 14px', borderBottom: '1px solid var(--border-primary)' }}>
            {([
              { k: 'payment' as const, l: 'Оплата', Icon: CreditCard, badge: !isPaid && total > 0 ? `${pct}%` : undefined },
              { k: 'registration' as const, l: 'Реєстрація', Icon: FileText, badge: !isRegistered ? regBadge : undefined },
              { k: 'groups' as const, l: 'Групи', Icon: Users, badge: subBookings.length > 0 ? String(subBookings.length) : undefined },
              ...(isOwner ? [{ k: 'audit' as const, l: '🕐 Історія', Icon: Clock, badge: undefined as string | undefined }] : []),
            ]).map(t => (
              <button key={t.k} onClick={() => setTab(t.k)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '10px 4px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: tab === t.k ? 600 : 500,
                  color: tab === t.k ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  borderBottom: tab === t.k ? '2px solid var(--accent-primary)' : '2px solid transparent',
                }}>
                <t.Icon size={14} strokeWidth={1.8} />
                {t.l}
                {t.badge && (
                  <span style={{ fontSize: 10, padding: '1px 5px', background: 'rgba(242,107,107,0.15)', color: '#F26B6B', borderRadius: 3, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'payment' && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                <div>
                  <div style={amountLblStyle}>Всього</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{total.toLocaleString()}</div>
                </div>
                <div>
                  <div style={amountLblStyle}>Оплачено</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#4ADE80', fontVariantNumeric: 'tabular-nums' }}>{paid.toLocaleString()}</div>
                </div>
                <div>
                  <div style={amountLblStyle}>Залишок</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: remaining > 0 ? '#F5B847' : '#4ADE80', fontVariantNumeric: 'tabular-nums' }}>{remaining.toLocaleString()}</div>
                </div>
              </div>

              <div style={{ height: 5, background: 'var(--bg-tertiary)', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#4ADE80' : '#5B7CFF', borderRadius: 3, transition: 'width 0.4s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'ui-monospace, monospace' }}>
                <span>{pct}% оплачено</span>
                <span>в {b.currency || 'CZK'}</span>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
                <button onClick={() => setShowPayForm(true)} style={payBtnStyle('primary')}>
                  <Plus size={13} strokeWidth={2.3} /> Платіж
                </button>
                <button onClick={handleTogglePaymentRequest} style={payBtnStyle(b.payment_status === 'payment_requested' ? 'active' : 'default')}>
                  <Mail size={13} /> Запит
                </button>
                {invoice ? (
                  <button onClick={() => window.open(`/api/invoices/${invoice.id}`, '_blank')} style={payBtnStyle('default')}>
                    <Receipt size={13} /> Інвойс
                  </button>
                ) : (
                  <button disabled style={payBtnStyle('disabled')}>
                    <Receipt size={13} /> Інвойс
                  </button>
                )}
              </div>

              {/* Add payment form */}
              {showPayForm && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="form-input" type="number" placeholder={`Сума ${b.currency || 'CZK'}`} value={payForm.amount}
                      onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                      style={{ fontSize: 13 }} />
                    <select className="form-select" value={payForm.method}
                      onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}
                      style={{ fontSize: 13 }}>
                      <option value="cash">💵 Готівка</option>
                      <option value="card">💳 Картою</option>
                      <option value="bank_transfer">🏦 Рахунок</option>
                      <option value="invoice">📄 Фактура</option>
                      <option value="booking_platform">🏨 Платформа</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                    <select className="form-select" value={payForm.type}
                      onChange={e => setPayForm(p => ({ ...p, type: e.target.value }))}
                      style={{ fontSize: 13 }}>
                      <option value="deposit">Передплата</option>
                      <option value="partial">Часткова</option>
                      <option value="full">Повна</option>
                      <option value="refund">Повернення</option>
                    </select>
                    <input className="form-input" placeholder="Примітка" value={payForm.notes}
                      onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))}
                      style={{ fontSize: 13 }} />
                  </div>
                  {remaining > 0 && (
                    <button onClick={() => setPayForm(p => ({ ...p, amount: String(remaining), type: remaining === total ? 'full' : 'partial' }))}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: 11, fontWeight: 600, padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                      Залишок: {remaining.toLocaleString()} {b.currency || 'CZK'}
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowPayForm(false)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Скасувати
                    </button>
                    <button onClick={handleAddPayment} disabled={!payForm.amount || Number(payForm.amount) <= 0}
                      style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--accent-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: (!payForm.amount || Number(payForm.amount) <= 0) ? 0.5 : 1 }}>
                      <Save size={12} /> Зберегти
                    </button>
                  </div>
                </div>
              )}

              {/* Payments list */}
              {payments.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: 6 }}>Транзакції</div>
                  {payments.map((p: any) => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 10px', background: 'var(--bg-secondary)',
                      borderRadius: 8, marginBottom: 4, fontSize: 12,
                    }}>
                      <span style={{ fontWeight: 700, color: p.type === 'refund' ? '#F26B6B' : '#4ADE80', fontVariantNumeric: 'tabular-nums' }}>
                        {p.type === 'refund' ? '-' : '+'}{p.amount.toLocaleString()}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{METHOD_LABELS[p.method] || p.method}</span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{TYPE_LABELS[p.type] || p.type}</span>
                      <button onClick={() => handleDeletePayment(p.id)}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'registration' && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{
                padding: '10px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
                background: isRegistered ? 'rgba(74,222,128,0.1)' : 'rgba(242,107,107,0.1)',
                border: `1px solid ${isRegistered ? 'rgba(74,222,128,0.3)' : 'rgba(242,107,107,0.3)'}`,
              }}>
                <span style={{ fontSize: 18 }}>{isRegistered ? '✅' : '❌'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isRegistered ? '#4ADE80' : '#F26B6B' }}>
                    {isRegistered ? 'Реєстрація завершена' : `Зареєструйте ${regNeeded - registrations.length} гостей`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{registrations.length} з {regNeeded}</div>
                </div>
              </div>

              {registrations.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {registrations.map((r: any) => (
                    <div key={r.reg_id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', background: 'var(--bg-secondary)',
                      borderRadius: 8, marginBottom: 6,
                    }}>
                      <span style={{ fontSize: 20 }}>👤</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.first_name} {r.last_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {r.document_number || '—'} · {r.nationality || '—'}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteRegistration(r.reg_id)}
                        style={{ background: 'none', border: 'none', color: '#F26B6B', cursor: 'pointer', padding: 6 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!showRegForm && registrations.length < regNeeded && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setShowRegForm(true)}
                    style={{
                      flex: 1, padding: 12, borderRadius: 10,
                      background: 'rgba(91,124,255,0.12)', color: '#5B7CFF',
                      border: '1px solid rgba(91,124,255,0.3)', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                    <Plus size={14} strokeWidth={2.3} /> Додати гостя
                  </button>
                  <input type="file" accept="image/*" ref={ocrFileRef} style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setOcrScanning(true);
                      try {
                        const reader = new FileReader();
                        const dataUrl = await new Promise<string>((resolve) => {
                          reader.onload = () => resolve(reader.result as string);
                          reader.readAsDataURL(file);
                        });
                        const res = await fetch('/api/bookings/ocr', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ image: dataUrl }),
                        });
                        const data = await res.json();
                        if (data.success !== false && data.data) {
                          const ocr = data.data;
                          const docTypeMap: Record<string, string> = { id_card: 'ID_CARD', passport: 'PASSPORT', driving_license: 'DRIVING_LICENCE', other: 'OTHER' };
                          setRegForm(p => ({
                            ...p,
                            firstName: ocr.firstName || p.firstName,
                            lastName: ocr.lastName || p.lastName,
                            dateOfBirth: ocr.dateOfBirth || p.dateOfBirth,
                            documentNumber: ocr.documentNumber || p.documentNumber,
                            documentType: docTypeMap[ocr.documentType] || p.documentType,
                            nationality: ocr.nationality || p.nationality,
                            address: ocr.address || p.address,
                          }));
                          setShowRegForm(true);
                          showToast(`\u2705 ${ocr.firstName} ${ocr.lastName} (${ocr.confidence || '?'}%)`);
                        } else {
                          showToast(`\u274c ${data.error || 'Не вдалось розпізнати'}`);
                        }
                      } catch (err: any) {
                        showToast(`\u274c ${err.message || 'Помилка'}`);
                      } finally {
                        setOcrScanning(false);
                        if (ocrFileRef.current) ocrFileRef.current.value = '';
                      }
                    }} />
                  <button onClick={() => ocrFileRef.current?.click()} disabled={ocrScanning}
                    style={{
                      padding: '12px 16px', borderRadius: 10,
                      background: 'rgba(99,102,241,0.12)', color: '#6366f1',
                      border: '1px solid rgba(99,102,241,0.25)', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      whiteSpace: 'nowrap',
                    }}>
                    {ocrScanning ? <Loader2 size={14} className="animate-spin" /> : '\ud83d\udcf7'}
                    {ocrScanning ? '...' : 'Фото'}
                  </button>
                </div>
              )}

              {showRegForm && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="form-input" placeholder="Імʼя *" value={regForm.firstName}
                      onChange={e => setRegForm(p => ({ ...p, firstName: e.target.value }))} style={{ fontSize: 13 }} />
                    <input className="form-input" placeholder="Прізвище *" value={regForm.lastName}
                      onChange={e => setRegForm(p => ({ ...p, lastName: e.target.value }))} style={{ fontSize: 13 }} />
                  </div>
                  <input className="form-input" type="date" placeholder="Дата народження" value={regForm.dateOfBirth}
                    onChange={e => setRegForm(p => ({ ...p, dateOfBirth: e.target.value }))} style={{ fontSize: 13 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                    <select className="form-select" value={regForm.documentType}
                      onChange={e => setRegForm(p => ({ ...p, documentType: e.target.value }))} style={{ fontSize: 13 }}>
                      <option value="ID_CARD">ID Card</option>
                      <option value="PASSPORT">Passport</option>
                    </select>
                    <input className="form-input" placeholder="Номер документа" value={regForm.documentNumber}
                      onChange={e => setRegForm(p => ({ ...p, documentNumber: e.target.value }))} style={{ fontSize: 13 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="form-input" placeholder="Громадянство" value={regForm.nationality}
                      onChange={e => setRegForm(p => ({ ...p, nationality: e.target.value }))} style={{ fontSize: 13 }} />
                    <input className="form-input" placeholder="Країна" value={regForm.country}
                      onChange={e => setRegForm(p => ({ ...p, country: e.target.value }))} style={{ fontSize: 13 }} />
                  </div>
                  <input className="form-input" placeholder="Адреса" value={regForm.address}
                    onChange={e => setRegForm(p => ({ ...p, address: e.target.value }))} style={{ fontSize: 13 }} />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowRegForm(false)}
                      style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Скасувати
                    </button>
                    <button onClick={handleSaveRegistration} disabled={savingReg}
                      style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--accent-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {savingReg ? <Loader2 size={12} className="animate-pulse" /> : <Save size={12} />} Зберегти
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'groups' && (
            <div style={{ padding: '12px 14px' }}>
              {subBookings.length === 0 ? (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  Немає підбронювань
                  <div style={{ fontSize: 11, marginTop: 6 }}>
                    Створення груп доступне у desktop-версії
                  </div>
                </div>
              ) : (
                subBookings.map(sb => (
                  <div key={sb.id} style={{
                    padding: '10px 12px', background: 'var(--bg-secondary)',
                    borderRadius: 8, marginBottom: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{sb.label || 'Без назви'}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {(sb.subtotal || 0).toLocaleString()} {b.currency || 'CZK'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {sb.child_unit_code || sb.child_unit_name || sb.unit_id} · {sb.adults || 0} дор.{sb.children > 0 ? ` + ${sb.children} діт.` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'audit' && (
            <div style={{ padding: '12px 14px' }}>
              {auditLogs.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  Немає записів
                </div>
              ) : (
                auditLogs.map((log: any) => {
                  const date = new Date(log.created_at + 'Z');
                  const timeStr = date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
                  const actionColors: Record<string, string> = {
                    created: '#4ADE80',
                    deleted: '#F26B6B',
                    status_change: '#5B7CFF',
                    payment_status_change: '#F5B847',
                    price_change: '#F5B847',
                    unit_change: '#A78BFA',
                    dates_change: '#A78BFA',
                    registration_change: '#5B7CFF',
                    notes_change: 'var(--text-tertiary)',
                    internal_notes_change: 'var(--text-tertiary)',
                  };
                  const actionIcons: Record<string, string> = {
                    created: '✨', deleted: '🗑️', status_change: '🔄', payment_status_change: '💰',
                    price_change: '💲', unit_change: '🏠', dates_change: '📅',
                    registration_change: '📋', notes_change: '📝', internal_notes_change: '📝',
                  };
                  return (
                    <div key={log.id} style={{
                      padding: '10px 14px', borderBottom: '1px solid var(--border-primary)',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                    }}>
                      <div style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>
                        {actionIcons[log.action] || '📌'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: actionColors[log.action] || 'var(--text-primary)' }}>
                            {log.details}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace' }}>
                            {timeStr}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {log.user_name || 'Система'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Bottom actions — above the app nav bar */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5,
          padding: '8px 14px', borderTop: '1px solid var(--border-primary)',
          flexShrink: 0, background: 'var(--bg-card)',
        }}>
          <button onClick={handleCopyGuestLink} style={bottomActionStyle('default')}>
            <Copy size={12} /> Копія
          </button>
          <button onClick={handleOpenGuestPage} style={bottomActionStyle('default')}>
            <ExternalLink size={12} /> Гостьова
          </button>
          <button onClick={onEdit} style={bottomActionStyle('edit')}>
            <Edit3 size={12} /> Змінити
          </button>
          <button onClick={() => { if (confirm('Скасувати бронювання?')) onChangeStatus(b.id, 'cancelled'); }} style={bottomActionStyle('danger')}>
            <X size={12} /> Скасувати
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// ── Helpers ───────────────────────────────────────────────

function contactBtnStyle(color: string): React.CSSProperties {
  return {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 7, border: `1px solid ${color}40`, background: `${color}1A`,
    color, textDecoration: 'none', flexShrink: 0,
  };
}

function primaryActionStyle(variant: 'primary' | 'danger' | 'confirmed' | 'disabled', extra?: React.CSSProperties): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    padding: '10px 6px', borderRadius: 9, fontSize: 13, fontWeight: 600,
    border: '1px solid transparent', cursor: 'pointer',
  };
  switch (variant) {
    case 'primary':
      return { ...base, background: 'var(--accent-primary)', color: '#fff', ...extra };
    case 'danger':
      return { ...base, background: 'var(--bg-secondary)', color: '#F26B6B', borderColor: 'rgba(242,107,107,0.3)', ...extra };
    case 'confirmed':
      return { ...base, background: 'rgba(74,222,128,0.12)', color: '#4ADE80', borderColor: 'rgba(74,222,128,0.3)', ...extra };
    case 'disabled':
      return { ...base, background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', cursor: 'not-allowed', opacity: 0.6, ...extra };
  }
}

function payBtnStyle(variant: 'primary' | 'active' | 'default' | 'disabled'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    padding: '9px 4px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
    border: '1px solid var(--border-primary)',
  };
  switch (variant) {
    case 'primary':
      return { ...base, background: 'rgba(91,124,255,0.12)', color: '#5B7CFF', borderColor: 'rgba(91,124,255,0.3)' };
    case 'active':
      return { ...base, background: 'var(--accent-primary)', color: '#fff', borderColor: 'transparent' };
    case 'default':
      return { ...base, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' };
    case 'disabled':
      return { ...base, background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', cursor: 'not-allowed', opacity: 0.5 };
  }
}

function bottomActionStyle(variant: 'default' | 'edit' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '9px 4px', borderRadius: 7, fontSize: 12, fontWeight: 500,
    textAlign: 'center', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  };
  if (variant === 'edit') {
    return { ...base, background: 'rgba(91,124,255,0.1)', color: '#5B7CFF', border: '1px solid rgba(91,124,255,0.28)' };
  }
  if (variant === 'danger') {
    return { ...base, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' };
  }
  return { ...base, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' };
}

const amountLblStyle: React.CSSProperties = {
  fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase',
  letterSpacing: '0.4px', fontWeight: 600, marginBottom: 3,
};
