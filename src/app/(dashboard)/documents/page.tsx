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
  Sparkles, Send, Building2, FileDown, Loader2, Search, Trash2,
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

// Unified invoice (all sources: PMS + batch + manual)
interface AllInvoice {
  id: string;
  invoice_number: string;
  issued_at: string;
  due_date?: string;
  amount: number;
  currency: string;
  status: 'issued' | 'cancelled';
  is_credit_note: number;  // 0 | 1
  source: 'airbnb' | 'booking' | 'teya' | 'manual' | 'pms';
  buyer_name: string | null;
  custom_description: string | null;
  unit_name: string | null;
}

interface StmtInvoice {
  source_ref: string;
  invoice_id: string;
  invoice_number: string;
  guest_name: string;
  needs_guest_name: boolean;
  is_credit_note: boolean;
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

  // ── Period locking (per series) ───────────────────────────────
  const [lockMonth, setLockMonth] = useState<string>(validMonth(urlMonth) || new Date().toISOString().slice(0, 7));
  const [lockSeries, setLockSeries] = useState<string>('HOUSE');
  const [lockMsg, setLockMsg] = useState<string | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  async function lockPeriodAction(action: 'lock' | 'unlock') {
    setLockBusy(true);
    setLockMsg(null);
    try {
      const res = await fetch('/api/accounting/lock-period', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series: lockSeries, month: lockMonth, action }),
      });
      const j = await res.json();
      if (!res.ok) setLockMsg(`❌ ${j.error || 'Помилка'}`);
      else setLockMsg(`✅ ${lockSeries} ${lockMonth} → ${j.status === 'locked' ? 'заблоковано' : 'відкрито'}`);
    } catch (e: any) { setLockMsg(`❌ ${e.message}`); }
    setLockBusy(false);
  }

  // ── Invoices tab state ────────────────────────────────────────
  const [invoices,    setInvoices]   = useState<Invoice[]>([]);
  const [invLoading,  setInvLoading] = useState(true);
  const [invError,    setInvError]   = useState<string | null>(null);

  // ── All-invoices tab state ────────────────────────────────────────
  const [allInvoices,      setAllInvoices]      = useState<AllInvoice[]>([]);
  const [allInvLoading,    setAllInvLoading]    = useState(false);
  const [allInvError,      setAllInvError]      = useState<string | null>(null);
  const [invSearch,        setInvSearch]        = useState('');
  const [invDateFrom,      setInvDateFrom]      = useState('');
  const [invDateTo,        setInvDateTo]        = useState('');
  const [invSourceFilter,  setInvSourceFilter]  = useState<'all' | 'airbnb' | 'booking' | 'teya' | 'manual' | 'pms'>('all');
  // Multi-source selection (checkboxes) for combined view + ZIP export.
  const ALL_SOURCE_KEYS = ['airbnb', 'booking', 'teya', 'manual', 'pms'] as const;
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set(ALL_SOURCE_KEYS));
  const toggleSource = (key: string) => setSelectedSources(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // Pick a whole month with one click → sets the from/to range.
  const applyMonth = (m: string) => {
    if (!/^\d{4}-\d{2}$/.test(m)) { setInvDateFrom(''); setInvDateTo(''); return; }
    const [y, mo] = m.split('-').map(Number);
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    setInvDateFrom(`${m}-01`);
    setInvDateTo(`${m}-${String(last).padStart(2, '0')}`);
  };
  const currentMonthValue = (invDateFrom && /^\d{4}-\d{2}-01$/.test(invDateFrom)) ? invDateFrom.slice(0, 7) : '';

  // ── Statements tab state ──────────────────────────────────────
  const [stmtLoading, setStmtLoading] = useState(false);
  const [stmtError,   setStmtError]   = useState<string | null>(null);
  const [stmtResult,  setStmtResult]  = useState<StmtInvoice[] | null>(null);
  const [stmtChannel, setStmtChannel] = useState<string | null>(null);
  const [stmtFilter,  setStmtFilter]  = useState<'all' | 'new' | 'existing' | 'storno'>('all');
  // Inline name editing for Teya rows with amount >= 10 000 CZK
  const [stmtNames,   setStmtNames]   = useState<Record<string, string>>({});
  const [stmtSaving,  setStmtSaving]  = useState<Record<string, boolean>>({});

  // ── Derived: filtered statement results ──────────────────────────
  const filteredResult: StmtInvoice[] = stmtResult
    ? stmtResult.filter(r => {
        if (stmtFilter === 'new')      return r.created && !r.is_credit_note;
        if (stmtFilter === 'existing') return !r.created && !r.is_credit_note;
        if (stmtFilter === 'storno')   return r.is_credit_note;
        return true;
      })
    : [];
  const stmtCountNew      = stmtResult ? stmtResult.filter(r => r.created && !r.is_credit_note).length : 0;
  const stmtCountExisting = stmtResult ? stmtResult.filter(r => !r.created && !r.is_credit_note).length : 0;
  const stmtCountStorno   = stmtResult ? stmtResult.filter(r => r.is_credit_note).length : 0;



  // ── Email popover state ───────────────────────────────────────
  const [emailPopover, setEmailPopover] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    defaultEmail: string;
  } | null>(null);
  const [emailTo, setEmailTo]         = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailToast, setEmailToast]   = useState<string | null>(null);

  // ── Delete confirmation state ──────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; number: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteInvoice = async (id: string) => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
      // 404 = already deleted (e.g. a second click) — treat as success so the
      // row leaves the screen instead of throwing.
      if (!res.ok && res.status !== 404) throw new Error((await res.json()).error || 'Error');
      setDeleteConfirm(null);
      // Refresh both lists
      fetchInvoices();
      fetchAllInvoices(invSourceFilter, invSearch, invDateFrom, invDateTo);
      // Also drop it from the import-result table (stmtResult) — that view renders
      // from POST-response state, not a live fetch, so without this the deleted
      // row lingers and looks like it "won't delete".
      setStmtResult(prev => prev ? prev.filter(r => r.invoice_id !== id) : prev);
    } catch (e: unknown) {
      alert('Помилка видалення: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Batch Delete State & Handler ───────────────────────────────────────────
  const [batchDeleteChannel, setBatchDeleteChannel] = useState<'airbnb' | 'booking' | 'teya' | 'all'>('airbnb');
  const [batchDeleteMonth, setBatchDeleteMonth] = useState<string>(''); // YYYY-MM
  const [batchDeleteLoading, setBatchDeleteLoading] = useState<boolean>(false);
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);
  const [batchDeleteSuccess, setBatchDeleteSuccess] = useState<string | null>(null);

  const handleClearBatchInvoices = async () => {
    const channelLabel = batchDeleteChannel === 'all' ? 'всіх каналів' : batchDeleteChannel;
    const periodLabel = batchDeleteMonth ? `за період ${batchDeleteMonth}` : 'за весь час';
    if (!window.confirm(`Ви впевнені, що хочете видалити імпортовані фактури для ${channelLabel} ${periodLabel}? Цю дію неможливо скасувати!`)) {
      return;
    }
    setBatchDeleteLoading(true);
    setBatchDeleteError(null);
    setBatchDeleteSuccess(null);
    try {
      const query = new URLSearchParams();
      query.set('channel', batchDeleteChannel);
      if (batchDeleteMonth) query.set('month', batchDeleteMonth);
      
      let res = await fetch(`/api/accounting/invoice-batch?${query.toString()}`, { method: 'DELETE' });
      let data = await res.json();
      
      if (!res.ok) {
        if (data.requiresForce) {
          if (window.confirm(`${data.error}\n\nБажаєте видалити заблоковані фактури примусово (force)?`)) {
            query.set('force', 'true');
            res = await fetch(`/api/accounting/invoice-batch?${query.toString()}`, { method: 'DELETE' });
            data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Помилка видалення');
          } else {
            return;
          }
        } else {
          throw new Error(data.error || 'Помилка видалення');
        }
      }
      setBatchDeleteSuccess(data.message || `Фактури успішно видалені.`);
      setStmtResult(null);
      fetchInvoices();
      fetchAllInvoices(invSourceFilter, invSearch, invDateFrom, invDateTo);
    } catch (e: unknown) {
      setBatchDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchDeleteLoading(false);
    }
  };

    // ── Custom Invoice Modal state ────────────────────────────────
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState({
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
  // Multi-item service lines
  type CustomItem = { description: string; descCustom: string; amount: string };
  const [customItems, setCustomItems] = useState<CustomItem[]>([
    { description: 'Krátkodobé ubytování', descCustom: '', amount: '' },
  ]);
  const [customGenerating, setCustomGenerating] = useState(false);
  const [customToast,      setCustomToast]      = useState<string | null>(null);

  const DESCRIPTION_PRESETS = [
    'Krátkodobé ubytování',
    'Záloha na ubytování',
    'Dlouhodobý pronájem',
    'Ubytování skupiny',
    'Wellness & doplňkové služby',
    'Místní poplatek z pobytu (20 Kč / osoba / noc)',
    'Jiné (zadat ručně)',
  ];

  const handleGenerateCustom = async (emailAfter: boolean) => {
    // Validate all items
    const validItems = customItems
      .map(it => ({
        description: it.description === 'Jiné (zadat ručně)' ? it.descCustom.trim() : it.description,
        amount: parseFloat(it.amount),
      }))
      .filter(it => it.description && it.amount > 0);

    if (validItems.length === 0) { setCustomToast('❌ Vkajte aspoň jeden rádek z popisu a sumy'); return; }
    const totalAmt = validItems.reduce((s, i) => s + i.amount, 0);
    if (totalAmt <= 0) { setCustomToast('❌ Suma musí byť väčšia ako 0'); return; }
    if (emailAfter && !customForm.emailTo.trim()) {
      setCustomToast('❌ Вкажіть email для відправки'); return;
    }
    setCustomGenerating(true);
    setCustomToast(null);
    try {
      const defDue = customForm.dueDate || (() => {
        const d = new Date(); d.setDate(d.getDate() + 14);
        return d.toISOString().slice(0, 10);
      })();
      const body: Record<string, unknown> = {
        items:         validItems,
        // Legacy single fields for backward compat
        description:   validItems[0].description,
        amount:        totalAmt,
        currency:      customForm.currency,
        dueDate:       defDue,
        paymentMethod: customForm.paymentMethod,
        action:        'pdf',
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
      const blob = await res.blob();
      const invoiceNum = res.headers.get('X-Invoice-Number') || 'faktura';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `faktura-${invoiceNum}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setCustomToast(emailAfter
        ? `✅ PDF збережено і надіслано на ${customForm.emailTo}`
        : '✅ PDF згенеровано і завантажено');
      setTimeout(() => { fetchInvoices(); fetchAllInvoices(invSourceFilter, invSearch, invDateFrom, invDateTo); }, 1000);
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

  // ── Fetch ALL invoices (unified: batch + PMS + manual) ────────
  const fetchAllInvoices = useCallback(async (source: string, search: string, from: string, to: string) => {
    setAllInvLoading(true);
    setAllInvError(null);
    try {
      const params = new URLSearchParams({ source, search });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/accounting/invoices/list?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      setAllInvoices(await res.json());
    } catch {
      setAllInvError('Не вдалося завантажити фактури');
    } finally {
      setAllInvLoading(false);
    }
  }, []);

  // Auto-fetch when invoices tab is active or filters change
  useEffect(() => {
    if (activeTab === 'invoices') {
      const t = setTimeout(() => fetchAllInvoices(invSourceFilter, invSearch, invDateFrom, invDateTo), 300);
      return () => clearTimeout(t);
    }
  }, [activeTab, invSourceFilter, invSearch, invDateFrom, invDateTo, fetchAllInvoices]);

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
      setStmtFilter('all'); // reset filter on new import
    } catch (e: unknown) {
      setStmtError(e instanceof Error ? e.message : String(e));
    } finally {
      setStmtLoading(false);
    }
  };

  // ── Download ZIP (ISDOC or PDF) ──────────────────────────────────────────
  const [zipLoading, setZipLoading] = useState<'isdoc' | 'pdf' | null>(null);

  const downloadZip = async (
    ids: string[],
    format: 'isdoc' | 'pdf',
    channel: string
  ) => {
    if (ids.length === 0) return;
    setZipLoading(format);
    try {
      const res = await fetch('/api/accounting/invoice-batch/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_ids: ids, format, channel }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const filename = `${today}_${channel}_${format}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setZipLoading(null);
    }
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

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            TAB: INVOICES — All invoices with search + source filter
        â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activeTab === 'invoices' && (() => {
          // Source badge config
          const sourceConfig: Record<string, { label: string; color: string; bg: string }> = {
            airbnb:  { label: 'Airbnb',  color: '#e61e4d', bg: 'rgba(230,30,77,0.1)'   },
            booking: { label: 'Booking', color: '#003580', bg: 'rgba(0,53,128,0.1)'     },
            teya:    { label: 'Teya',    color: '#00a699', bg: 'rgba(0,166,153,0.1)'    },
            manual:  { label: 'Вручну',  color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'  },
            pms:     { label: 'PMS',     color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
          };
          const sourceCheckboxes = [
            { id: 'airbnb',  label: 'Airbnb'  },
            { id: 'booking', label: 'Booking' },
            { id: 'teya',    label: 'Teya'    },
            { id: 'manual',  label: 'Вручну'  },
            { id: 'pms',     label: 'PMS'     },
          ] as const;
          // Client-side filter by the checked sources — drives the table + ZIP export.
          const visibleInvoices = allInvoices.filter(i => selectedSources.has(i.source));
          return (
            <>
              {/* Period lock — freeze a month's numbering per series before the accountant's ISDOC export */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-primary)' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>🔒 Блокування місяця</span>
                <input type="month" value={lockMonth} onChange={e => setLockMonth(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6 }} />
                <select value={lockSeries} onChange={e => setLockSeries(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6 }}>
                  <option value="HOUSE">Готівка/прямі (2026-…)</option>
                  <option value="BKG">Booking (BKG-)</option>
                  <option value="AIR">Airbnb (AIR-)</option>
                  <option value="TEYA">Teya (TEYA-)</option>
                </select>
                <button disabled={lockBusy} onClick={() => { if (confirm(`Заблокувати ${lockSeries} ${lockMonth}? Після цього нумерацію не можна змінювати — лише storno.`)) lockPeriodAction('lock'); }}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: lockBusy ? 'wait' : 'pointer' }}>Заблокувати</button>
                <button disabled={lockBusy} onClick={() => lockPeriodAction('unlock')}
                  style={{ background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Відкрити</button>
                {lockMsg && <span style={{ fontSize: 12 }}>{lockMsg}</span>}
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexBasis: '100%' }}>Бухгалтер вивантажує ISDOC раз на місяць — після блокування нумерація застигає.</span>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                <div className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(79,110,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Receipt size={18} color="var(--accent-primary)" />
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Всього фактур</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{allInvoices.length}</div>
                </div>
                <div className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(230,30,77,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Banknote size={18} color="#e61e4d" />
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Airbnb + Booking + Teya</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>
                    {allInvoices.filter(i => ['airbnb','booking','teya'].includes(i.source)).length}
                  </div>
                </div>
                <div className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={18} color="#dc2626" />
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Storno / Refund</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>
                    {allInvoices.filter(i => i.is_credit_note).length}
                  </div>
                </div>
              </div>

              {/* Search + filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Пошук: ім'я, номер фактури, сума…"
                    value={invSearch}
                    onChange={e => setInvSearch(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      paddingLeft: 32, paddingRight: invSearch ? 28 : 10,
                      paddingTop: 7, paddingBottom: 7,
                      border: '1.5px solid var(--border-primary)',
                      borderRadius: 8, fontSize: 13,
                      background: 'var(--surface)', color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  {invSearch && (
                    <button onClick={() => setInvSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, display: 'flex' }}>
                      <XCircle size={14} />
                    </button>
                  )}
                </div>
                {/* Quick month picker → sets the from/to range */}
                <input
                  type="month"
                  title="Обрати місяць"
                  value={currentMonthValue}
                  onChange={e => applyMonth(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--accent-primary)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontWeight: 600 }}
                />
                {/* Date Filters */}
                <input
                  type="date"
                  title="Від дати"
                  value={invDateFrom}
                  onChange={e => setInvDateFrom(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border-primary)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                />
                <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                <input
                  type="date"
                  title="До дати"
                  value={invDateTo}
                  onChange={e => setInvDateTo(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border-primary)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                />
                {/* CSV Export button */}
                <a
                  href={`/api/invoices/export?source=${invSourceFilter}${invDateFrom ? '&from='+invDateFrom : ''}${invDateTo ? '&to='+invDateTo : ''}`}
                  download
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border-primary)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <Download size={13} /> Скачати CSV
                </a>
                {/* ZIP ISDOC button — exports the checked sources for the selected range */}
                <button
                  onClick={() => downloadZip(visibleInvoices.map(i => i.id), 'isdoc', [...selectedSources].join('+') || 'batch')}
                  disabled={zipLoading === 'isdoc' || visibleInvoices.length === 0}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--accent-primary)', background: 'rgba(79,110,247,0.1)', color: 'var(--accent-primary)', fontSize: 12, fontWeight: 700, cursor: visibleInvoices.length === 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: visibleInvoices.length === 0 ? 0.5 : 1 }}
                >
                  {zipLoading === 'isdoc'
                    ? <><RefreshCw size={13} className="spin" /> Генеруємо ZIP…</>
                    : <><Package size={13} /> ZIP ISDOC ({visibleInvoices.length})</>
                  }
                </button>
              </div>

              {/* Source checkboxes — multi-select for combined view + ZIP export */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Джерела:</span>
                {sourceCheckboxes.map(src => {
                  const checked = selectedSources.has(src.id);
                  const cfg = sourceConfig[src.id as keyof typeof sourceConfig];
                  const color = cfg?.color || 'var(--accent-primary)';
                  return (
                    <button key={src.id} onClick={() => toggleSource(src.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: checked ? `2px solid ${color}` : '2px solid var(--border-primary)', background: checked ? (cfg?.bg || 'rgba(79,110,247,0.1)') : 'transparent', color: checked ? color : 'var(--text-secondary)', fontWeight: checked ? 700 : 400, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                      <span style={{ fontSize: 13 }}>{checked ? '☑' : '☐'}</span>{src.label}
                    </button>
                  );
                })}
                <button onClick={() => setSelectedSources(new Set(ALL_SOURCE_KEYS))} style={{ padding: '4px 10px', borderRadius: 20, border: '1px dashed var(--border-primary)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer' }}>Усі</button>
                {allInvLoading && <RefreshCw size={14} className="spin" style={{ color: 'var(--text-tertiary)' }} />}
              </div>

              {/* Table */}
              {allInvError ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
                  <AlertCircle size={24} style={{ marginBottom: 8 }} /><div>{allInvError}</div>
                </div>
              ) : !allInvLoading && visibleInvoices.length === 0 ? (
                <div className="card" style={{ padding: 56, textAlign: 'center' }}>
                  <Receipt size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                    {invSearch || selectedSources.size < ALL_SOURCE_KEYS.length ? 'Нічого не знайдено' : 'Фактур ще немає'}
                  </div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                    {invSearch ? `За запитом «${invSearch}»` : 'Завантажте виписки у вкладці «Виписки»'}
                  </div>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Фактура №</th>
                        <th>Джерело</th>
                        <th>Покупець / Призначення</th>
                        <th>Сума</th>
                        <th>Дата</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleInvoices.map(inv => {
                        const srcCfg = sourceConfig[inv.source] || sourceConfig.manual;
                        const isCreditNote = !!inv.is_credit_note;
                        return (
                          <tr key={inv.id} style={isCreditNote ? { background: 'rgba(220,38,38,0.04)' } : undefined}>
                            <td>
                              <code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: isCreditNote ? '#dc2626' : 'var(--accent-primary)' }}>
                                {inv.invoice_number}
                              </code>
                              {isCreditNote && <span style={{ marginLeft: 5, fontSize: 10, color: '#dc2626', fontWeight: 700 }}>STORNO</span>}
                            </td>
                             <td
                              style={{ cursor: 'pointer' }}
                              onClick={() => setDeleteConfirm({ id: inv.id, number: inv.invoice_number })}
                              title="Видалити фактуру (прихована опція)"
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: srcCfg.bg, color: srcCfg.color }}>
                                {srcCfg.label}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{inv.buyer_name || '—'}</div>
                              {(inv.custom_description || inv.unit_name) && (
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                                  {inv.custom_description || inv.unit_name}
                                </div>
                              )}
                            </td>
                            <td>
                              <span style={{ fontWeight: 700, fontSize: 14, color: isCreditNote ? '#dc2626' : undefined }}>
                                {formatAmount(inv.amount, inv.currency)}
                              </span>
                            </td>
                            <td
                              style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}
                              onClick={() => setDeleteConfirm({ id: inv.id, number: inv.invoice_number })}
                              title="Видалити фактуру (прихована опція)"
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Calendar size={11} />{formatDate(inv.issued_at)}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button className="btn btn-sm btn-ghost btn-icon" title="PDF" onClick={() => downloadPdf(inv.id, inv.invoice_number)}>
                                  <FileDown size={14} />
                                </button>
                                <button className="btn btn-sm btn-ghost btn-icon" title="ISDOC" onClick={() => downloadIsdoc(inv.id, inv.invoice_number)}>
                                  <FileCode size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        })()}

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
                {/* Toolbar: counts + ZIP buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    Фактури: {stmtResult.length}
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 10 }}>
                      ({stmtCountNew} нових·{stmtCountExisting} існуючих{stmtCountStorno > 0 ? `·${stmtCountStorno} storno` : ''})
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      disabled={zipLoading === 'isdoc' || filteredResult.length === 0}
                      onClick={() => downloadZip(filteredResult.map(r => r.invoice_id), 'isdoc', stmtChannel || 'batch')}
                    >
                      {zipLoading === 'isdoc'
                        ? <><RefreshCw size={13} className="spin" /> Генеруємо…</>
                        : <><Package size={13} /> ZIP ISDOC{stmtFilter !== 'all' ? ` (${filteredResult.length})` : ''}</>
                      }
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      disabled={zipLoading === 'pdf' || filteredResult.length === 0}
                      onClick={() => downloadZip(filteredResult.map(r => r.invoice_id), 'pdf', stmtChannel || 'batch')}
                    >
                      {zipLoading === 'pdf'
                        ? <><RefreshCw size={13} className="spin" /> Генеруємо…</>
                        : <><FileDown size={13} /> ZIP PDF{stmtFilter !== 'all' ? ` (${filteredResult.length})` : ''}</>
                      }
                    </button>
                  </div>
                </div>

                {/* Filter pills */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {(['all', 'new', 'existing', 'storno'] as const)
                    .filter(f => f !== 'storno' || stmtCountStorno > 0)
                    .map(f => {
                      const labels: Record<string, string> = { all: 'Усі', new: '✓ Нові', existing: 'Існуючі', storno: '↩ Storno' };
                      const colors: Record<string, string> = { all: 'var(--accent-primary)', new: '#16a34a', existing: '#6b7280', storno: '#dc2626' };
                      const counts: Record<string, number> = { all: stmtResult.length, new: stmtCountNew, existing: stmtCountExisting, storno: stmtCountStorno };
                      const active = stmtFilter === f;
                      const color = colors[f];
                      return (
                        <button
                          key={f}
                          onClick={() => setStmtFilter(f)}
                          style={{
                            padding: '5px 14px',
                            borderRadius: 20,
                            border: active ? `2px solid ${color}` : '2px solid var(--border-primary)',
                            background: active ? `${color}18` : 'transparent',
                            color: active ? color : 'var(--text-secondary)',
                            fontWeight: active ? 700 : 400,
                            fontSize: 12,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                            transition: 'all 0.15s',
                          }}
                        >
                          {labels[f]}
                          <span style={{
                            background: active ? color : 'var(--border-primary)',
                            color: active ? '#fff' : 'var(--text-tertiary)',
                            borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 700,
                          }}>{counts[f]}</span>
                        </button>
                      );
                    })}
                </div>

                {filteredResult.length === 0
                  ? (
                    <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-tertiary)', fontSize: 14 }}>
                      Немає фактур з обраним фільтром
                    </div>
                  ) : (
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
                      {filteredResult.map((inv) => (
                        <tr key={inv.source_ref} style={
                          inv.is_credit_note
                            ? { background: 'rgba(220,38,38,0.04)' }
                            : inv.needs_guest_name
                              ? { background: 'rgba(245,158,11,0.05)' }
                              : undefined
                        }>
                          <td>
                            <code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: inv.is_credit_note ? '#dc2626' : 'var(--accent-primary)' }}>
                              {inv.invoice_number}
                            </code>
                          </td>
                          <td>
                            <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                              {inv.needs_guest_name && <AlertTriangle size={12} color="#f59e0b" />}
                              {inv.needs_guest_name
                                ? <em style={{ color: '#f59e0b', fontStyle: 'normal' }}>DOPLNIT JM&#201;NO</em>
                                : (inv.guest_name || '—')
                              }
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{inv.description}</div>
                          </td>
                          <td
                            style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}
                            onClick={() => setDeleteConfirm({ id: inv.invoice_id, number: inv.invoice_number })}
                            title="Видалити фактуру (прихована опція)"
                          >
                            {formatDate(inv.date)}
                          </td>
                          <td><span style={{ fontWeight: 700, fontSize: 14, color: inv.is_credit_note ? '#dc2626' : undefined }}>{formatAmount(inv.amount, inv.currency)}</span></td>
                          <td>
                            {inv.is_credit_note
                              ? <span className="badge" style={{ background: 'rgba(220,38,38,0.12)', color: '#dc2626', fontSize: 10 }}>↩ Storno</span>
                              : inv.needs_guest_name
                                ? <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#b45309', fontSize: 10 }}>⚠ Im&apos;ya</span>
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
                  )}
              </>
            )}


            {stmtResult && stmtResult.length === 0 && (
              <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <AlertCircle size={32} style={{ marginBottom: 12 }} />
                <div>Жодної транзакції не знайдено у файлі</div>
              </div>
            )}

            {/* ── Danger Zone: Clear/Delete Imported Invoices ── */}
            <div style={{
              marginTop: 48,
              background: 'var(--surface)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 12,
              padding: '24px 20px',
              boxShadow: '0 4px 20px rgba(239, 68, 68, 0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Trash2 size={20} color="#ef4444" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Небезпечна зона: Видалення імпортованих фактур</h3>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Тут ви можете масово видалити раніше імпортовані фактури з виписок Airbnb, Booking.com або Teya, щоб завантажити нові файли без подвоєння сум.
                  </p>
                </div>
              </div>

              {batchDeleteError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, padding: '12px 16px', color: '#ef4444', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  {batchDeleteError}
                </div>
              )}

              {batchDeleteSuccess && (
                <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', borderRadius: 8, padding: '12px 16px', color: '#10b981', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={14} style={{ flexShrink: 0 }} />
                  {batchDeleteSuccess}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                <div style={{ minWidth: 160, flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Джерело виписки</label>
                  <select
                    className="form-input"
                    value={batchDeleteChannel}
                    onChange={e => {
                      setBatchDeleteChannel(e.target.value as any);
                      setBatchDeleteSuccess(null);
                      setBatchDeleteError(null);
                    }}
                    style={{ width: '100%', padding: '7px 10px', fontSize: 13 }}
                  >
                    <option value="airbnb">Airbnb (AIR)</option>
                    <option value="booking">Booking.com (BKG)</option>
                    <option value="teya">Teya (TEYA)</option>
                    <option value="all">Усі імпортовані канали</option>
                  </select>
                </div>

                <div style={{ minWidth: 160, flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Період / Місяць (необов&apos;язково)</label>
                  <input
                    type="month"
                    className="form-input"
                    value={batchDeleteMonth}
                    onChange={e => {
                      setBatchDeleteMonth(e.target.value);
                      setBatchDeleteSuccess(null);
                      setBatchDeleteError(null);
                    }}
                    style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                  />
                </div>

                <div style={{ flexShrink: 0 }}>
                  <button
                    className="btn btn-danger"
                    onClick={handleClearBatchInvoices}
                    disabled={batchDeleteLoading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      height: 38,
                      fontWeight: 600,
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '0 20px',
                      cursor: 'pointer',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    {batchDeleteLoading ? (
                      <><RefreshCw size={14} className="spin" /> Видалення...</>
                    ) : (
                      <><Trash2 size={14} /> Видалити фактури</>
                    )}
                  </button>
                </div>
              </div>
            </div>
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

        {/* ════════════════════════════════════════════════
            DELETE CONFIRMATION MODAL
        ════════════════════════════════════════════════ */}
        {deleteConfirm && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 4000,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => !deleteLoading && setDeleteConfirm(null)}>
            <div
              style={{ background: 'var(--surface-elevated, #1e1e2e)', borderRadius: 12, padding: '28px 32px', maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Trash2 size={20} style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Видалити фактуру?</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Цю дію неможливо скасувати.</div>
                </div>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Фактура </span>
                <strong style={{ color: '#ef4444' }}>{deleteConfirm.number}</strong>
                <span style={{ color: 'var(--text-secondary)' }}> буде назавжди видалена з бази даних.</span>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-ghost"
                  disabled={deleteLoading}
                  onClick={() => setDeleteConfirm(null)}
                  style={{ minWidth: 90 }}
                >
                  Скасувати
                </button>
                <button
                  className="btn"
                  disabled={deleteLoading}
                  onClick={() => handleDeleteInvoice(deleteConfirm.id)}
                  style={{ minWidth: 120, background: '#ef4444', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {deleteLoading
                    ? <><RefreshCw size={14} className="spin" /> Видаляє...</>
                    : <><Trash2 size={14} /> Видалити</>
                  }
                </button>
              </div>
            </div>
          </div>
        )}

                {/* ════════════════════════════════════════════════
            DELETE CONFIRMATION MODAL
        ════════════════════════════════════════════════ */}
        {deleteConfirm && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 4000,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => !deleteLoading && setDeleteConfirm(null)}>
            <div
              style={{ background: 'var(--surface-elevated, #1e1e2e)', borderRadius: 12, padding: '28px 32px', maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Trash2 size={20} style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Видалити фактуру?</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Цю дію неможливо скасувати.</div>
                </div>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Фактура </span>
                <strong style={{ color: '#ef4444' }}>{deleteConfirm.number}</strong>
                <span style={{ color: 'var(--text-secondary)' }}> буде назавжди видалена з бази даних.</span>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-ghost"
                  disabled={deleteLoading}
                  onClick={() => setDeleteConfirm(null)}
                  style={{ minWidth: 90 }}
                >
                  Скасувати
                </button>
                <button
                  className="btn"
                  disabled={deleteLoading}
                  onClick={() => handleDeleteInvoice(deleteConfirm.id)}
                  style={{ minWidth: 120, background: '#ef4444', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {deleteLoading
                    ? <><RefreshCw size={14} className="spin" /> Видаляє...</>
                    : <><Trash2 size={14} /> Видалити</>
                  }
                </button>
              </div>
            </div>
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
                    {/* Variabilní / Konstantní / Objednávka — same label:value pattern as left */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 3, alignItems: 'baseline' }}>
                      <span style={{ color: '#888', fontSize: 9, minWidth: 108, flexShrink: 0 }}>Variabilní symbol:</span>
                      <span style={{ color: '#999', fontStyle: 'italic', fontSize: 10 }}>automaticky</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 3, alignItems: 'baseline' }}>
                      <span style={{ color: '#888', fontSize: 9, minWidth: 108, flexShrink: 0 }}>Konstantní symbol:</span>
                      <span style={{ fontSize: 11 }}>0308</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'baseline' }}>
                      <span style={{ color: '#888', fontSize: 9, minWidth: 108, flexShrink: 0 }}>Objednávka č.:</span>
                      <span style={{ color: '#888', fontSize: 10 }}>ze dne:</span>
                    </div>

                    {/* Odběratel sub-box — mirrors Dodavatel structure */}
                    <div style={{ border: '0.5px solid #aaa', padding: '6px 8px' }}>
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>
                        Odběratel: <span style={{ color: '#4f6ef7' }}>(необов&apos;язково)</span>
                      </div>

                      {/* Company name — bold 12pt like "Kemp Carlsbad s.r.o." on the left */}
                      <input type="text" value={customForm.buyerName}
                        onChange={e => setCustomForm(f => ({ ...f, buyerName: e.target.value, showBuyer: !!e.target.value }))}
                        placeholder="Назва компанії або ПІБ..."
                        style={{ width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1px dashed #4f6ef7', background: 'transparent', fontSize: 12, fontWeight: 700, padding: '1px 0', marginBottom: 5, outline: 'none', color: '#1a1a1a', fontFamily: 'inherit' }}
                      />

                      {/* Address */}
                      <input type="text" value={customForm.buyerAddress}
                        onChange={e => setCustomForm(f => ({ ...f, buyerAddress: e.target.value }))}
                        placeholder="Вулиця, будинок"
                        style={{ width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: '1px 0', marginBottom: 4, outline: 'none', color: '#1a1a1a', fontFamily: 'inherit', display: 'block' }}
                      />

                      {/* PSČ / City */}
                      <input type="text" value={customForm.buyerCity}
                        onChange={e => setCustomForm(f => ({ ...f, buyerCity: e.target.value }))}
                        placeholder="PSČ Місто"
                        style={{ width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: '1px 0', marginBottom: 6, outline: 'none', color: '#1a1a1a', fontFamily: 'inherit', display: 'block' }}
                      />

                      {/* IČO — inline label:input like left side */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                        <span style={{ color: '#1565c0', fontSize: 9, minWidth: 24, flexShrink: 0 }}>IČO:</span>
                        <input type="text" value={customForm.buyerIco}
                          onChange={e => setCustomForm(f => ({ ...f, buyerIco: e.target.value }))}
                          placeholder="12345678"
                          style={{ flex: 1, border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: 0, outline: 'none', color: '#1565c0', fontFamily: 'inherit' }}
                        />
                      </div>

                      {/* DIČ — inline label:input */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ color: '#1565c0', fontSize: 9, minWidth: 24, flexShrink: 0 }}>DIČ:</span>
                        <input type="text" value={customForm.buyerDic}
                          onChange={e => setCustomForm(f => ({ ...f, buyerDic: e.target.value }))}
                          placeholder="CZ12345678"
                          style={{ flex: 1, border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', fontSize: 11, padding: 0, outline: 'none', color: '#1565c0', fontFamily: 'inherit' }}
                        />
                      </div>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 58px 100px 42px 100px 20px', background: '#f0f0f0', border: '0.5px solid #aaa', padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#555' }}>
                    <span>Označení dodávky</span>
                    <span style={{ textAlign: 'right' }}>Množství</span>
                    <span style={{ textAlign: 'right' }}>J.cena</span>
                    <span style={{ textAlign: 'right' }}>Sleva</span>
                    <span style={{ textAlign: 'right' }}>Kč Celkem</span>
                    <span />
                  </div>
                  {/* Dynamic rows */}
                  {customItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 58px 100px 42px 100px 20px', border: '0.5px solid #ddd', borderTop: 'none', padding: '5px 6px', gap: 4, alignItems: 'start' }}>
                      <div>
                        <select
                          value={item.description}
                          onChange={e => setCustomItems(arr => arr.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))}
                          style={{ width: '100%', fontSize: 11, border: '1px dashed #4f6ef7', background: 'rgba(79,110,247,0.04)', padding: '3px 5px', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
                        >
                          {DESCRIPTION_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        {item.description === 'Jiné (zadat ručně)' && (
                          <input type="text" placeholder="Opište dodávku..." value={item.descCustom}
                            onChange={e => setCustomItems(arr => arr.map((it, i) => i === idx ? { ...it, descCustom: e.target.value } : it))}
                            style={{ width: '100%', fontSize: 11, border: '1px solid #4f6ef7', padding: '3px 5px', marginTop: 3, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        )}
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 11, paddingTop: 5 }}>1</div>
                      <input type="number" min="0" step="0.01" value={item.amount}
                        onChange={e => setCustomItems(arr => arr.map((it, i) => i === idx ? { ...it, amount: e.target.value } : it))}
                        placeholder="0,00"
                        style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, border: '1px dashed #4f6ef7', background: 'rgba(79,110,247,0.04)', padding: '3px 5px', outline: 'none', fontFamily: 'inherit', width: '100%' }}
                      />
                      <div style={{ textAlign: 'right', fontSize: 11, color: '#888', paddingTop: 5 }}>—</div>
                      <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, color: item.amount && parseFloat(item.amount) > 0 ? '#1a1a1a' : '#aaa', paddingTop: 5 }}>
                        {item.amount && parseFloat(item.amount) > 0
                          ? new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2 }).format(parseFloat(item.amount))
                          : '0,00'}
                      </div>
                      <button
                        onClick={() => setCustomItems(arr => arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr)}
                        disabled={customItems.length <= 1}
                        title="Видалити рядок"
                        style={{ background: 'none', border: 'none', cursor: customItems.length > 1 ? 'pointer' : 'default', color: customItems.length > 1 ? '#ef4444' : '#ddd', fontSize: 14, padding: '2px 0', lineHeight: 1 }}
                      >x</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setCustomItems(arr => [...arr, { description: 'Krátkodobé ubytování', descCustom: '', amount: '' }])}
                    style={{ width: '100%', border: '1px dashed #4f6ef7', background: 'rgba(79,110,247,0.03)', color: '#4f6ef7', padding: '5px', fontSize: 11, cursor: 'pointer', marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'inherit' }}
                  >
                    + Přidat řádek
                  </button>
                </div>

                {/* ── TOTALS ── */}
                {(() => {
                  const totalAmt = customItems.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
                  const fmt = (n: number) => n > 0 ? new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2 }).format(n) : '0,00';
                  return (
                    <div style={{ marginTop: 6 }}>
                      {customItems.length > 1 && customItems.map((it, idx) => {
                        const a = parseFloat(it.amount) || 0;
                        if (a <= 0) return null;
                        const desc = it.description === 'Jiné (zadat ručně)' ? (it.descCustom || '...') : it.description;
                        return (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888', marginBottom: 2 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>{desc}</span>
                            <span>{fmt(a)} {customForm.currency}</span>
                          </div>
                        );
                      })}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555', marginBottom: 5, borderTop: customItems.length > 1 ? '0.5px dashed #ddd' : 'none', paddingTop: customItems.length > 1 ? 4 : 0 }}>
                        <span>Součet položek</span>
                        <span>{fmt(totalAmt)} {customForm.currency}</span>
                      </div>
                      <div style={{ borderTop: '0.5px solid #aaa', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                        <span>CELKEM K ÚHRADĚ</span>
                        <span style={{ fontSize: 15 }}>{fmt(totalAmt)} {customForm.currency}</span>
                      </div>
                    </div>
                  );
                })()}

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
