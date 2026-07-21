'use client';

import React, { useState, useEffect } from 'react';
import {
  Edit3, X, Save, Plus, Check, ArrowRight, Copy, ExternalLink,
  Loader2, Trash2, Phone, Receipt, RefreshCw, Clock, Lock, Mail, MessageCircle,
} from 'lucide-react';

function Modal({ open, onClose, title, children, footer, size, hideTitle }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; size?: 'lg'; hideTitle?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} onClick={(e) => e.stopPropagation()}>
        {!hideTitle && (
          <div className="modal-header">
            <h3 className="modal-title">{title}</h3>
            <button className="modal-close" onClick={onClose}><X size={18} /></button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Чернетка', badge: 'badge-info' },
  tentative: { label: 'Очікується', badge: 'badge-warning' },
  confirmed: { label: 'Підтверджено', badge: 'badge-success' },
  checked_in: { label: 'Заселено', badge: 'badge-primary' },
  checked_out: { label: 'Виселено', badge: 'badge-info' },
  cancelled: { label: 'Скасовано', badge: 'badge-danger' },
};

const METHOD_LABELS: Record<string, string> = {
  cash: '💵 Готівка', card: '💳 Картою', bank_transfer: '🏦 На рахунок', invoice: '📄 Фактура',
  booking_platform: '🏨 Платформа бронювання',
};

const TYPE_LABELS: Record<string, string> = {
  deposit: 'Передплата', full: 'Повна', partial: 'Часткова', refund: 'Повернення',
};

function toEur(czk: number) { return Math.round(czk / 25.5).toLocaleString(); }

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
  const [viewTab, setViewTab] = useState<'payment' | 'registration' | 'groups' | 'tax' | 'notes' | 'history' | 'audit'>('payment');
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', type: 'partial', notes: '' });
  const [regForm, setRegForm] = useState({ firstName: '', lastName: '', dateOfBirth: '', documentType: 'ID_CARD', documentNumber: '', nationality: '', country: '', address: '' });
  const [savingReg, setSavingReg] = useState(false);
  const [invoice, setInvoice] = useState<{ id: string; invoice_number: string; issued_at: string; amount: number; currency: string } | null>(null);
  const [payLink, setPayLink] = useState<string | null>(null);
  const [payLinkBusy, setPayLinkBusy] = useState(false);
  async function createPayLink() {
    setPayLinkBusy(true);
    try {
      const res = await fetch(`/api/bookings/${b.id}/payment-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || 'Не вдалося створити лінк'); }
      else {
        setPayLink(j.url);
        try { await navigator.clipboard.writeText(j.url); showToast('Лінк скопійовано'); } catch { showToast('Лінк створено'); }
      }
    } catch (e: any) { alert(e.message); }
    setPayLinkBusy(false);
  }
  const [reissuing, setReissuing] = useState(false);
  const [waPopupOpen, setWaPopupOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [unitPopupOpen, setUnitPopupOpen] = useState(false);
  const [datesEditOpen, setDatesEditOpen] = useState(false);
  const [datesEditCI, setDatesEditCI] = useState('');
  const [datesEditCO, setDatesEditCO] = useState('');
  const [savingInline, setSavingInline] = useState(false);
  const [ocrScanning, setOcrScanning] = useState(false);
  const ocrFileRef = React.useRef<HTMLInputElement>(null);

  // Owner-only audit tab
  const [isOwner, setIsOwner] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(data => {
      if (data.user?.role === 'owner' || data.role === 'owner') setIsOwner(true);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (viewTab === 'audit' && b?.id) {
      fetch(`/api/audit/bookings?reservation_id=${b.id}`)
        .then(r => r.json())
        .then(data => setAuditLogs(data.items || []))
        .catch(() => {});
    }
  }, [viewTab, b?.id]);

  // Sub-bookings state
  const [subBookings, setSubBookings] = useState<any[]>([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupForm, setGroupForm] = useState({ label: '', unitId: '', adults: 1, children: 0, subtotal: 0, notes: '' });
  const [savingGroup, setSavingGroup] = useState(false);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [editingLineItems, setEditingLineItems] = useState<string | null>(null);
  const [newLineItem, setNewLineItem] = useState({ description: '', quantity: 1, unit_price: 0 });
  const [availableUnits, setAvailableUnits] = useState<{ id: string; name: string; code: string; category_name: string }[]>([]);

  // Invoice-to-company override (rendered as Odberatel block in faktura HTML).
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

  // Load current invoice whenever modal opens or booking changes
  useEffect(() => {
    if (!b?.id) return;
    fetch(`/api/bookings/${b.id}/invoice`)
      .then(r => r.json())
      .then(data => setInvoice(data))
      .catch(() => setInvoice(null));
  }, [b?.id, b?.payment_status]);

  // Load sub-bookings
  const fetchSubBookings = async () => {
    if (!b?.id) return;
    try {
      const res = await fetch(`/api/bookings/${b.id}/sub-bookings`);
      const data = await res.json();
      if (Array.isArray(data)) setSubBookings(data);
    } catch { setSubBookings([]); }
  };
  useEffect(() => { fetchSubBookings(); }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load available units for unit selector
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

  const total = b.total_price || 0;
  const paidFromOps = payments.filter(p => p.status === 'completed').reduce((s: number, p: any) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
  const isPaid = b.payment_status === 'paid' || b.payment_status === 'prepaid';
  // If DB says paid but no fin_operations exist (prepaid OTA, Teya widget), show full bar
  const paid = isPaid && paidFromOps === 0 ? total : paidFromOps;
  const remaining = Math.max(0, total - paid);
  const pct = isPaid ? 100 : total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const barColor = pct >= 100 ? '#22c55e' : pct > 0 ? '#3b82f6' : '#ef4444';
  const isRegistered = b.registration_status === 'registered';
  const canCheckIn = isPaid && isRegistered;
  const regNeeded = b.adults || 1;

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

  return (
    <Modal open={true} onClose={onClose} title="Бронювання" size="lg" hideTitle={true}
      footer={<>
        <button className="btn btn-secondary" style={{ color: '#ef4444' }}
          onClick={() => { if (confirm('Точно скасувати бронь? Гість буде повідомлений.')) onChangeStatus(b.id, 'cancelled'); }}>
          <X size={13} /> Скасувати бронь
        </button>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button className="btn btn-secondary" onClick={onClose}>Закрити</button>
          {b.guest_page_token && (
            <>
              <button className="btn btn-secondary" title="Скопіювати" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/guest/${b.guest_page_token}`).then(() => showToast('Скопійовано!'));
              }}><Copy size={14} /> Копіювати</button>
              <button className="btn btn-secondary" style={{ color: 'var(--accent-primary)' }}
                onClick={() => window.open(`/guest/${b.guest_page_token}`, '_blank')}>
                <ExternalLink size={14} /> Гостьова
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={onEdit}><Edit3 size={14} /> Редагувати</button>
        </div>
      </>}>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {(b as any).is_multi_room ? (
          <div style={{
            padding: '10px 12px', marginBottom: 8, borderRadius: 8,
            background: '#f59e0b22', color: '#92400e', border: '1px solid #f59e0b',
            fontSize: 12, lineHeight: 1.4,
          }}>
            <strong>⚠️ Multi-room booking</strong> — Hostex колапсує групове бронювання Booking.com в один запис.
            Сума {total.toLocaleString()} {b.currency || 'CZK'} може покривати <strong>кілька будинків</strong>.
            Перевір у Hostex (марker <code>{(b as any).multi_room_marker || '?'}</code>) скільки фактично кімнат
            і за потреби створи окремі рядки — інакше календар не заблокує інші будинки.
          </div>
        ) : null}
        {/* ── Compact Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-primary)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{b.first_name} {b.last_name}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
              {/* Unit badge — inline edit */}
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <span onClick={(e) => { e.stopPropagation(); setUnitPopupOpen(!unitPopupOpen); }}
                  style={{ padding: '2px 7px', background: 'var(--bg-tertiary)', borderRadius: 4, fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace', cursor: 'pointer', transition: 'background .15s', position: 'relative' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                  title="Натисни щоб змінити будинок">{b.unit_code || b.unit_name}</span>
                {unitPopupOpen && (
                  <>
                    <div onClick={() => setUnitPopupOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 29 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 6, width: 280, maxHeight: 300, overflowY: 'auto', boxShadow: '0 12px 32px -8px rgba(0,0,0,.5)', zIndex: 30 }}>
                      <div style={{ padding: '6px 10px 4px', fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>Змінити будинок</div>
                      {availableUnits.map(u => {
                        const isCurrent = u.id === (b as any).unit_id;
                        return (
                          <div key={u.id} onClick={async () => {
                            if (isCurrent || savingInline) return;
                            setSavingInline(true);
                            try {
                              const res = await fetch(`/api/bookings/${b.id}`, {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ unit_id: u.id }),
                              });
                              if (res.ok) {
                                setBooking({ ...b, unit_id: u.id, unit_code: u.code, unit_name: u.name });
                                onFetchBookings();
                                showToast(`\u2705 Будинок змінено на ${u.code}`);
                              } else { showToast('Помилка зміни будинку'); }
                            } finally { setSavingInline(false); setUnitPopupOpen(false); }
                          }}
                          style={{ padding: '8px 10px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 10, cursor: isCurrent ? 'default' : 'pointer', transition: 'background .15s', opacity: savingInline ? 0.5 : 1 }}
                          onMouseEnter={(e) => !isCurrent && (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isCurrent ? 'var(--accent-primary)' : 'var(--text-primary)', fontFamily: 'ui-monospace, monospace', minWidth: 32 }}>{u.code}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{u.category_name}</div>
                            </div>
                            {isCurrent && <span style={{ fontSize: 9, color: 'var(--accent-primary)', fontWeight: 600, padding: '2px 6px', background: 'rgba(79,142,255,.12)', borderRadius: 4 }}>Поточний</span>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <span style={{ padding: '2px 7px', background: ((sourceMap[b.source]?.color || (b.source === 'widget' || b.source?.startsWith('widget:') ? '#6366f1' : '#6c7086')) + '26'), borderRadius: 4, fontSize: 10.5, fontWeight: 600, color: sourceMap[b.source]?.color || (b.source === 'widget' || b.source?.startsWith('widget:') ? '#6366f1' : '#6c7086'), fontFamily: 'ui-monospace, monospace' }}>{sourceMap[b.source]?.label || (b.source === 'widget' || b.source?.startsWith('widget:') ? '🌐 Віджет' : b.source)}</span>
              <span style={{ width: 3, height: 3, background: 'var(--text-tertiary)', borderRadius: '50%' }} />
              {/* Dates — inline edit */}
              {!datesEditOpen ? (
                <span onClick={() => { setDatesEditCI(b.check_in); setDatesEditCO(b.check_out); setDatesEditOpen(true); }}
                  style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px 5px', margin: '-2px -5px', borderRadius: 5, transition: 'background .15s', position: 'relative' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  title="Натисни щоб змінити дати">{b.check_in} → {b.check_out}</span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <input type="date" value={datesEditCI} onChange={(e) => setDatesEditCI(e.target.value)}
                    style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border-primary)', borderRadius: 5, background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: 120 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>→</span>
                  <input type="date" value={datesEditCO} onChange={(e) => setDatesEditCO(e.target.value)}
                    min={datesEditCI}
                    style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border-primary)', borderRadius: 5, background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: 120 }} />
                  <button disabled={savingInline || !datesEditCI || !datesEditCO || datesEditCI >= datesEditCO}
                    onClick={async () => {
                      if (datesEditCI === b.check_in && datesEditCO === b.check_out) { setDatesEditOpen(false); return; }
                      const newNights = Math.ceil((new Date(datesEditCO + 'T00:00:00').getTime() - new Date(datesEditCI + 'T00:00:00').getTime()) / 86400000);
                      const oldNights = b.nights || 1;
                      const pricePerNight = total / oldNights;
                      const newTotal = Math.round(pricePerNight * newNights);
                      const msg = newTotal !== total
                        ? `Змінити дати?\n${b.check_in} → ${datesEditCI}\n${b.check_out} → ${datesEditCO}\n${oldNights} → ${newNights} ночей\n\nЦіна: ${total.toLocaleString()} → ${newTotal.toLocaleString()} ${b.currency || 'CZK'}`
                        : `Змінити дати?\n${b.check_in} → ${datesEditCI}\n${b.check_out} → ${datesEditCO}`;
                      if (!confirm(msg)) return;
                      setSavingInline(true);
                      try {
                        const payload: any = { check_in: datesEditCI, check_out: datesEditCO, nights: newNights };
                        if (newTotal !== total) payload.total_price = newTotal;
                        const res = await fetch(`/api/bookings/${b.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload),
                        });
                        if (res.ok) {
                          setBooking({ ...b, check_in: datesEditCI, check_out: datesEditCO, nights: newNights, ...(newTotal !== total ? { total_price: newTotal } : {}) });
                          onFetchBookings();
                          showToast(`\u2705 Дати змінено: ${datesEditCI} → ${datesEditCO}`);
                        } else { showToast('Помилка зміни дат'); }
                      } finally { setSavingInline(false); setDatesEditOpen(false); }
                    }}
                    style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>✓</button>
                  <button onClick={() => setDatesEditOpen(false)}
                    style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>✕</button>
                </div>
              )}
              <span style={{ width: 3, height: 3, background: 'var(--text-tertiary)', borderRadius: '50%' }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b.nights} н. · {b.adults} дор.{b.children > 0 ? ` + ${b.children} діт.` : ''}</span>
              {b.hostex_channel_type && (
                <span className="badge" style={{ background: '#ff6b3522', color: '#ff6b35' }}>Hostex: {b.hostex_channel_type}</span>
              )}
              {(b as any).is_multi_room ? (
                <span className="badge" style={{ background: '#f59e0b22', color: '#92400e' }}>⚠️ Multi-room</span>
              ) : null}
            </div>
            {/* ── Contact Buttons ── */}
            {(b.guest_phone || b.guest_email) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {b.guest_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{b.guest_phone}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <a href={`tel:${(b.guest_phone || '').replace(/[^\d+]/g, '')}`} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid #4ADE8040', background: '#4ADE801A', color: '#4ADE80', textDecoration: 'none' }} aria-label="Подзвонити">
                        <Phone size={14} />
                      </a>
                      <div style={{ position: 'relative' }}>
                        <button onClick={(e) => { e.stopPropagation(); setWaPopupOpen(!waPopupOpen); }}
                          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid #4ADE8040', background: '#4ADE801A', color: '#4ADE80', cursor: 'pointer' }} aria-label="WhatsApp">
                          <MessageCircle size={14} />
                        </button>
                        {waPopupOpen && (() => {
                          const phone = (b.guest_phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
                          const lang = phone.startsWith('420') || phone.startsWith('421') ? 'cz' : phone.startsWith('380') ? 'uk' : 'en';
                          const guestName = b.first_name || 'Guest';
                          const ciLong = new Date(b.check_in + 'T00:00:00').toLocaleDateString(lang === 'cz' ? 'cs-CZ' : lang === 'uk' ? 'uk-UA' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
                          const coLong = new Date(b.check_out + 'T00:00:00').toLocaleDateString(lang === 'cz' ? 'cs-CZ' : lang === 'uk' ? 'uk-UA' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
                          const houseName = b.unit_name || b.unit_code || '';
                          const guestUrl = b.guest_page_token ? `${window.location.origin}/guest/${b.guest_page_token}` : '';
                          const nights = b.nights || 1;
                          const guestsStr = lang === 'cz' ? `${b.adults} dosp.${b.children > 0 ? ` + ${b.children} dět.` : ''}` : lang === 'uk' ? `${b.adults} дор.${b.children > 0 ? ` + ${b.children} діт.` : ''}` : `${b.adults} adult${b.adults > 1 ? 's' : ''}${b.children > 0 ? ` + ${b.children} child.` : ''}`;
                          const totalStr = `${total.toLocaleString()} ${b.currency || 'CZK'}`;
                          const templates: { icon: string; name: string; preview: string; msg: string; hasLink?: boolean }[] = [
                            { icon: '✍', name: lang === 'cz' ? 'Bez šablony' : lang === 'uk' ? 'Без шаблону' : 'No template', preview: lang === 'cz' ? 'Otevřít WhatsApp s prázdným polem' : lang === 'uk' ? 'Відкрити WhatsApp з пустим полем' : 'Open WhatsApp with empty message', msg: '' },
                            { icon: '✓', name: lang === 'cz' ? 'Potvrzení rezervace' : lang === 'uk' ? 'Підтвердження броні' : 'Booking confirmation', hasLink: true,
                              preview: lang === 'cz' ? `Dobrý den, ${guestName}! Rezervace potvrzena...` : lang === 'uk' ? `Доброго дня, ${guestName}! Вашу бронь підтверджено...` : `Hello ${guestName}! Your booking is confirmed...`,
                              msg: lang === 'cz' ? `Dobrý den, ${guestName}! 👋\n\nPotvrzujeme vaši rezervaci v QA Glamping:\n📅 ${ciLong} — ${coLong} (${nights} nocí)\n🏡 Dům: ${houseName}\n👥 Hostů: ${guestsStr}\n💳 Cena: ${totalStr}\n\nVšechny detaily vaší rezervace, cesta, instrukce k příjezdu:\n${guestUrl}\n\nČekáme na vás! Pokud máte otázky — pište přímo sem.\n\n— Tým QA Glamping` : lang === 'uk' ? `Доброго дня, ${guestName}! 👋\n\nПідтверджуємо ваше бронювання в QA Glamping:\n📅 ${ciLong} — ${coLong} (${nights} ноч.)\n🏡 Будинок: ${houseName}\n👥 Гостей: ${guestsStr}\n💳 Сума: ${totalStr}\n\nУсі деталі вашої броні, дорога, інструкція заїзду — за посиланням:\n${guestUrl}\n\nЧекаємо на вас! Якщо є питання — пишіть прямо сюди.\n\n— Команда QA Glamping` : `Hello ${guestName}! 👋\n\nWe confirm your booking at QA Glamping:\n📅 ${ciLong} — ${coLong} (${nights} nights)\n🏡 House: ${houseName}\n👥 Guests: ${guestsStr}\n💳 Total: ${totalStr}\n\nAll details, directions, check-in instructions:\n${guestUrl}\n\nWe look forward to seeing you! Questions? Write here.\n\n— QA Glamping Team` },
                            { icon: '📋', name: lang === 'cz' ? 'Žádost o registrační kartu' : lang === 'uk' ? 'Запит реєстраційної картки' : 'Registration card request', hasLink: true,
                              preview: lang === 'cz' ? 'Pro ubytování je třeba vyplnit registrační kartu...' : lang === 'uk' ? 'Для заселення потрібно заповнити картку...' : 'Please fill in the registration card...',
                              msg: lang === 'cz' ? `Dobrý den, ${guestName}!\n\nPřipomínáme, že pro ubytování v ${houseName} ${ciLong} je třeba vyplnit krátkou registrační kartu (požadavek českého zákona).\n\nZabere to 2–3 minuty:\n${guestUrl}\n\nDěkujeme! 🙏` : lang === 'uk' ? `Доброго дня, ${guestName}!\n\nНагадуємо, що для заселення в ${houseName} ${ciLong} потрібно заповнити коротку реєстраційну картку (вимога законодавства Чехії).\n\nЦе займе 2–3 хвилини:\n${guestUrl}\n\nДякуємо! 🙏` : `Hello ${guestName}!\n\nA quick reminder: to check in at ${houseName} on ${ciLong}, please fill in a short registration card (Czech law requirement).\n\nIt takes 2–3 minutes:\n${guestUrl}\n\nThank you! 🙏` },
                            { icon: '🔑', name: lang === 'cz' ? 'Instrukce k příjezdu' : lang === 'uk' ? 'Інструкція заїзду' : 'Check-in instructions', hasLink: true,
                              preview: lang === 'cz' ? `Zítra vás čekáme v QA Glamping...` : lang === 'uk' ? `Завтра чекаємо на вас в QA Glamping...` : `Tomorrow we expect you at QA Glamping...`,
                              msg: lang === 'cz' ? `Dobrý den, ${guestName}!\n\nZítra vás čekáme v QA Glamping (${ciLong}, od 15:00).\n\n🏡 Váš dům: ${houseName}\n\nÚplná instrukce s fotkami, kontakty a Wi-Fi heslem:\n${guestUrl}\n\nPokud se zpozdíte nebo se něco stane — pište sem.\nPěknou cestu! 🌲` : lang === 'uk' ? `Доброго дня, ${guestName}!\n\nЗавтра чекаємо на вас в QA Glamping (${ciLong}, з 15:00).\n\n🏡 Ваш будинок: ${houseName}\n\nПовна інструкція з фото, контактами і Wi-Fi паролем:\n${guestUrl}\n\nЯкщо запізнюєтесь або щось трапилось — пишіть сюди.\nГарної дороги! 🌲` : `Hello ${guestName}!\n\nTomorrow we expect you at QA Glamping (${ciLong}, from 15:00).\n\n🏡 Your house: ${houseName}\n\nFull instructions with photos, contacts, and Wi-Fi password:\n${guestUrl}\n\nIf you're running late or anything happens — write here.\nSafe travels! 🌲` },
                            { icon: '⭐', name: lang === 'cz' ? 'Poděkování za recenzi' : lang === 'uk' ? 'Подяка за відгук' : 'Thank you for review',
                              preview: lang === 'cz' ? 'Děkujeme za pobyt! Budeme rádi za recenzi...' : lang === 'uk' ? 'Дякуємо за відпочинок! Будемо вдячні за відгук...' : 'Thank you for staying! We\'d love a review...',
                              msg: lang === 'cz' ? `Dobrý den, ${guestName}!\n\nDěkujeme, že jste si vybrali QA Glamping! 🌲\nBudeme vám vděční, pokud najdete 1 minutu a zanecháte nám recenzi na Googlu.\n\nBudeme rádi, když vás uvidíme znovu! Pokud plánujete výlet — pište, uděláme vám lepší nabídku jako stálému hostovi.\n\n— Tým QA Glamping` : lang === 'uk' ? `Доброго дня, ${guestName}!\n\nДякуємо, що обрали QA Glamping! 🌲\nБудемо щиро вдячні, якщо знайдете 1 хвилину і залишите відгук на Google.\n\nБудемо раді бачити вас знову! Якщо плануєте поїздку — пишіть, зробимо вам кращу пропозицію як постійному гостю.\n\n— Команда QA Glamping` : `Hello ${guestName}!\n\nThank you for choosing QA Glamping! 🌲\nWe'd really appreciate it if you could take 1 minute to leave us a review on Google.\n\nWe'd love to see you again! If you're planning a trip — write us, we'll make you a better offer as a returning guest.\n\n— QA Glamping Team` },
                          ];
                          return (
                            <>
                              <div onClick={() => setWaPopupOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                              <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 11, padding: 6, width: 340, boxShadow: '0 16px 40px -8px rgba(0,0,0,.6)', zIndex: 20 }}>
                                <div style={{ padding: '8px 10px 4px', fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>Швидкі шаблони <span style={{ fontSize: 9, opacity: 0.6, fontWeight: 400, textTransform: 'none' }}>({lang.toUpperCase()})</span></div>
                                {templates.map((t, i) => (
                                  <React.Fragment key={i}>
                                    {i === 1 && <div style={{ height: 1, background: 'var(--border-primary)', margin: '4px 8px' }} />}
                                    <div onClick={() => { setWaPopupOpen(false); const url = t.msg ? `https://wa.me/${phone}?text=${encodeURIComponent(t.msg)}` : `https://wa.me/${phone}`; window.open(url, '_blank'); }}
                                      style={{ padding: '9px 10px', borderRadius: 7, display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', transition: 'background .15s' }}
                                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                                      <div style={{ width: 28, height: 28, borderRadius: 7, background: i === 0 ? 'var(--bg-tertiary)' : 'rgba(34,197,94,.12)', color: i === 0 ? 'var(--text-secondary)' : '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{t.icon}</div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, marginBottom: 2 }}>{t.name}{t.hasLink && <span style={{ display: 'inline-block', fontSize: 9, background: 'rgba(79,142,255,.12)', color: 'var(--accent-primary)', padding: '1px 5px', borderRadius: 3, fontWeight: 600, letterSpacing: '.04em', marginLeft: 5, verticalAlign: 'middle' }}>+ посилання</span>}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.preview}</div>
                                      </div>
                                    </div>
                                  </React.Fragment>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
                {b.guest_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b.guest_email}</span>
                    <a href={`mailto:${b.guest_email}`} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid #5B7CFF40', background: '#5B7CFF1A', color: '#5B7CFF', textDecoration: 'none' }} aria-label="Email">
                      <Mail size={14} />
                    </a>
                  </div>
                )}
              </div>
            )}
            {/* ── Marketing Attribution ── */}
            {(b.utm_source || b.utm_medium || b.utm_campaign) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Джерело:</span>
                {b.utm_source && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: 4, fontFamily: 'ui-monospace, monospace' }}>src: {b.utm_source}</span>}
                {b.utm_medium && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: 4, fontFamily: 'ui-monospace, monospace' }}>med: {b.utm_medium}</span>}
                {b.utm_campaign && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: 4, fontFamily: 'ui-monospace, monospace' }}>cmp: {b.utm_campaign}</span>}
                {b.utm_content && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: 4, fontFamily: 'ui-monospace, monospace' }}>cnt: {b.utm_content}</span>}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', position: 'relative' }}>
            <button onClick={onClose} style={{ position: 'absolute', top: -2, right: -2, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }} aria-label="Закрити"><X size={14} /></button>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-primary)', marginTop: 16 }}>{total.toLocaleString()} {b.currency || 'CZK'}</div>
            {(b.commission_amount || 0) > 0 && <div style={{ fontSize: 11, color: '#f59e0b' }}>Комісія {(b.commission_amount || 0).toLocaleString()}</div>}
            {b.currency !== 'EUR' && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>≈ {toEur(total)} EUR</div>}
            {b.created_at && (
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                 <Clock size={10} /> {new Date(b.created_at + 'Z').toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            )}
          </div>
        </div>

        {/* ── Status Strip (chip cards like mockup) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '14px 0', borderBottom: '1px solid var(--border-primary)' }}>
          {/* Бронь */}
          {(() => {
            const isConfirmed = ['confirmed','checked_in','checked_out'].includes(b.status);
            const isCancelled = b.status === 'cancelled';
            const chipStyle = isConfirmed ? { bg: 'rgba(34,197,94,0.05)', border: 'rgba(34,197,94,0.2)', dot: '#22c55e' }
              : isCancelled ? { bg: 'rgba(239,68,68,0.05)', border: 'rgba(239,68,68,0.2)', dot: '#ef4444' }
              : { bg: 'var(--bg-secondary)', border: 'var(--border-primary)', dot: '#f59e0b' };
            return (
              <div onClick={() => {}} style={{ background: chipStyle.bg, border: `1px solid ${chipStyle.border}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: chipStyle.dot, boxShadow: `0 0 0 3px ${chipStyle.dot}33`, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>Бронь</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, paddingLeft: 15, marginTop: 4, color: isCancelled ? '#ef4444' : 'var(--text-primary)' }}>{STATUS_MAP[b.status]?.label || b.status}</div>
              </div>
            );
          })()}
          {/* Оплата */}
          {(() => {
            const isOk = isPaid;
            const chipStyle = isOk ? { bg: 'rgba(34,197,94,0.05)', border: 'rgba(34,197,94,0.2)', dot: '#22c55e' }
              : { bg: 'rgba(245,158,11,0.05)', border: 'rgba(245,158,11,0.25)', dot: '#f59e0b' };
            return (
              <div onClick={() => setViewTab('payment')} style={{ background: chipStyle.bg, border: `1px solid ${chipStyle.border}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: chipStyle.dot, boxShadow: `0 0 0 3px ${chipStyle.dot}33`, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>Оплата</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, paddingLeft: 15, marginTop: 4, color: isOk ? 'var(--text-primary)' : '#f59e0b' }}>{paid.toLocaleString()} / {total.toLocaleString()} {b.currency || 'CZK'}</div>
              </div>
            );
          })()}
          {/* Документи */}
          {(() => {
            const chipStyle = isRegistered ? { bg: 'rgba(34,197,94,0.05)', border: 'rgba(34,197,94,0.2)', dot: '#22c55e' }
              : { bg: 'rgba(245,158,11,0.05)', border: 'rgba(245,158,11,0.25)', dot: '#f59e0b' };
            return (
              <div onClick={() => setViewTab('registration')} style={{ background: chipStyle.bg, border: `1px solid ${chipStyle.border}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: chipStyle.dot, boxShadow: `0 0 0 3px ${chipStyle.dot}33`, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>Документи</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, paddingLeft: 15, marginTop: 4, color: isRegistered ? 'var(--text-primary)' : '#f59e0b' }}>{registrations.length} / {regNeeded}</div>
              </div>
            );
          })()}
          {/* Заселення — interactive chip */}
          {(() => {
            const isChecked = ['checked_in','checked_out'].includes(b.status);
            const canDoAction = (b.status === 'confirmed' && canCheckIn) || b.status === 'checked_in';
            const chipStyle = isChecked ? { bg: 'rgba(34,197,94,0.05)', border: 'rgba(34,197,94,0.2)', dot: '#22c55e' }
              : canDoAction ? { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.35)', dot: '#f59e0b' }
              : { bg: 'var(--bg-secondary)', border: 'var(--border-primary)', dot: 'var(--text-tertiary)' };
            const daysUntil = Math.ceil((new Date(b.check_in + 'T00:00:00').getTime() - Date.now()) / 86400000);
            const checkinText = b.status === 'checked_out' ? 'Виїхав'
              : b.status === 'checked_in' ? 'Заселено'
              : daysUntil === 0 ? 'Сьогодні'
              : daysUntil === 1 ? 'Завтра'
              : daysUntil > 1 ? `Через ${daysUntil} дн.`
              : 'Минув';
            const handleClick = () => {
              if (b.status === 'confirmed' && canCheckIn) {
                if (confirm('Заселити гостя?')) onChangeStatus(b.id, 'checked_in');
              } else if (b.status === 'checked_in') {
                if (confirm('Виселити гостя?')) onChangeStatus(b.id, 'checked_out');
              }
            };
            return (
              <div onClick={canDoAction ? handleClick : undefined}
                style={{ background: chipStyle.bg, border: `1px solid ${chipStyle.border}`, borderRadius: 10, padding: '10px 12px', cursor: canDoAction ? 'pointer' : 'default', transition: 'transform .15s, box-shadow .15s', ...(canDoAction ? { boxShadow: `0 0 0 1px ${chipStyle.dot}44` } : {}) }}
                onMouseEnter={(e) => canDoAction && (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={(e) => canDoAction && (e.currentTarget.style.transform = '')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: chipStyle.dot, boxShadow: isChecked ? `0 0 0 3px #22c55e33` : canDoAction ? `0 0 0 3px ${chipStyle.dot}44` : undefined, flexShrink: 0, ...(canDoAction && !isChecked ? { animation: 'pulse 2s ease-in-out infinite' } : {}) }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>Заселення</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: canDoAction ? 600 : 500, paddingLeft: 15, marginTop: 4, color: isChecked ? 'var(--text-primary)' : canDoAction ? chipStyle.dot : 'var(--text-tertiary)' }}>
                  {canDoAction && b.status === 'confirmed' ? '▶ Заселити' : canDoAction && b.status === 'checked_in' ? '▶ Виселити' : checkinText}
                </div>
              </div>
            );
          })()}
        </div>


        {/* ── Next Action Banner ── */}
        {(() => {
          const daysUntil = Math.ceil((new Date(b.check_in + 'T00:00:00').getTime() - Date.now()) / 86400000);
          const daysSince = Math.ceil((Date.now() - new Date(b.check_out + 'T00:00:00').getTime()) / 86400000);
          let action: { priority: string; label: string; context: string; cta: string; onClick: () => void } | null = null;

          if (b.status === 'cancelled') { /* no action */ }
          else if (!isPaid && daysUntil <= 2 && daysUntil >= 0) {
            action = { priority: 'URGENT', label: `Прийняти оплату ${remaining.toLocaleString()} ${b.currency || 'CZK'}`, context: daysUntil === 0 ? 'гість прибуває сьогодні' : `гість прибуває через ${daysUntil} дн.`, cta: 'Прийняти', onClick: () => { setViewTab('payment'); setShowPayForm(true); } };
          } else if (!isRegistered && daysUntil <= 1 && daysUntil >= 0) {
            action = { priority: 'HIGH', label: `Зареєструвати гостей (${registrations.length}/${regNeeded})`, context: 'до заїзду залишилось менше дня', cta: 'Реєстрація', onClick: () => setViewTab('registration') };
          } else if (b.status === 'confirmed' && daysUntil === 0) {
            action = { priority: 'HIGH', label: 'Гість прибуває сьогодні — заселити', context: 'після 15:00', cta: 'Заселити', onClick: () => onChangeStatus(b.id, 'checked_in') };
          } else if (b.status === 'checked_in' && daysSince >= 0) {
            action = { priority: 'HIGH', label: 'Гість має виїхати — виселити', context: 'після 11:00', cta: 'Виселити', onClick: () => onChangeStatus(b.id, 'checked_out') };
          } else if (!isPaid && daysUntil > 2) {
            action = { priority: 'MEDIUM', label: `Оплата не прийнята (${remaining.toLocaleString()} ${b.currency || 'CZK'})`, context: `до заїзду ${daysUntil} дн.`, cta: 'Оплата', onClick: () => { setViewTab('payment'); setShowPayForm(true); } };
          } else if (!isRegistered && daysUntil > 1) {
            action = { priority: 'MEDIUM', label: `Документи не заповнені (${registrations.length}/${regNeeded})`, context: `до заїзду ${daysUntil} дн.`, cta: 'Реєстрація', onClick: () => setViewTab('registration') };
          } else if (b.status === 'checked_out' && daysSince >= 1 && daysSince <= 7) {
            action = { priority: 'LOW', label: 'Запросити відгук', context: `гість виїхав ${daysSince} дн. тому`, cta: 'Відгук', onClick: () => {} };
          }

          if (!action) return null;
          const bannerColors: Record<string, { bg: string; border: string; label: string }> = {
            URGENT: { bg: 'linear-gradient(135deg,rgba(239,68,68,0.1),rgba(239,68,68,0.04))', border: 'rgba(239,68,68,0.25)', label: '#ef4444' },
            HIGH: { bg: 'linear-gradient(135deg,rgba(245,158,11,0.1),rgba(245,158,11,0.04))', border: 'rgba(245,158,11,0.25)', label: '#f59e0b' },
            MEDIUM: { bg: 'linear-gradient(135deg,rgba(79,142,255,0.1),rgba(79,142,255,0.04))', border: 'rgba(79,142,255,0.25)', label: '#4F8EFF' },
            LOW: { bg: 'var(--bg-secondary)', border: 'var(--border-primary)', label: 'var(--text-tertiary)' },
          };
          const bc = bannerColors[action.priority] || bannerColors.MEDIUM;
          const ctaBg = action.priority === 'URGENT' ? '#ef4444' : action.priority === 'HIGH' ? '#f59e0b' : 'var(--accent-primary)';
          return (
            <div style={{ background: bc.bg, border: `1px solid ${bc.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '8px 0' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14, color: bc.label, flexShrink: 0 }}>⚡</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: bc.label, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, lineHeight: 1, marginBottom: 2 }}>Наступна дія</div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{action.label} <small style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 6 }}>· {action.context}</small></div>
                </div>
              </div>
              <button onClick={action.onClick} style={{ background: ctaBg, color: '#0F1115', padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0, border: 'none', cursor: 'pointer', transition: 'transform .1s' }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = '')}>
                {action.cta} <ArrowRight size={12} />
              </button>
            </div>
          );
        })()}

        {/* ── Tab Bar ── */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-primary)', overflow: 'auto' }}>
          {([
            { key: 'payment' as const, label: '💰 Оплата', badge: isPaid ? undefined : `${pct}%` },
            { key: 'registration' as const, label: '📋 Реєстрація', badge: !isRegistered ? `${registrations.length}/${regNeeded}` : undefined },
            { key: 'groups' as const, label: '👥 Групи', badge: subBookings.length > 0 ? String(subBookings.length) : undefined },
            { key: 'tax' as const, label: '🏛️ Збір', badge: undefined as string | undefined },
            { key: 'notes' as const, label: '📝 Примітки', badge: undefined as string | undefined },
            { key: 'history' as const, label: '📊 Історія', badge: undefined as string | undefined },
            ...(isOwner ? [{ key: 'audit' as const, label: '🕐 Історія', badge: undefined as string | undefined }] : []),
          ]).map(tab => (
            <button key={tab.key} onClick={() => setViewTab(tab.key)}
              style={{
                padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: viewTab === tab.key ? 700 : 400,
                color: viewTab === tab.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottom: viewTab === tab.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center',
              }}>
              {tab.label}
              {tab.badge && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700 }}>{tab.badge}</span>}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div style={{ padding: '16px 0', minHeight: 200 }}>

          {/* 💰 PAYMENT TAB */}
          {viewTab === 'payment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Всього</div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-primary)' }}>{total.toLocaleString()} {b.currency || 'CZK'}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Оплачено</div><div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>{paid.toLocaleString()} {b.currency || 'CZK'}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Залишок</div><div style={{ fontSize: 16, fontWeight: 700, color: remaining > 0 ? '#ef4444' : '#22c55e' }}>{remaining.toLocaleString()} {b.currency || 'CZK'}</div></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', height: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 'var(--radius-full)', transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', letterSpacing: '.04em' }}>{pct}% · {b.currency || 'CZK'}</span>
                {!showPayForm && (
                  <button onClick={() => setShowPayForm(true)} style={{ background: 'var(--accent-primary)', color: '#fff', padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer' }}>
                    <Plus size={11} /> Платіж
                  </button>
                )}
                <button onClick={createPayLink} disabled={payLinkBusy} title="Створити лінк оплати Teya (без терміну дії)"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', border: '1px solid var(--border-primary)', cursor: payLinkBusy ? 'wait' : 'pointer' }}>
                  🔗 {payLinkBusy ? 'Створення…' : 'Лінк оплати'}
                </button>
              </div>
              {payLink && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 7 }}>
                  <a href={payLink} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', wordBreak: 'break-all', flex: 1 }}>{payLink}</a>
                  <button onClick={() => { navigator.clipboard.writeText(payLink).then(() => showToast('Скопійовано')); }}
                    style={{ background: 'none', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>Копіювати</button>
                </div>
              )}
              {payments.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Транзакції</div>
                  {payments.map((p: any) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-primary)', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-tertiary)', minWidth: 70 }}>{p.paid_at || '—'}</span>
                      <span style={{ fontWeight: 700, color: p.type === 'refund' ? '#ef4444' : '#22c55e', minWidth: 80 }}>{p.type === 'refund' ? '-' : '+'}{p.amount.toLocaleString()} {p.currency || b.currency || 'CZK'}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{METHOD_LABELS[p.method] || p.method}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}>{TYPE_LABELS[p.type] || p.type}</span>
                      {p.notes && <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes}</span>}
                      <button style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', padding: 2, marginLeft: 'auto', flexShrink: 0 }} title="Видалити"
                        onClick={async () => { if (!confirm('Видалити?')) return; await fetch(`/api/payments/${p.id}`, { method: 'DELETE' }); onFetchPayments(b.id); onFetchBookings(); showToast('Видалено'); }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Zero-price confirmation block */}
              {total === 0 && !isPaid && (
                <div style={{ padding: '14px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    Безоплатне бронювання
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Ціна = 0 {b.currency || 'CZK'}. Це може бути промокод, бартер або помилка. Підтвердіть свідомо або встановіть реальну ціну.
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
              {!showPayForm ? null : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-input" type="number" placeholder={`Сума ${b.currency || 'CZK'}`} style={{ flex: 1, fontSize: 13 }} value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} />
                    <select className="form-select" style={{ width: 140, fontSize: 13 }} value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}>
                      <option value="cash">💵 Готівка</option><option value="card">💳 Картою</option><option value="bank_transfer">🏦 Рахунок</option><option value="invoice">📄 Фактура</option><option value="booking_platform">🏨 Платформа бронювання</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select className="form-select" style={{ flex: 1, fontSize: 13 }} value={payForm.type} onChange={e => setPayForm(p => ({ ...p, type: e.target.value }))}>
                      <option value="deposit">Передплата</option><option value="partial">Часткова</option><option value="full">Повна</option><option value="refund">Повернення</option>
                    </select>
                    <input className="form-input" placeholder="Примітка" style={{ flex: 2, fontSize: 13 }} value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                  {payForm.method !== 'cash' && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '6px 8px', background: 'rgba(99,102,241,0.08)', borderRadius: 6, lineHeight: 1.4 }}>
                      ℹ️ Це <b>позначка статусу</b> — реальна транзакція з'явиться в Операціях, коли надійде з {payForm.method === 'card' ? 'Teya sync' : payForm.method === 'bank_transfer' ? 'банківської виписки' : payForm.method === 'booking_platform' ? 'виписки платформи' : 'фактичного джерела'}. Оплата картою / банком / платформою тут не створює подвійних записів у фінансах.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setShowPayForm(false)}>Скасувати</button>
                    <button className="btn btn-sm btn-primary" disabled={!payForm.amount || Number(payForm.amount) <= 0}
                      onClick={async () => {
                        const res = await fetch('/api/payments', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ reservation_id: b.id, amount: Number(payForm.amount), method: payForm.method, type: payForm.type, notes: payForm.notes || undefined }),
                        });
                        const data = await res.json().catch(() => ({}));
                        setPayForm({ amount: '', method: 'cash', type: 'partial', notes: '' });
                        setShowPayForm(false);
                        onFetchPayments(b.id);
                        onFetchBookings();
                        const msg = data?.kind === 'marker'
                          ? '✅ Позначка збережена. Реальна транзакція з\'явиться через Teya / банк.'
                          : 'Платіж додано!';
                        showToast(msg);
                      }}>
                      <Save size={12} /> {payForm.method === 'cash' ? 'Зберегти платіж' : 'Позначити як оплачено'}
                    </button>
                  </div>
                  {remaining > 0 && (
                    <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, alignSelf: 'flex-start' }}
                      onClick={() => setPayForm(p => ({ ...p, amount: String(remaining), type: remaining === total ? 'full' : 'partial' }))}>
                      Залишок: {remaining.toLocaleString()} {b.currency || 'CZK'}
                    </button>
                  )}
                </div>
              )}

              {/* ── Invoice + Company row ── */}
              <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
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
                    🏢 На компанію
                    {savingCompany && <Loader2 size={12} className="animate-spin" />}
                  </label>
                  {/* Invoice status inline */}
                  {invoice ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Receipt size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>{invoice.invoice_number}</span>
                      {/* Reconciliation badge — computed from already-loaded data */}
                      {Math.abs(invoice.amount - (b as any).total_price) <= 1 ? (
                        <span title="Сума збігається з бронюванням" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600 }}>🟢</span>
                      ) : (
                        <span title={`Сума фактури ${invoice.amount} ≠ бронювання ${(b as any).total_price}`} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 600 }}>🟡 Розбіжність</span>
                      )}
                      <button className="btn btn-sm btn-ghost" style={{ fontSize: 10, padding: '2px 6px' }}
                        onClick={() => window.open(`/api/invoices/${invoice.id}`, '_blank')}>👁</button>
                      <button className="btn btn-sm btn-ghost" style={{ fontSize: 10, padding: '2px 6px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3 }}
                        onClick={handleReissue} disabled={reissuing}>
                        {reissuing ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                        Оновити
                      </button>
                    </div>
                  ) : isPaid ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Receipt size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#f59e0b' }}>Не згенеровано</span>
                      <button className="btn btn-sm btn-primary" style={{ fontSize: 10, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 3 }}
                        onClick={handleReissue} disabled={reissuing}>
                        {reissuing ? <Loader2 size={10} className="animate-spin" /> : <Receipt size={10} />}
                        Згенерувати
                      </button>
                    </div>
                  ) : null}
                </div>
                {companyMode && (
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      placeholder="Назва компанії *"
                      value={company.name}
                      onChange={(e) => setCompany({ ...company, name: e.target.value })}
                      onBlur={() => persistCompany(true, company)}
                      style={{ gridColumn: 'span 2', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                    <input
                      placeholder="IČO"
                      value={company.ico}
                      onChange={(e) => setCompany({ ...company, ico: e.target.value })}
                      onBlur={() => persistCompany(true, company)}
                      style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                    <input
                      placeholder="DIČ (опціонально)"
                      value={company.dic}
                      onChange={(e) => setCompany({ ...company, dic: e.target.value })}
                      onBlur={() => persistCompany(true, company)}
                      style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                    <input
                      placeholder="Адреса"
                      value={company.address}
                      onChange={(e) => setCompany({ ...company, address: e.target.value })}
                      onBlur={() => persistCompany(true, company)}
                      style={{ gridColumn: 'span 2', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                    <input
                      placeholder="Місто"
                      value={company.city}
                      onChange={(e) => setCompany({ ...company, city: e.target.value })}
                      onBlur={() => persistCompany(true, company)}
                      style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                    <input
                      placeholder="Країна (CZ, SK, DE, …)"
                      value={company.country}
                      onChange={(e) => setCompany({ ...company, country: e.target.value.toUpperCase() })}
                      onBlur={() => persistCompany(true, company)}
                      style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                    <input
                      placeholder="Email"
                      value={company.email}
                      onChange={(e) => setCompany({ ...company, email: e.target.value })}
                      onBlur={() => persistCompany(true, company)}
                      style={{ gridColumn: 'span 2', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                    {invoice && (
                      <div style={{ gridColumn: 'span 2', fontSize: 11, color: 'var(--text-tertiary)' }}>
                        ℹ️ Після зміни — натисни "Перевиставити" в блоці фактури нижче, щоб оновити документ.
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* 📋 REGISTRATION TAB */}
          {viewTab === 'registration' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                padding: '10px 16px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 8,
                background: isRegistered ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${isRegistered ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}>
                <span style={{ fontSize: 18 }}>{isRegistered ? '✅' : '❌'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: isRegistered ? '#22c55e' : '#ef4444' }}>
                    {isRegistered ? 'Реєстрація завершена' : `Зареєструйте ще ${regNeeded - registrations.length} гостей`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{registrations.length} з {regNeeded}</div>
                </div>
              </div>

              {registrations.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>Зареєстровані</div>
                  {registrations.map((r: any) => (
                    <div key={r.reg_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', marginBottom: 6 }}>
                      <span style={{ fontSize: 20 }}>👤</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{r.last_name} {r.first_name} {r.is_primary ? '⭐' : ''}</div>
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
                <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>➕ Гість #{registrations.length + 1}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="file" accept="image/*" capture="environment" ref={ocrFileRef} style={{ display: 'none' }}
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
                            if (data.success !== false) {
                              const ocr = data.data || data.ocr_results?.[0];
                              if (ocr) {
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
                                showToast(`✅ Розпізнано: ${ocr.firstName} ${ocr.lastName} (точність: ${ocr.confidence || '?'}%)`);
                              } else {
                                showToast('⚠️ Не вдалося розпізнати документ');
                              }
                            } else {
                              showToast(`❌ ${data.error || 'Помилка OCR'}`);
                            }
                          } catch (err: any) {
                            showToast(`❌ ${err.message || 'Помилка'}`);
                          } finally {
                            setOcrScanning(false);
                            if (ocrFileRef.current) ocrFileRef.current.value = '';
                          }
                        }} />
                      <button onClick={() => ocrFileRef.current?.click()} disabled={ocrScanning}
                        style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, background: 'rgba(99,102,241,0.12)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                        {ocrScanning ? <Loader2 size={12} className="animate-spin" /> : '📷'}
                        {ocrScanning ? 'Розпізнається...' : 'Фото документа'}
                      </button>
                    </div>
                  </div>
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
                        <option value="ID_CARD">ID Card</option><option value="PASSPORT">Passport</option><option value="DRIVING_LICENCE">Driving Licence</option><option value="TRAVEL_DOCUMENT">Travel Document</option><option value="OTHER">Other</option>
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
                    {savingReg ? <Loader2 size={14} className="animate-pulse" /> : <Check size={14} />} Зареєструвати
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 🏛️ TAX TAB */}
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
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{taxAmt.toLocaleString()} CZK</div>
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

          {/* 📝 NOTES TAB */}
          {viewTab === 'notes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {b.notes && (
                <div style={{ padding: 16, background: 'rgba(59,130,246,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ fontSize: 11, color: '#3b82f6', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>📋 Інформація (Hostex)</div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{b.notes}</div>
                </div>
              )}
              {b.internal_notes ? (
                <div style={{ padding: 16, background: 'rgba(250,204,21,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(250,204,21,0.2)' }}>
                  <div style={{ fontSize: 11, color: '#facc15', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>📝 Внутрішні примітки</div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{b.internal_notes}</div>
                </div>
              ) : (
                !b.notes && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>Немає приміток</div>
              )}
              {b.guest_email && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📧 {b.guest_email}</div>}
              {b.guest_phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}><Phone size={12} style={{ display: 'inline' }} /> {b.guest_phone}</div>}
            </div>
          )}

          {/* 📊 HISTORY TAB */}
          {/* 👥 GROUPS / SUB-BOOKINGS TAB */}
          {viewTab === 'groups' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {subBookings.length === 0 && !showGroupForm && (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🏠</div>
                  <p style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-secondary)' }}>Мульти-групове бронювання</p>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4, maxWidth: 360, margin: '0 auto 16px' }}>
                    Додайте групи гостей — кожна група прив'язується до свого юніту (кімната, будинок, місце на кемпінгу).
                    Юніт автоматично блокується в календарі на ті ж дати.
                  </p>
                </div>
              )}

              {/* Sub-booking cards */}
              {subBookings.map((sb: any, idx: number) => {
                const isExpanded = expandedSubs.has(sb.id);
                return (
                  <div key={sb.id} style={{
                    border: '1px solid var(--border-primary)', borderRadius: 10,
                    background: 'var(--bg-secondary)', overflow: 'hidden',
                  }}>
                    {/* Header */}
                    <div
                      onClick={() => setExpandedSubs(prev => {
                        const next = new Set(prev);
                        next.has(sb.id) ? next.delete(sb.id) : next.add(sb.id);
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
                        {Number(sb.subtotal).toLocaleString()} {b.currency || 'CZK'}
                      </div>
                      {/* Payment status badge for child */}
                      {sb.child_payment_status && (
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 6, fontWeight: 600,
                          color: sb.child_payment_status === 'paid' ? '#22c55e' : '#f59e0b',
                          background: sb.child_payment_status === 'paid' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                        }}>
                          {sb.child_payment_status === 'paid' ? '✅' : '⏳'}
                        </span>
                      )}
                      {/* Guest page link */}
                      {sb.child_guest_page_token && (
                        <button
                          onClick={(e) => { e.stopPropagation(); window.open(`/guest/${sb.child_guest_page_token}`, '_blank'); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: 4 }}
                          title="Гостьова сторінка цієї групи"
                        >
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
                        title="Видалити групу"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Expanded: line items */}
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

                        {/* Add line item form */}
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
                              style={{ padding: '6px 10px', fontSize: 12, background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              <Plus size={12} />
                            </button>
                            <button onClick={() => setEditingLineItems(null)}
                              style={{ padding: '6px 8px', fontSize: 12, background: 'none', border: '1px solid var(--border-primary)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)' }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setEditingLineItems(sb.id)}
                            style={{ marginTop: 8, padding: '4px 10px', fontSize: 11, background: 'none', border: '1px dashed var(--border-primary)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)' }}
                          >
                            + Додати рядок
                          </button>
                        )}

                        {sb.notes && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, fontStyle: 'italic' }}>💬 {sb.notes}</div>}

                        {/* Guest page link for child reservation */}
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
                              style={{ padding: '3px 8px', fontSize: 10, background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}
                            >
                              <Copy size={10} /> Копіювати
                            </button>
                            <button
                              onClick={() => window.open(`/guest/${sb.child_guest_page_token}`, '_blank')}
                              style={{ padding: '3px 8px', fontSize: 10, background: 'none', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              Відкрити
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Sum verification */}
              {subBookings.length > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Σ Sub-bookings</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {subBookings.reduce((s: number, sb: any) => s + Number(sb.subtotal || 0), 0).toLocaleString()} {b.currency || 'CZK'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Total бронювання</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {Number(b.total_price || 0).toLocaleString()} {b.currency || 'CZK'}
                    </div>
                  </div>
                  {(() => {
                    const subSum = subBookings.reduce((s: number, sb: any) => s + Number(sb.subtotal || 0), 0);
                    const diff = Math.abs(subSum - Number(b.total_price || 0));
                    if (diff < 1) return <span style={{ fontSize: 18 }}>✅</span>;
                    return <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700 }}>⚠️ Δ {diff.toLocaleString()}</span>;
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
                      <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>💰 Вартість цієї групи ({b.currency || 'CZK'})</label>
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
                      style={{ padding: '6px 14px', fontSize: 12, background: 'none', border: '1px solid var(--border-primary)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >Скасувати</button>
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
                      style={{ padding: '6px 14px', fontSize: 12, background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {savingGroup ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
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
                  }}
                >
                  <Plus size={14} /> Додати групу
                </button>
              )}
            </div>
          )}

          {viewTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {activityLog.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>Немає записів</div>}
              {activityLog.map((log: any) => {
                const icons: Record<string, string> = { status_change: '🔄', payment_status_change: '💳', price_change: '💰', note: '📝', created: '➕' };
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

          {viewTab === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
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

        {/* ── Persistent Notes ── */}
        <div style={{ marginTop: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editingNotes ? 8 : (b.internal_notes ? 6 : 0) }}>
            <span style={{ fontSize: 10, color: '#f59e0b', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>📝 Примітка</span>
            <button onClick={() => { if (editingNotes) { /* save */ fetch(`/api/bookings/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ internal_notes: notesDraft }) }).then(() => { setBooking({ ...b, internal_notes: notesDraft }); showToast('Примітку збережено'); }); setEditingNotes(false); } else { setNotesDraft(b.internal_notes || ''); setEditingNotes(true); } }}
              style={{ fontSize: 11, color: editingNotes ? '#22c55e' : 'var(--text-tertiary)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
              {editingNotes ? '✓ Зберегти' : 'Редагувати'}
            </button>
          </div>
          {editingNotes ? (
            <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Додай контекст (алергії, побажання, пізній заїзд тощо)"
              style={{ width: '100%', fontSize: 13, lineHeight: 1.45, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical', minHeight: 60 }} />
          ) : b.internal_notes ? (
            <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{b.internal_notes}</div>
          ) : (
            <div onClick={() => { setNotesDraft(''); setEditingNotes(true); }}
              style={{ fontSize: 13, color: 'var(--text-tertiary)', cursor: 'pointer', fontStyle: 'italic' }}>
              Додай контекст для зміни (алергії, побажання, пізній заїзд тощо)
            </div>
          )}
          {b.notes && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(245,158,11,0.15)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600 }}>📥 Від гостя / Hostex</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{b.notes}</div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
