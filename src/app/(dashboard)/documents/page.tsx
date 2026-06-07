'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  FileText, Download, Eye, RefreshCw, Receipt,
  CheckCircle, AlertCircle, Calendar, User,
  GitCompare, Filter, ChevronLeft, ChevronRight,
  XCircle, AlertTriangle, Banknote, Plus, Mail, FileCode, Package,
  Sparkles, Send, Building2, FileDown, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  invoice_number: string;
  issued_at: string;
  due_date: string;
  amount: number;
  currency: string;
  status: 'issued' | 'cancelled';
  reservation_id: string;
  guest_first_name: string;
  guest_last_name: string;
  unit_name: string;
}

type ReconStatus = 'matched' | 'mismatch' | 'missing' | 'cash';

interface ReconRow {
  op_id: string;
  paid_at: string | null;
  op_amount: number;
  currency: string;
  method: string | null;
  source: string | null;
  reservation_id: string | null;
  comment: string | null;
  guest_name: string | null;
  guest_email: string | null;
  invoice_company_name: string | null;
  invoice_company_email: string | null;
  unit_name: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_status: string | null;
  recon_status: ReconStatus;
}

interface ReconSummary {
  matched: number;
  mismatch: number;
  missing: number;
  cash: number;
  total_amount: number;
  missing_amount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatAmount(amount: number | null | undefined, currency = 'CZK') {
  const safe = typeof amount === 'number' && isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(safe);
}

function getMonthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
}

function prevMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Reconciliation status config ────────────────────────────────────────────

const RECON_CONFIG: Record<ReconStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  matched:  { label: 'Звірено',       color: '#22c55e', bg: 'rgba(34,197,94,0.12)',    icon: <CheckCircle  size={12} /> },
  mismatch: { label: 'Розбіжність',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   icon: <AlertTriangle size={12} /> },
  missing:  { label: 'Без фактури',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    icon: <XCircle       size={12} /> },
  cash:     { label: 'Готівка',       color: '#9ca3af', bg: 'rgba(156,163,175,0.12)',  icon: <Banknote      size={12} /> },
};

const METHOD_LABELS: Record<string, string> = {
  cash:             '💵 Готівка',
  card:             '💳 Картою',
  bank_transfer:    '🏦 На рахунок',
  online:           '🌐 Online (Teya)',
  booking_platform: '🏨 Платформа',
  invoice:          '📄 Фактура',
};

const SOURCE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  airbnb:      { label: 'Airbnb',      color: '#FF5A5F', bg: 'rgba(255,90,95,0.12)' },
  booking_com: { label: 'Booking.com', color: '#003580', bg: 'rgba(0,53,128,0.12)'  },
  teia:        { label: 'Teya',        color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  teya_sync:   { label: 'Teya sync',   color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
};

/** For OTA rows without linked reservation, extract guest name from comment */
function extractDisplayName(row: ReconRow): string {
  if (row.invoice_company_name) return row.invoice_company_name;
  if (row.guest_name && row.guest_name.trim()) return row.guest_name.trim();
  // Parse from OTA comment: "Airbnb: Guest Name 2026-05-31–..."
  if (row.comment) {
    const m = row.comment.match(/^(?:Airbnb|Booking\.com):\s*([^\d,]+?)(?:\s+\d{4}-|,|$)/);
    if (m?.[1]?.trim()) return m[1].trim();
    return row.comment.split(':').slice(1).join(':').split(',')[0].trim() || row.comment;
  }
  return '—';
}

// ─── Reconciliation Status Badge ─────────────────────────────────────────────

function ReconBadge({ status }: { status: ReconStatus }) {
  const cfg = RECON_CONFIG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const onMenuClick = useMobileMenu();
  const searchParams = useSearchParams();

  // Read initial values from URL params (?tab=reconciliation&month=2026-05)
  const urlTab = searchParams.get('tab');
  const urlMonth = searchParams.get('month');
  const validMonth = (m: string | null) => m && /^\d{4}-\d{2}$/.test(m) ? m : null;

  const [activeTab, setActiveTab] = useState<'invoices' | 'reconciliation'>(
    urlTab === 'reconciliation' ? 'reconciliation' : 'invoices'
  );

  // ── Invoices tab state ────────────────────────────────────────
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError]   = useState<string | null>(null);

  // ── Reconciliation tab state ──────────────────────────────────
  const [month, setMonth]           = useState(validMonth(urlMonth) || currentMonth());

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [nameFilter, setNameFilter]     = useState<string>('');
  const [reconRows, setReconRows]   = useState<ReconRow[]>([]);
  const [reconSummary, setReconSummary] = useState<ReconSummary | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconError, setReconError] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  // ── Email popover state ───────────────────────────────────────
  const [emailPopover, setEmailPopover] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    defaultEmail: string;
  } | null>(null);
  const [emailTo, setEmailTo]         = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailToast, setEmailToast]   = useState<string | null>(null);

  // ── Custom Invoice Modal state ────────────────────────────────
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState({
    description:   'Krátkodobé ubytování',
    descCustom:    '',
    amount:        '',
    currency:      'CZK',
    dueDate:       '',
    paymentMethod: 'Příkazem',
    buyerName:     '',
    buyerIco:      '',
    buyerDic:      '',
    buyerAddress:  '',
    buyerCity:     '',
    emailTo:       '',
    showBuyer:     false,
  });
  const [customGenerating, setCustomGenerating] = useState(false);
  const [customToast,      setCustomToast]      = useState<string | null>(null);

  const DESCRIPTION_PRESETS = [
    'Krátkodobé ubytování',
    'Záloha na ubytování',
    'Dlouhodobý pronájem',
    'Ubytování skupiny',
    'Wellness & doplňkové služby',
    'Jiné (zadat ručně)',
  ];

  const handleGenerateCustom = async (emailAfter: boolean) => {
    const desc = customForm.description === 'Jiné (zadat ručně)'
      ? customForm.descCustom.trim()
      : customForm.description;
    const amt = parseFloat(customForm.amount);
    if (!desc) { setCustomToast('❌ Вкажіть опис фактури'); return; }
    if (!amt || amt <= 0) { setCustomToast('❌ Вкажіть суму'); return; }
    if (emailAfter && !customForm.emailTo.trim()) {
      setCustomToast('❌ Вкажіть email для відправки'); return;
    }
    setCustomGenerating(true);
    setCustomToast(null);
    try {
      const today = new Date();
      const defDue = customForm.dueDate || (() => {
        const d = new Date(); d.setDate(d.getDate() + 14);
        return d.toISOString().slice(0, 10);
      })();
      const body: Record<string, unknown> = {
        description:   desc,
        amount:        amt,
        currency:      customForm.currency,
        dueDate:       defDue,
        paymentMethod: customForm.paymentMethod,
        action:        emailAfter ? 'pdf' : 'pdf',
      };
      if (customForm.showBuyer) {
        if (customForm.buyerName)    body.buyerName    = customForm.buyerName;
        if (customForm.buyerIco)     body.buyerIco     = customForm.buyerIco;
        if (customForm.buyerDic)     body.buyerDic     = customForm.buyerDic;
        if (customForm.buyerAddress) body.buyerAddress = customForm.buyerAddress;
        if (customForm.buyerCity)    body.buyerCity    = customForm.buyerCity;
      }
      if (emailAfter && customForm.emailTo.trim()) body.emailTo = customForm.emailTo.trim();
      const res = await fetch('/api/invoices/custom', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      // Download PDF from response
      const blob = await res.blob();
      const invoiceNum = res.headers.get('X-Invoice-Number') || 'faktura';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `faktura-${invoiceNum}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setCustomToast(emailAfter
        ? `✅ PDF збережено і надіслано на ${customForm.emailTo}`
        : '✅ PDF згенеровано і завантажено');
      // Refresh invoice list after short delay
      setTimeout(() => { fetchInvoices(); fetchRecon(); }, 1000);
      setTimeout(() => setShowCustomModal(false), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCustomToast(`❌ Помилка: ${msg}`);
    } finally {
      setCustomGenerating(false);
    }
  };

  // ── ISDOC download ────────────────────────────────────────────
  const downloadIsdoc = useCallback((invoiceId: string, invoiceNumber: string) => {
    const a = document.createElement('a');
    a.href = `/api/invoices/${invoiceId}/isdoc`;
    a.download = `faktura-${invoiceNumber}.isdoc`;
    a.click();
  }, []);

  // ── Open email popover ────────────────────────────────────────
  const openEmailPopover = useCallback((row: ReconRow) => {
    if (!row.invoice_id || !row.invoice_number) return;
    const defaultEmail = row.invoice_company_email || row.guest_email || '';
    setEmailTo(defaultEmail);
    setEmailPopover({ invoiceId: row.invoice_id, invoiceNumber: row.invoice_number, defaultEmail });
  }, []);

  // ── Send invoice email ────────────────────────────────────────
  const sendInvoiceEmail = useCallback(async () => {
    if (!emailPopover || !emailTo.trim()) return;
    setEmailSending(true);
    try {
      const res = await fetch(`/api/invoices/${emailPopover.invoiceId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setEmailPopover(null);
      setEmailToast(`✅ Надіслано на ${data.to}`);
      setTimeout(() => setEmailToast(null), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setEmailToast(`❌ Помилка: ${msg}`);
      setTimeout(() => setEmailToast(null), 5000);
    } finally {
      setEmailSending(false);
    }
  }, [emailPopover, emailTo]);

  // ── Fetch invoices ────────────────────────────────────────────
  const fetchInvoices = useCallback(async () => {
    setInvLoading(true);
    setInvError(null);
    try {
      const res = await fetch('/api/invoices');
      if (!res.ok) throw new Error('Failed to fetch');
      setInvoices(await res.json());
    } catch {
      setInvError('Не вдалося завантажити документи');
    } finally {
      setInvLoading(false);
    }
  }, []);

  // ── Fetch reconciliation ──────────────────────────────────────
  const fetchRecon = useCallback(async () => {
    setReconLoading(true);
    setReconError(null);
    try {
      const params = new URLSearchParams({ month, status: statusFilter, method: methodFilter });
      const res = await fetch(`/api/accounting/reconciliation?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setReconRows(data.rows ?? []);
      setReconSummary(data.summary ?? null);
    } catch {
      setReconError('Не вдалося завантажити журнал');
    } finally {
      setReconLoading(false);
    }
  }, [month, statusFilter, methodFilter]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => {
    if (activeTab === 'reconciliation') fetchRecon();
  }, [activeTab, fetchRecon]);

  // ── Actions ───────────────────────────────────────────────────
  const openInvoice     = (id: string)   => window.open(`/api/invoices/${id}`, '_blank');
  const downloadInvoice = (id: string, num: string) => {
    const a = document.createElement('a');
    a.href = `/api/invoices/${id}?format=download`;
    a.download = `faktura-${num}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const createInvoice = async (reservationId: string) => {
    if (!reservationId) return;
    setCreatingFor(reservationId);
    try {
      const res = await fetch(`/api/bookings/${reservationId}/invoice/reissue`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      await fetchRecon();
    } catch {
      alert('Не вдалося створити фактуру');
    } finally {
      setCreatingFor(null);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Header title="Документи" onMenuClick={onMenuClick} />
      <div className="app-content">

        {/* ─── Page Header ──────────────────────────────────────── */}
        <div className="page-header">
          <div>
            <h2 className="page-title">Документи</h2>
            <div className="page-subtitle">Інвойси та бухгалтерська звірка транзакцій</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowCustomModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Sparkles size={14} /> Вільна фактура
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={activeTab === 'invoices' ? fetchInvoices : fetchRecon}
              disabled={activeTab === 'invoices' ? invLoading : reconLoading}
            >
              <RefreshCw size={14} className={(activeTab === 'invoices' ? invLoading : reconLoading) ? 'spin' : ''} />
              Оновити
            </button>
          </div>
        </div>

        {/* ─── Tab Bar ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border-primary)' }}>
          {([
            { key: 'invoices',       label: '📄 Фактури',        count: invoices.filter(i => i.status === 'issued').length },
            { key: 'reconciliation', label: '🔍 Журнал звірки',   count: reconSummary ? reconSummary.missing + reconSummary.mismatch : undefined },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 16px', fontSize: 14, fontWeight: 600,
                color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                marginBottom: -1, display: 'flex', alignItems: 'center', gap: 8,
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span style={{
                  background: tab.key === 'reconciliation' ? 'rgba(239,68,68,0.15)' : 'rgba(79,110,247,0.15)',
                  color:      tab.key === 'reconciliation' ? '#ef4444' : 'var(--accent-primary)',
                  borderRadius: 20, padding: '1px 7px', fontSize: 11,
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════
            TAB: INVOICES
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'invoices' && (
          <>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(79,110,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Receipt size={18} color="var(--accent-primary)" />
                  </div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Всього інвойсів</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{invoices.length}</div>
              </div>
              <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle size={18} color="var(--accent-success)" />
                  </div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Виставлено</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{invoices.filter(i => i.status === 'issued').length}</div>
              </div>
              <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(79,110,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={18} color="var(--accent-primary)" />
                  </div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Сума (поточний рік)</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {formatAmount(invoices.filter(i => i.issued_at?.startsWith(new Date().getFullYear().toString()) && i.status === 'issued').reduce((s, i) => s + i.amount, 0))}
                </div>
              </div>
            </div>

            {/* Info banner */}
            <div style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
              <AlertCircle size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
              <span>
                Інвойси (Faktury) генеруються <strong>автоматично</strong> після позначення бронювання як{' '}
                <strong>«Оплачено»</strong>. Kemp Carlsbad s.r.o. — <strong>neplátce DPH</strong>.
                Для збереження PDF — відкрийте інвойс та натисніть «Stáhnout PDF / Tisk» у браузері.
              </span>
            </div>

            {/* Invoices Table */}
            {invLoading ? (
              <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <RefreshCw size={24} className="spin" style={{ marginBottom: 12 }} />
                <div>Завантаження документів...</div>
              </div>
            ) : invError ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
                <AlertCircle size={24} style={{ marginBottom: 8 }} /><div>{invError}</div>
              </div>
            ) : invoices.length === 0 ? (
              <div className="card" style={{ padding: 56, textAlign: 'center' }}>
                <Receipt size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Документів ще немає</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                  Інвойс буде створено автоматично, коли бронювання буде позначено як оплачене.
                </div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Номер</th>
                      <th>Гість</th>
                      <th>Об&apos;єкт</th>
                      <th>Сума</th>
                      <th>Дата виставлення</th>
                      <th>Термін оплати</th>
                      <th>Статус</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileText size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                            <code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: 'var(--accent-primary)' }}>
                              {inv.invoice_number}
                            </code>
                          </span>
                        </td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <User size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            <span style={{ fontWeight: 500 }}>{inv.guest_first_name} {inv.guest_last_name}</span>
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{inv.unit_name}</td>
                        <td><span style={{ fontWeight: 700, fontSize: 14 }}>{formatAmount(inv.amount, inv.currency)}</span></td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: 13 }}>
                            <Calendar size={12} />{formatDate(inv.issued_at)}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{formatDate(inv.due_date)}</td>
                        <td>
                          {inv.status === 'issued'
                            ? <span className="badge badge-success">✓ Виставлено</span>
                            : <span className="badge badge-danger">Скасовано</span>
                          }
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button className="btn btn-sm btn-ghost btn-icon" title="Переглянути / Друк / PDF" onClick={() => openInvoice(inv.id)}>
                              <Eye size={14} />
                            </button>
                            <button className="btn btn-sm btn-ghost btn-icon" title="Завантажити HTML" onClick={() => downloadInvoice(inv.id, inv.invoice_number)}>
                              <Download size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: RECONCILIATION JOURNAL
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'reconciliation' && (
          <>
            {/* ─── Month Navigator ──────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm btn-icon" title="Оновити" onClick={fetchRecon}>
                  <RefreshCw size={14} className={reconLoading ? 'spin' : ''} />
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setMonth(prevMonth(month))}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontWeight: 700, fontSize: 16, minWidth: 180, textAlign: 'center' }}>
                  {getMonthLabel(month)}
                </span>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => setMonth(nextMonth(month))}
                  disabled={month >= currentMonth()}
                >
                  <ChevronRight size={16} />
                </button>
                {month !== currentMonth() && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setMonth(currentMonth())} style={{ fontSize: 12 }}>
                    Поточний місяць
                  </button>
                )}
              </div>

              {/* Search by name + filters row */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

                {/* Name search */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <User size={13} style={{
                    position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-tertiary)', pointerEvents: 'none',
                  }} />
                  <input
                    type="text"
                    placeholder="Пошук за іменем..."
                    value={nameFilter}
                    onChange={e => setNameFilter(e.target.value)}
                    style={{
                      paddingLeft: 28, paddingRight: nameFilter ? 28 : 10,
                      height: 34, fontSize: 13, borderRadius: 7,
                      border: '1px solid var(--border)', background: 'var(--surface)',
                      color: 'var(--text-primary)', width: 200, outline: 'none',
                    }}
                  />
                  {nameFilter && (
                    <button onClick={() => setNameFilter('')} style={{
                      position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                      color: 'var(--text-tertiary)', display: 'flex',
                    }}>
                      <XCircle size={13} />
                    </button>
                  )}
                </div>

                <Filter size={14} style={{ color: 'var(--text-tertiary)' }} />
                <select
                  className="form-select"
                  style={{ fontSize: 13, padding: '5px 10px', height: 34 }}
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="all">Всі статуси</option>
                  <option value="matched">✅ Звірено</option>
                  <option value="missing">❌ Без фактури</option>
                  <option value="mismatch">⚠️ Розбіжність</option>
                  <option value="cash">⚪ Готівка</option>
                </select>
                <select
                  className="form-select"
                  style={{ fontSize: 13, padding: '5px 10px', height: 34 }}
                  value={methodFilter}
                  onChange={e => setMethodFilter(e.target.value)}
                >
                  <option value="all">Всі методи</option>
                  <option value="online">🌐 Online (Teya)</option>
                  <option value="card">💳 Картою</option>
                  <option value="bank_transfer">🏦 На рахунок</option>
                  <option value="booking_platform">🏨 Платформа</option>
                  <option value="cash">💵 Готівка</option>
                </select>

                {/* ISDOC ZIP export */}
                <a
                  href={`/api/accounting/isdoc-batch?month=${month}`}
                  download={`isdoc-${month}.zip`}
                  title={`Завантажити всі ISDOC за ${month}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 7,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                    textDecoration: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  <Package size={13} /> ISDOC ZIP
                </a>
              </div>
            </div>

            {/* ─── Summary Cards ────────────────────────────────── */}
            {reconSummary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                {([
                  { key: 'matched',  icon: <CheckCircle size={16} />,   label: 'Звірено',     color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   value: reconSummary.matched },
                  { key: 'missing',  icon: <XCircle size={16} />,       label: 'Без фактури', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   value: reconSummary.missing },
                  { key: 'mismatch', icon: <AlertTriangle size={16} />, label: 'Розбіжність', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', value: reconSummary.mismatch },
                  { key: 'cash',     icon: <Banknote size={16} />,      label: 'Готівка',     color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', value: reconSummary.cash },
                ] as const).map(card => (
                  <button
                    key={card.key}
                    onClick={() => setStatusFilter(statusFilter === card.key ? 'all' : card.key)}
                    className="card"
                    style={{
                      padding: '14px 16px', cursor: 'pointer', border: 'none', textAlign: 'left',
                      outline: statusFilter === card.key ? `2px solid ${card.color}` : 'none',
                      background: statusFilter === card.key ? card.bg : undefined,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: card.color }}>
                      {card.icon}
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{card.label}</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                    {card.key === 'missing' && reconSummary.missing_amount > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {formatAmount(reconSummary.missing_amount)} без фактур
                      </div>
                    )}
                    {card.key === 'matched' && (
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {formatAmount(reconSummary.total_amount)} всього
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* ─── Journal Table ────────────────────────────────── */}
            {reconLoading ? (
              <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <RefreshCw size={24} className="spin" style={{ marginBottom: 12 }} />
                <div>Завантаження журналу...</div>
              </div>
            ) : reconError ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
                <AlertCircle size={24} style={{ marginBottom: 8 }} /><div>{reconError}</div>
              </div>
            ) : reconRows.length === 0 ? (
              <div className="card" style={{ padding: 56, textAlign: 'center' }}>
                <GitCompare size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  {statusFilter === 'all' && methodFilter === 'all'
                    ? 'Транзакцій за цей місяць ще немає'
                    : 'Немає результатів за вибраними фільтрами'}
                </div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 16 }}>
                  Транзакції з'являються коли в системі є вхідні операції (income) зі статусом completed.
                </div>
                {statusFilter === 'all' && methodFilter === 'all' && (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Перевір інші місяці:</span>
                    {[1, 2, 3].map(offset => {
                      const d = new Date();
                      d.setMonth(d.getMonth() - offset);
                      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                      return (
                        <button key={m} onClick={() => setMonth(m)}
                          style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer' }}>
                          {m}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Гість / Компанія</th>
                      <th>Об&apos;єкт</th>
                      <th>Сума операції</th>
                      <th>Метод</th>
                      <th>Звірка</th>
                      <th>Фактура</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconRows
                      .filter(row => {
                        if (!nameFilter.trim()) return true;
                        const q = nameFilter.toLowerCase();
                        const name = (row.guest_name || '').toLowerCase();
                        const company = (row.invoice_company_name || '').toLowerCase();
                        const comment = (row.comment || '').toLowerCase();
                        return name.includes(q) || company.includes(q) || comment.includes(q);
                      })
                      .map((row) => {
                      const displayName = extractDisplayName(row);
                      // For OTA rows, show sub-source (airbnb/booking_com) badge in method column
                      const srcBadge = row.source ? SOURCE_BADGE[row.source] : null;
                      const isOtaImport = row.method === 'booking_platform' && srcBadge;
                      const methodLabel = isOtaImport
                        ? <span style={{ padding: '1px 7px', borderRadius: 10, background: srcBadge!.bg, color: srcBadge!.color, fontWeight: 600, fontSize: 11 }}>{srcBadge!.label}</span>
                        : (METHOD_LABELS[row.method || ''] || row.method || '—');
                      return (
                        <tr key={row.op_id}>
                          {/* Date */}
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 13 }}>
                            {formatDate(row.paid_at)}
                          </td>

                          {/* Guest / Company */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 500 }}>{displayName}</span>
                              {srcBadge && !row.guest_name && (
                                <span style={{ padding: '1px 5px', borderRadius: 8, background: srcBadge.bg, color: srcBadge.color, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                                  {srcBadge.label}
                                </span>
                              )}
                            </div>
                            {row.comment && !isOtaImport && (
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}
                                title={row.comment}>
                                {row.comment.length > 45 ? row.comment.slice(0, 45) + '…' : row.comment}
                              </div>
                            )}
                            {isOtaImport && row.comment && (
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }} title={row.comment}>
                                {/* Show listing/dates part after the guest name */}
                                {row.comment.replace(/^(?:Airbnb|Booking\.com):[^,]+/, '').replace(/^,\s*/, '').slice(0, 50)}
                              </div>
                            )}
                          </td>

                          {/* Unit */}
                          <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                            {row.unit_name || (isOtaImport ? <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>OTA</span> : '—')}
                          </td>

                          {/* Amount */}
                          <td>
                            <span style={{ fontWeight: 700 }}>
                              {formatAmount(row.op_amount, row.currency)}
                            </span>
                            {row.recon_status === 'mismatch' && row.invoice_amount != null && (
                              <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>
                                ≠ Фактура: {formatAmount(row.invoice_amount, row.currency)}
                              </div>
                            )}
                          </td>

                          {/* Method */}
                          <td style={{ fontSize: 13 }}>{methodLabel}</td>

                          {/* Reconciliation status */}
                          <td><ReconBadge status={row.recon_status} /></td>

                          {/* Invoice */}
                          <td>
                            {row.invoice_id ? (
                              <code style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-primary)' }}>
                                {row.invoice_number}
                              </code>
                            ) : (
                              <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              {row.invoice_id && (
                                <>
                                  <button
                                    className="btn btn-sm btn-ghost btn-icon"
                                    title="Переглянути фактуру"
                                    onClick={() => openInvoice(row.invoice_id!)}
                                  >
                                    <Eye size={13} />
                                  </button>
                                  <button
                                    className="btn btn-sm btn-ghost btn-icon"
                                    title="Завантажити HTML"
                                    onClick={() => downloadInvoice(row.invoice_id!, row.invoice_number!)}
                                  >
                                    <Download size={13} />
                                  </button>
                                  <button
                                    className="btn btn-sm btn-ghost btn-icon"
                                    title="Завантажити ISDOC"
                                    onClick={() => downloadIsdoc(row.invoice_id!, row.invoice_number!)}
                                  >
                                    <FileCode size={13} />
                                  </button>
                                  {(row.guest_email || row.invoice_company_email) && (
                                    <button
                                      className="btn btn-sm btn-ghost btn-icon"
                                      title={`Надіслати фактуру на email`}
                                      onClick={() => openEmailPopover(row)}
                                    >
                                      <Mail size={13} />
                                    </button>
                                  )}
                                </>
                              )}
                              {row.recon_status === 'missing' && row.reservation_id && (
                                <button
                                  className="btn btn-sm btn-primary"
                                  style={{ fontSize: 12, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                                  title="Створити фактуру"
                                  disabled={creatingFor === row.reservation_id}
                                  onClick={() => createInvoice(row.reservation_id!)}
                                >
                                  {creatingFor === row.reservation_id
                                    ? <RefreshCw size={12} className="spin" />
                                    : <Plus size={12} />
                                  }
                                  Фактура
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ─── Footer note ──────────────────────────────────── */}
            {reconRows.length > 0 && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(79,110,247,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Журнал звірки</strong> показує вхідні операції (fin_operations) за обраний місяць та їх зв&apos;язок з фактурами.
                Кнопки картки «Без фактури» та «Розбіжність» фільтрують рядки що потребують уваги.
              </div>
            )}
          </>
        )}

      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      {/* ── Email Popover ────────────────────────────────────────── */}
      {emailPopover && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={(e) => { if (e.target === e.currentTarget) setEmailPopover(null); }}>
          <div style={{
            background: 'var(--surface-elevated)', borderRadius: 12, padding: 28,
            width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Mail size={20} style={{ color: '#4f6ef7' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Надіслати фактуру</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{emailPopover.invoiceNumber}</div>
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Email отримувача</label>
            <input
              type="email"
              className="form-input"
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
              placeholder="guest@example.com"
              style={{ width: '100%', marginBottom: 20 }}
              onKeyDown={e => { if (e.key === 'Enter') sendInvoiceEmail(); }}
              autoFocus
            />

            {emailPopover.defaultEmail && emailTo !== emailPopover.defaultEmail && (
              <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
                Стандартний email гостя:{' '}
                <button onClick={() => setEmailTo(emailPopover.defaultEmail)}
                  style={{ background: 'none', border: 'none', color: '#4f6ef7', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>
                  {emailPopover.defaultEmail}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEmailPopover(null)}>Скасувати</button>
              <button
                className="btn btn-primary"
                disabled={!emailTo.trim() || emailSending}
                onClick={sendInvoiceEmail}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {emailSending ? <RefreshCw size={14} className="spin" /> : <Mail size={14} />}
                {emailSending ? 'Надсилаємо…' : 'Надіслати'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notification ────────────────────────────────── */}
      {emailToast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          padding: '12px 20px', borderRadius: 10,
          background: emailToast.startsWith('✅') ? '#1a2e1a' : '#2e1a1a',
          border: `1px solid ${emailToast.startsWith('✅') ? '#22c55e' : '#ef4444'}`,
          color: '#fff', fontSize: 14, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {emailToast}
        </div>
      )}

        {/* ════════════════ MODAL: ВІЛЬНА ФАКТУРА ════════════════ */}
        {showCustomModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            background: 'rgba(0,0,0,0.65)', display: 'flex',
            alignItems: 'flex-start', justifyContent: 'center',
            padding: '24px 16px', overflowY: 'auto',
          }} onClick={e => { if (e.target === e.currentTarget) setShowCustomModal(false); }}>
            <div style={{
              background: 'var(--surface-elevated)', borderRadius: 16, width: '100%', maxWidth: 700,
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)', border: '1px solid var(--border)', overflow: 'hidden',
            }}>
              <div style={{
                background: 'linear-gradient(135deg,#1a1d2e 0%,#252842 100%)',
                padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>✦ Kemp Carlsbad s.r.o.</div>
                  <div style={{ color: '#6ee7b7', fontSize: 12, marginTop: 2 }}>Нова вільна фактура</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>FAKTURA</div>
                  <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>Номер буде призначено автоматично</div>
                </div>
                <button onClick={() => setShowCustomModal(false)} style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
                  color: '#fff', cursor: 'pointer', padding: '6px 10px', marginLeft: 16,
                }}>✕</button>
              </div>
              <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Dodavatel / Odběratel preview */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
                  padding: '14px 16px', background: 'var(--surface)',
                  borderRadius: 10, border: '1px solid var(--border)', fontSize: 12,
                }}>
                  <div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginBottom: 4 }}>Dodavatel</div>
                    <div style={{ fontWeight: 700 }}>Kemp Carlsbad s.r.o.</div>
                    <div style={{ color: 'var(--text-secondary)' }}>Chebská 38/5, 360 06 Karlovy Vary</div>
                    <div style={{ color: 'var(--text-secondary)' }}>IČO: 23430567 · kemp-carlsbad@email.cz</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginBottom: 4 }}>Odběratel</div>
                    {customForm.showBuyer && customForm.buyerName
                      ? <>
                          <div style={{ fontWeight: 600 }}>{customForm.buyerName}</div>
                          {customForm.buyerIco && <div style={{ color: 'var(--text-secondary)' }}>IČO: {customForm.buyerIco}</div>}
                          {customForm.buyerCity && <div style={{ color: 'var(--text-secondary)' }}>{customForm.buyerCity}</div>}
                        </>
                      : <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>— (анонімна фактура)</div>
                    }
                  </div>
                </div>
                {/* Description */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Призначення фактури *</label>
                  <select className="form-select" value={customForm.description}
                    onChange={e => setCustomForm(f => ({ ...f, description: e.target.value }))}
                    style={{ width: '100%', marginBottom: 8 }}>
                    {DESCRIPTION_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {customForm.description === 'Jiné (zadat ručně)' && (
                    <input type="text" className="form-input" placeholder="Введіть опис фактури..."
                      value={customForm.descCustom}
                      onChange={e => setCustomForm(f => ({ ...f, descCustom: e.target.value }))}
                      style={{ width: '100%' }} />
                  )}
                </div>
                {/* Amount + Currency + Payment */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Сума *</label>
                    <input type="number" min="0" step="0.01" className="form-input" placeholder="0.00"
                      value={customForm.amount}
                      onChange={e => setCustomForm(f => ({ ...f, amount: e.target.value }))}
                      style={{ width: '100%', fontSize: 18, fontWeight: 700 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Валюта</label>
                    <select className="form-select" value={customForm.currency}
                      onChange={e => setCustomForm(f => ({ ...f, currency: e.target.value }))}>
                      <option>CZK</option><option>EUR</option><option>USD</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Форма оплати</label>
                    <select className="form-select" value={customForm.paymentMethod}
                      onChange={e => setCustomForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                      <option>Příkazem</option><option>Hotovost</option><option>Kartou</option><option>Online</option>
                    </select>
                  </div>
                </div>
                {/* Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Дата виставлення</label>
                    <input type="date" className="form-input" value={new Date().toISOString().slice(0, 10)}
                      readOnly style={{ width: '100%', opacity: 0.7 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Термін оплати</label>
                    <input type="date" className="form-input"
                      value={customForm.dueDate || (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); })()}
                      onChange={e => setCustomForm(f => ({ ...f, dueDate: e.target.value }))}
                      style={{ width: '100%' }} />
                  </div>
                </div>
                {/* Buyer optional */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <button onClick={() => setCustomForm(f => ({ ...f, showBuyer: !f.showBuyer }))}
                    style={{
                      width: '100%', padding: '10px 14px', background: 'var(--surface)',
                      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
                    }}>
                    <Building2 size={14} />
                    {customForm.showBuyer ? '▼' : '▶'} Вказати отримувача (Odběratel) — опціонально
                  </button>
                  {customForm.showBuyer && (
                    <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {([
                        ['buyerName', 'Назва / ПІБ', '1 / span 2'],
                        ['buyerIco', 'IČO', ''],
                        ['buyerDic', 'DIČ', ''],
                        ['buyerAddress', 'Адреса', '1 / span 2'],
                        ['buyerCity', 'Місто / PSČ', '1 / span 2'],
                      ] as [keyof typeof customForm, string, string][]).map(([field, label, span]) => (
                        <div key={field} style={span ? { gridColumn: span } : {}}>
                          <label style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, display: 'block' }}>{label}</label>
                          <input type="text" className="form-input"
                            value={customForm[field] as string}
                            onChange={e => setCustomForm(f => ({ ...f, [field]: e.target.value }))}
                            style={{ width: '100%', fontSize: 13 }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Email */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    <Mail size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                    Надіслати PDF на email (необов'язково)
                  </label>
                  <input type="email" className="form-input" placeholder="guest@example.com"
                    value={customForm.emailTo}
                    onChange={e => setCustomForm(f => ({ ...f, emailTo: e.target.value }))}
                    style={{ width: '100%' }} />
                </div>
                {/* Amount preview */}
                {customForm.amount && parseFloat(customForm.amount) > 0 && (
                  <div style={{
                    padding: '12px 16px', borderRadius: 8,
                    background: 'rgba(110,231,183,0.08)', border: '1px solid rgba(110,231,183,0.25)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: '60%' }}>
                      {customForm.description === 'Jiné (zadat ručně)' ? customForm.descCustom : customForm.description}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#6ee7b7' }}>
                      {new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2 }).format(parseFloat(customForm.amount))} {customForm.currency}
                    </div>
                  </div>
                )}
                {/* Toast */}
                {customToast && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: customToast.startsWith('✅') ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${customToast.startsWith('✅') ? '#22c55e' : '#ef4444'}`,
                    color: customToast.startsWith('✅') ? '#22c55e' : '#ef4444',
                  }}>{customToast}</div>
                )}
                {/* Buttons */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                  <button className="btn btn-ghost" onClick={() => setShowCustomModal(false)} disabled={customGenerating}>Скасувати</button>
                  <button className="btn btn-secondary" onClick={() => handleGenerateCustom(false)} disabled={customGenerating}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {customGenerating ? <Loader2 size={14} className="spin" /> : <FileDown size={14} />}
                    Згенерувати PDF
                  </button>
                  <button className="btn btn-primary" onClick={() => handleGenerateCustom(true)}
                    disabled={customGenerating || !customForm.emailTo.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {customGenerating ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                    PDF + Надіслати
                  </button>
                </div>
              </div>
              <div style={{
                padding: '10px 28px', background: 'var(--surface)',
                borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-tertiary)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <CheckCircle size={11} style={{ color: '#22c55e', flexShrink: 0 }} />
                Фактура збережеться в системі та потрапить до ISDOC-виписки для бухгалтера
              </div>
            </div>
          </div>
        )}
    </>
  );
}
