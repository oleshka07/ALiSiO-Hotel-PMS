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

interface StmtInvoice {
  source_ref: string;
  invoice_id: string;
  invoice_number: string;
  guest_name: string;
  needs_guest_name: boolean;
  description: string;
  amount: number;
  currency: string;
  date: string;
  created: boolean;
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

// (Reconciliation config removed — using Statements tab instead)

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const onMenuClick = useMobileMenu();
  const searchParams = useSearchParams();

  // Read initial values from URL params (?tab=reconciliation&month=2026-05)
  const urlTab = searchParams.get('tab');
  const urlMonth = searchParams.get('month');
  const validMonth = (m: string | null) => m && /^\d{4}-\d{2}$/.test(m) ? m : null;

  const [activeTab, setActiveTab] = useState<'invoices' | 'statements'>(
    urlTab === 'statements' ? 'statements' : 'invoices'
  );

  // ── Invoices tab state ────────────────────────────────────────
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError]   = useState<string | null>(null);

  // ── Statements tab state ──────────────────────────────────────
  const [stmtLoading, setStmtLoading] = useState(false);
  const [stmtError,   setStmtError]   = useState<string | null>(null);
  const [stmtResult,  setStmtResult]  = useState<StmtInvoice[] | null>(null);
  const [stmtChannel, setStmtChannel] = useState<string | null>(null);
  // Inline name editing for Teya rows with amount >= 10 000 CZK
  const [stmtNames,   setStmtNames]   = useState<Record<string, string>>({});
  const [stmtSaving,  setStmtSaving]  = useState<Record<string, boolean>>({});

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
      setTimeout(() => { fetchInvoices(); }, 1000);
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

  // ── Open email popover (for invoice list) ────────────────────
  const openEmailPopover = useCallback((invoiceId: string, invoiceNumber: string, defaultEmail: string) => {
    setEmailTo(defaultEmail);
    setEmailPopover({ invoiceId, invoiceNumber, defaultEmail });
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

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // ── Actions ───────────────────────────────────────────────────
  const openInvoice     = (id: string)   => window.open(`/api/invoices/${id}`, '_blank');
  const downloadInvoice = (id: string, num: string) => {
    const a = document.createElement('a');
    a.href = `/api/invoices/${id}?format=download`;
    a.download = `faktura-${num}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadPdf = (id: string, num: string) => {
    const a = document.createElement('a');
    a.href = `/api/invoices/${id}/pdf`;
    a.download = `faktura-${num}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── Upload CSV → create invoices (no fin_operations) ─────────
  const uploadForInvoices = async (channel: string, file: File) => {
    setStmtLoading(true);
    setStmtError(null);
    setStmtResult(null);
    setStmtChannel(channel);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('channel', channel);
      const res = await fetch('/api/accounting/invoice-batch', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка завантаження');
      setStmtResult(data.invoices ?? []);
    } catch (e: unknown) {
      setStmtError(e instanceof Error ? e.message : String(e));
    } finally {
      setStmtLoading(false);
    }
  };

  const downloadAllIsdoc = (ids: string[], _channel: string) => {
    // Download each ISDOC with slight delay to avoid browser blocking
    ids.forEach((id, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = `/api/invoices/${id}/isdoc`;
        a.click();
      }, i * 200);
    });
  };

  // ── Save buyer name for large Teya transactions (>= 10 000 CZK) ──────────
  const saveBuyerName = async (invoiceId: string, name: string) => {
    if (!name.trim()) return;
    setStmtSaving(s => ({ ...s, [invoiceId]: true }));
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/buyer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      // Update local result so the row reflects the saved name immediately
      setStmtResult(prev => prev ? prev.map(r =>
        r.invoice_id === invoiceId
          ? { ...r, guest_name: name.trim(), needs_guest_name: false }
          : r
      ) : prev);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setStmtSaving(s => ({ ...s, [invoiceId]: false }));
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
              onClick={fetchInvoices}
              disabled={invLoading}
            >
              <RefreshCw size={14} className={invLoading ? 'spin' : ''} />
              Оновити
            </button>
          </div>
        </div>

        {/* ─── Tab Bar ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border-primary)' }}>
          {([
            { key: 'invoices',   label: '📄 Фактури',  count: invoices.filter(i => i.status === 'issued').length },
            { key: 'statements', label: '📊 Виписки',  count: stmtResult ? stmtResult.length : undefined },
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
                  background: 'rgba(79,110,247,0.15)',
                  color: 'var(--accent-primary)',
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
            TAB: STATEMENTS — Airbnb / Booking / Teya CSV → Invoices
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'statements' && (
          <>
            {/* Info banner */}
            <div style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, fontSize: 13, color: 'var(--text-secondary)' }}>
              <AlertCircle size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
              <span>
                Завантажте CSV-виписку з <strong>Airbnb</strong>, <strong>Booking.com</strong> або <strong>Teya</strong>.
                Для кожної транзакції буде автоматично створено фактуру (<strong>PDF + ISDOC</strong>) — без запису в журнал операцій.
              </span>
            </div>

            {/* Upload cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
              {([
                { channel: 'airbnb',  label: 'Airbnb',       color: '#FF5A5F', emoji: '🏠', hint: 'Airbnb → Фінанси → Виписка виплат (CSV)' },
                { channel: 'booking', label: 'Booking.com',  color: '#003580', emoji: '🏨', hint: 'Booking → Finance → Payments report (CSV)' },
                { channel: 'teya',    label: 'Teya',         color: '#7c3aed', emoji: '💳', hint: 'Teya dashboard → Transaction report (CSV)' },
              ] as const).map(({ channel, label, color, emoji, hint }) => (
                <label key={channel} style={{ display: 'block', cursor: 'pointer' }}>
                  <input type="file" accept=".csv" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadForInvoices(channel, f); e.target.value = ''; }}
                  />
                  <div style={{
                    border: `2px dashed ${stmtLoading && stmtChannel === channel ? color : 'var(--border-primary)'}`,
                    borderRadius: 12, padding: '24px 16px', textAlign: 'center',
                    background: stmtChannel === channel && stmtResult ? `${color}11` : 'var(--surface)',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{emoji}</div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14 }}>{hint}</div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: color, color: '#fff', borderRadius: 6,
                      padding: '7px 16px', fontSize: 12, fontWeight: 600,
                    }}>
                      {stmtLoading && stmtChannel === channel
                        ? <><RefreshCw size={12} className="spin" /> Обробляємо...</>
                        : <><Download size={12} /> Завантажити CSV</>
                      }
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Error */}
            {stmtError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, padding: '12px 16px', color: '#ef4444', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                {stmtError}
              </div>
            )}

            {/* Results */}
            {/* ── Warning panel: rows needing a buyer name ── */}
            {stmtResult && stmtResult.some(r => r.needs_guest_name) && (
              <div style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: 10, padding: '14px 16px', marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700, fontSize: 14, color: '#b45309' }}>
                  <AlertTriangle size={15} />
                  Потребують уточнення імені покупця ({stmtResult.filter(r => r.needs_guest_name).length} рядк. ≥ 10 000 CZK)
                </div>
                <div style={{ fontSize: 12, color: '#92400e', marginBottom: 12 }}>
                  Фактури створені з плейсхолдером «DOPLNIT JMÉNO». Вкажіть ім&apos;я гостя / назву компанії:
                </div>
                {stmtResult.filter(r => r.needs_guest_name).map(inv => (
                  <div key={inv.source_ref} style={{
                    display: 'grid', gridTemplateColumns: '110px 1fr 160px 80px',
                    gap: 8, alignItems: 'center', marginBottom: 6,
                    background: 'rgba(0,0,0,0.04)', borderRadius: 6, padding: '7px 10px',
                  }}>
                    <code style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-primary)' }}>
                      {inv.invoice_number}
                    </code>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{inv.description}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatDate(inv.date)} · {formatAmount(inv.amount, inv.currency)}</div>
                    </div>
                    <input
                      type="text"
                      placeholder="Ім'я гостя / компанія..."
                      value={stmtNames[inv.invoice_id] ?? ''}
                      onChange={e => setStmtNames(n => ({ ...n, [inv.invoice_id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveBuyerName(inv.invoice_id, stmtNames[inv.invoice_id] ?? ''); }}
                      style={{
                        fontSize: 12, padding: '5px 8px', borderRadius: 5,
                        border: '1px solid rgba(245,158,11,0.5)', background: '#fffbeb',
                        color: '#1a1a1a', outline: 'none', width: '100%',
                      }}
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => saveBuyerName(inv.invoice_id, stmtNames[inv.invoice_id] ?? '')}
                      disabled={!stmtNames[inv.invoice_id]?.trim() || !!stmtSaving[inv.invoice_id]}
                      style={{ fontSize: 11, padding: '5px 10px' }}
                    >
                      {stmtSaving[inv.invoice_id] ? <RefreshCw size={11} className="spin" /> : 'Зберегти'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Full results table ── */}
            {stmtResult && stmtResult.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    Фактури: {stmtResult.length}
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 12 }}>
                      ({stmtResult.filter(r => r.created).length} нових)
                    </span>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => downloadAllIsdoc(stmtResult.map(r => r.invoice_id), stmtChannel || '')}
                  >
                    <Package size={14} /> Всі ISDOC
                  </button>
                </div>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Фактура №</th>
                        <th>Покупець / Призначення</th>
                        <th>Дата</th>
                        <th>Сума</th>
                        <th>Статус</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {stmtResult.map((inv) => (
                        <tr key={inv.source_ref} style={inv.needs_guest_name ? { background: 'rgba(245,158,11,0.05)' } : undefined}>
                          <td>
                            <code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: 'var(--accent-primary)' }}>
                              {inv.invoice_number}
                            </code>
                          </td>
                          <td>
                            <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                              {inv.needs_guest_name && <AlertTriangle size={12} color="#f59e0b" />}
                              {inv.needs_guest_name
                                ? <em style={{ color: '#f59e0b', fontStyle: 'normal' }}>DOPLNIT JMÉNO</em>
                                : (inv.guest_name || '—')
                              }
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{inv.description}</div>
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatDate(inv.date)}</td>
                          <td><span style={{ fontWeight: 700, fontSize: 14 }}>{formatAmount(inv.amount, inv.currency)}</span></td>
                          <td>
                            {inv.needs_guest_name
                              ? <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#b45309', fontSize: 10 }}>⚠ Ім&apos;я</span>
                              : inv.created
                                ? <span className="badge badge-success">✓ Нова</span>
                                : <span className="badge" style={{ background: 'rgba(156,163,175,0.15)', color: '#9ca3af' }}>Існуюча</span>
                            }
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-sm btn-ghost btn-icon" title="PDF" onClick={() => downloadPdf(inv.invoice_id, inv.invoice_number)}>
                                <FileDown size={14} />
                              </button>
                              <button className="btn btn-sm btn-ghost btn-icon" title="ISDOC" onClick={() => downloadIsdoc(inv.invoice_id, inv.invoice_number)}>
                                <FileCode size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}


            {stmtResult && stmtResult.length === 0 && (
              <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <AlertCircle size={32} style={{ marginBottom: 12 }} />
                <div>Жодної транзакції не знайдено у файлі</div>
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
            background: 'rgba(15,15,20,0.75)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '20px 16px', overflowY: 'auto',
          }} onClick={e => { if (e.target === e.currentTarget) setShowCustomModal(false); }}>

            {/* ── White invoice-style card ── */}
            <div style={{
              background: '#fff', borderRadius: 4, width: '100%', maxWidth: 680,
              boxShadow: '0 28px 90px rgba(0,0,0,0.55)',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#1a1a1a',
            }}>

              {/* PAPER AREA */}
              <div style={{ padding: '24px 28px' }}>

                {/* ── HEADER ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Kemp Carlsbad s.r.o.</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1565c0' }}>
                    FAKTURA č. <span style={{ fontStyle: 'italic', color: '#999', fontSize: 11 }}>автоматично</span>
                  </div>
                </div>
                <div style={{ borderTop: '0.5px solid #aaa', marginBottom: 0 }} />

                {/* ── MAIN BLOCK: Dodavatel | Variabilní + Odběratel ── */}
                <div style={{ border: '0.5px solid #aaa', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  {/* Left — Dodavatel (read-only) */}
                  <div style={{ borderRight: '0.5px solid #aaa', padding: '8px 10px', fontSize: 11 }}>
                    <div style={{ fontSize: 9, color: '#888', marginBottom: 3 }}>Dodavatel:</div>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>Kemp Carlsbad s.r.o.</div>
                    <div>Chebská 38/5</div>
                    <div style={{ marginBottom: 8 }}>360 06 Karlovy Vary</div>
                    <div style={{ color: '#1565c0' }}>IČ: 23430567</div>
                    <div style={{ color: '#1565c0' }}>DIČ: CZ23430567</div>
                    <div>Mobil: 723565616</div>
                    <div>E-mail: kemp-carlsbad@email.cz</div>
                  </div>
                  {/* Right — Variabilní + Odběratel box */}
                  <div style={{ padding: '8px 10px', fontSize: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: '#555' }}>Variabilní symbol:</span>
                      <span style={{ color: '#999', fontStyle: 'italic', fontSize: 10 }}>автоматично</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: '#555' }}>Konstantní symbol:</span>
                      <span>0308</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: '#555' }}>Objednávka č.:</span>
                      <span style={{ color: '#888', fontSize: 10 }}>ze dne:</span>
                    </div>
                    {/* Odběratel sub-box with editable fields */}
                    <div style={{ border: '0.5px solid #aaa', padding: '6px 8px' }}>
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 5 }}>Odběratel: <span style={{ color: '#4f6ef7' }}>(необов'язково)</span></div>
                      <input type="text" value={customForm.buyerName}
                        onChange={e => setCustomForm(f => ({ ...f, buyerName: e.target.value, showBuyer: !!e.target.value }))}
                        placeholder="Назва компанії або ПІБ..."
                        style={{ width: '100%', border: 'none', borderBottom: '1px dashed #4f6ef7', background: 'transparent', fontSize: 12, fontWeight: 700, padding: '2px 0', marginBottom: 5, outline: 'none', color: '#1a1a1a', fontFamily: 'inherit' }}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
                        <input type="text" value={customForm.buyerIco} onChange={e => setCustomForm(f => ({ ...f, buyerIco: e.target.value }))}
                          placeholder="IČO" style={{ border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: '1px 0', outline: 'none', color: '#1a1a1a', fontFamily: 'inherit', width: '100%' }} />
                        <input type="text" value={customForm.buyerDic} onChange={e => setCustomForm(f => ({ ...f, buyerDic: e.target.value }))}
                          placeholder="DIČ" style={{ border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: '1px 0', outline: 'none', color: '#1a1a1a', fontFamily: 'inherit', width: '100%' }} />
                      </div>
                      <input type="text" value={customForm.buyerAddress} onChange={e => setCustomForm(f => ({ ...f, buyerAddress: e.target.value }))}
                        placeholder="Адреса" style={{ border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: '1px 0', marginBottom: 4, outline: 'none', color: '#1a1a1a', fontFamily: 'inherit', width: '100%', display: 'block' }} />
                      <input type="text" value={customForm.buyerCity} onChange={e => setCustomForm(f => ({ ...f, buyerCity: e.target.value }))}
                        placeholder="Місто, PSČ" style={{ border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: '1px 0', outline: 'none', color: '#1a1a1a', fontFamily: 'inherit', width: '100%', display: 'block' }} />
                    </div>
                  </div>
                </div>

                {/* ── BANK BLOCK ── */}
                <div style={{ border: '0.5px solid #aaa', borderTop: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <div style={{ borderRight: '0.5px solid #aaa', padding: '7px 10px', fontSize: 11 }}>
                    {[
                      ['Banka:', 'Komerční banka', true],
                      ['SWIFT:', 'KOMBCZPP', false],
                      ['IBAN:', 'CZ7001000001313569410227', false],
                      ['Číslo účtu:', '131-3569410227  Kód: 0100', false],
                    ].map(([label, val, bold]) => (
                      <div key={String(label)} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                        <span style={{ color: '#888', minWidth: 70 }}>{label}</span>
                        <span style={{ fontWeight: bold ? 700 : 400 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '7px 10px' }}>
                    <div style={{ fontSize: 9, color: '#888' }}>Konečný příjemce:</div>
                  </div>
                </div>

                {/* ── DATES ── */}
                <div style={{ padding: '10px 0', borderBottom: '0.5px solid #aaa', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start' }}>
                  <div style={{ fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ minWidth: 128 }}>Datum vystavení:</span>
                      <span style={{ border: '0.5px solid #aaa', padding: '2px 6px', fontWeight: 700 }}>
                        {new Date().toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\s/g, '')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ minWidth: 128 }}>Datum splatnosti:</span>
                      <input type="date"
                        value={customForm.dueDate || (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); })()}
                        onChange={e => setCustomForm(f => ({ ...f, dueDate: e.target.value }))}
                        style={{ border: '0.5px solid #4f6ef7', padding: '2px 4px', fontSize: 11, fontWeight: 700, outline: 'none', background: 'rgba(79,110,247,0.05)', fontFamily: 'inherit' }}
                      />
                    </div>
                    <div style={{ marginBottom: 5 }}>Firma není plátce DPH.</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ minWidth: 128 }}>Forma úhrady:</span>
                      <select value={customForm.paymentMethod} onChange={e => setCustomForm(f => ({ ...f, paymentMethod: e.target.value }))}
                        style={{ border: '0.5px solid #4f6ef7', padding: '2px 6px', fontSize: 11, fontWeight: 700, outline: 'none', background: 'rgba(79,110,247,0.05)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <option>Příkazem</option><option>Hotovost</option><option>Kartou</option><option>Online</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: '#888', paddingTop: 2 }}>Konečný příjemce:</div>
                </div>

                {/* ── TABLE ── */}
                <div style={{ marginTop: 4 }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 100px 46px 100px', background: '#f0f0f0', border: '0.5px solid #aaa', padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#555' }}>
                    <span>Označení dodávky</span>
                    <span style={{ textAlign: 'right' }}>Množství</span>
                    <span style={{ textAlign: 'right' }}>J.cena</span>
                    <span style={{ textAlign: 'right' }}>Sleva</span>
                    <span style={{ textAlign: 'right' }}>Kč Celkem</span>
                  </div>
                  {/* Editable row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 100px 46px 100px', border: '0.5px solid #ddd', borderTop: 'none', padding: '6px', gap: 4, alignItems: 'center' }}>
                    <div>
                      <select value={customForm.description} onChange={e => setCustomForm(f => ({ ...f, description: e.target.value }))}
                        style={{ width: '100%', fontSize: 11, border: '1px dashed #4f6ef7', background: 'rgba(79,110,247,0.04)', padding: '3px 5px', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                        {DESCRIPTION_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      {customForm.description === 'Jiné (zadat ručně)' && (
                        <input type="text" placeholder="Введіть опис..." value={customForm.descCustom}
                          onChange={e => setCustomForm(f => ({ ...f, descCustom: e.target.value }))}
                          style={{ width: '100%', fontSize: 11, border: '1px solid #4f6ef7', padding: '3px 5px', marginTop: 3, outline: 'none', fontFamily: 'inherit' }} />
                      )}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 11 }}>1</div>
                    <input type="number" min="0" step="0.01" value={customForm.amount}
                      onChange={e => setCustomForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0,00"
                      style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, border: '1px dashed #4f6ef7', background: 'rgba(79,110,247,0.04)', padding: '3px 5px', outline: 'none', fontFamily: 'inherit', width: '100%' }}
                    />
                    <div style={{ textAlign: 'right', fontSize: 11, color: '#888' }}>—</div>
                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: customForm.amount && parseFloat(customForm.amount) > 0 ? '#1a1a1a' : '#aaa' }}>
                      {customForm.amount && parseFloat(customForm.amount) > 0
                        ? new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2 }).format(parseFloat(customForm.amount))
                        : '0,00'}
                    </div>
                  </div>
                </div>

                {/* ── TOTALS ── */}
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555', marginBottom: 5 }}>
                    <span>Součet položek</span>
                    <span>{customForm.amount && parseFloat(customForm.amount) > 0
                      ? new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2 }).format(parseFloat(customForm.amount))
                      : '0,00'} {customForm.currency}
                    </span>
                  </div>
                  <div style={{ borderTop: '0.5px solid #aaa', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                    <span>CELKEM K ÚHRADĚ</span>
                    <span style={{ fontSize: 15 }}>
                      {customForm.amount && parseFloat(customForm.amount) > 0
                        ? new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2 }).format(parseFloat(customForm.amount))
                        : '0,00'} {customForm.currency}
                    </span>
                  </div>
                </div>

                {/* Nejsme plátci */}
                <div style={{ marginTop: 10, fontSize: 12, color: '#1565c0', fontWeight: 700 }}>Nejsme plátci DPH</div>
              </div>

              {/* ── ACTION FOOTER (outside paper) ── */}
              <div style={{ borderTop: '1px solid #e5e7eb', padding: '16px 28px', background: '#f8f9fb', borderRadius: '0 0 4px 4px' }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: '#555', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                    <Mail size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                    Надіслати PDF на email (необов'язково)
                  </label>
                  <input type="email" className="form-input" placeholder="guest@example.com"
                    value={customForm.emailTo}
                    onChange={e => setCustomForm(f => ({ ...f, emailTo: e.target.value }))}
                    style={{ width: '100%' }} />
                </div>
                {customToast && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, marginBottom: 10,
                    background: customToast.startsWith('✅') ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${customToast.startsWith('✅') ? '#22c55e' : '#ef4444'}`,
                    color: customToast.startsWith('✅') ? '#22c55e' : '#ef4444',
                  }}>{customToast}</div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
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
            </div>
          </div>
        )}
    </>
  );
}
