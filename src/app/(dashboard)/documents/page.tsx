'use client';

import { useEffect, useState, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  FileText, Download, Eye, RefreshCw, Receipt,
  CheckCircle, AlertCircle, Calendar, User,
  GitCompare, Filter, ChevronLeft, ChevronRight,
  XCircle, AlertTriangle, Banknote, Plus,
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
  invoice_company_name: string | null;
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
  const [activeTab, setActiveTab] = useState<'invoices' | 'reconciliation'>('invoices');

  // ── Invoices tab state ────────────────────────────────────────
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError]   = useState<string | null>(null);

  // ── Reconciliation tab state ──────────────────────────────────
  const [month, setMonth]           = useState(currentMonth());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [reconRows, setReconRows]   = useState<ReconRow[]>([]);
  const [reconSummary, setReconSummary] = useState<ReconSummary | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconError, setReconError] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

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
          <button
            className="btn btn-ghost btn-sm"
            onClick={activeTab === 'invoices' ? fetchInvoices : fetchRecon}
            disabled={activeTab === 'invoices' ? invLoading : reconLoading}
          >
            <RefreshCw size={14} className={(activeTab === 'invoices' ? invLoading : reconLoading) ? 'spin' : ''} />
            Оновити
          </button>
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

              {/* Filter row */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                  Транзакції з'являються коли в системі є вхідні операції (income) зі статусом completed.
                </div>
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
                    {reconRows.map((row) => {
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
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
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
    </>
  );
}
