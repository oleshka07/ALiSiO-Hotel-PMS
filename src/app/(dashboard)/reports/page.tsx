'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { BarChart3, TrendingUp, Calendar, Users, Wallet, RefreshCw, Loader2, Tent } from 'lucide-react';
import GlampingReportModal from '@/components/reports/GlampingReportModal';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CZK_TO_EUR = 23.5;
const toEur = (czk: number) => (czk / CZK_TO_EUR).toFixed(1);

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  glamping: { label: 'Glamping', color: '#a78bfa' },
  resort: { label: 'Resort', color: '#60a5fa' },
  camping: { label: 'Camping', color: '#34d399' },
};

const METHOD_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  cash: { label: 'Готівка', icon: '💵', color: '#22c55e' },
  card: { label: 'Картою', icon: '💳', color: '#3b82f6' },
  bank_transfer: { label: 'На рахунок', icon: '🏦', color: '#f59e0b' },
  invoice: { label: 'Фактура', icon: '📄', color: '#a78bfa' },
  online: { label: 'Онлайн', icon: '🌐', color: '#60a5fa' },
  booking_platform: { label: 'Платформа бронювання', icon: '🏨', color: '#f472b6' },
};

// ─── Date helpers ─────────────────────────────────────
function fmtDate(d: Date): string { return d.toISOString().split('T')[0]; }

function getPresetRange(key: string): [string, string] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (key) {
    case 'today': return [fmtDate(today), fmtDate(today)];
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return [fmtDate(y), fmtDate(y)];
    }
    case 'thisWeek': {
      const dow = today.getDay();
      const mon = new Date(today); mon.setDate(mon.getDate() - (dow === 0 ? 6 : dow - 1));
      return [fmtDate(mon), fmtDate(today)];
    }
    case 'lastWeek': {
      const dow = today.getDay();
      const thisMon = new Date(today); thisMon.setDate(thisMon.getDate() - (dow === 0 ? 6 : dow - 1));
      const lastSun = new Date(thisMon); lastSun.setDate(lastSun.getDate() - 1);
      const lastMon = new Date(lastSun); lastMon.setDate(lastMon.getDate() - 6);
      return [fmtDate(lastMon), fmtDate(lastSun)];
    }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return [fmtDate(start), fmtDate(today)];
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return [fmtDate(start), fmtDate(end)];
    }
    case '3months': {
      const start = new Date(today); start.setMonth(start.getMonth() - 3);
      return [fmtDate(start), fmtDate(today)];
    }
    case '6months': {
      const start = new Date(today); start.setMonth(start.getMonth() - 6);
      return [fmtDate(start), fmtDate(today)];
    }
    default: return [fmtDate(today), fmtDate(today)];
  }
}

const PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'Сьогодні' },
  { key: 'yesterday', label: 'Вчора' },
  { key: 'thisWeek', label: 'Цей тиждень' },
  { key: 'lastWeek', label: 'Мін. тиждень' },
  { key: 'thisMonth', label: 'Цей місяць' },
  { key: 'lastMonth', label: 'Мін. місяць' },
  { key: '3months', label: '3 місяці' },
  { key: '6months', label: '6 місяців' },
];

export default function ReportsPage() {
  const initRange = getPresetRange('thisMonth');
  const [from, setFrom] = useState(initRange[0]);
  const [to, setTo] = useState(initRange[1]);
  const [activePreset, setActivePreset] = useState('thisMonth');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isGlampingModalOpen, setIsGlampingModalOpen] = useState(false);
  const onMenuClick = useMobileMenu();

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?from=${from}&to=${to}`);
      const json = await res.json();
      setData(json);
    } catch (e) { console.error('Report fetch error:', e); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const applyPreset = (key: string) => {
    const [f, t] = getPresetRange(key);
    setFrom(f);
    setTo(t);
    setActivePreset(key);
  };

  const summary = data?.summary || {};
  const catData = data?.revenueByCategory || {};
  const methodData = data?.paymentsByMethod || {};
  const totalMethodPayments = Object.values(methodData).reduce((s: number, v: any) => s + v, 0) as number;

  return (
    <>
      <Header title="Звіти" onMenuClick={onMenuClick} />
      <div className="app-content">
        <div className="page-header">
          <div>
            <h2 className="page-title">Аналітика продажів</h2>
            <div className="page-subtitle">
              {from === to ? from : `${from} — ${to}`}
              {data?.period?.days && ` (${data.period.days} днів)`}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => setIsGlampingModalOpen(true)}>
              <Tent size={16} /> Глемпінг по будинках
            </button>
            <button className="btn btn-secondary" onClick={fetchReport} title="Оновити">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Date range presets */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {PRESETS.map(p => (
              <button key={p.key}
                className={`btn btn-sm ${activePreset === p.key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => applyPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Від:</label>
            <input className="form-input" type="date" value={from}
              style={{ width: 160, fontSize: 13 }}
              onChange={e => { setFrom(e.target.value); setActivePreset(''); }} />
            <label style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>До:</label>
            <input className="form-input" type="date" value={to}
              style={{ width: 160, fontSize: 13 }}
              onChange={e => { setTo(e.target.value); setActivePreset(''); }} />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <Loader2 size={28} className="animate-pulse" style={{ display: 'inline-block' }} />
            <div style={{ marginTop: 8, color: 'var(--text-tertiary)' }}>Завантаження...</div>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon blue"><TrendingUp size={22} /></div>
                <div><div className="stat-value">{summary.occupancyPct || 0}%</div><div className="stat-label">Завантаженість</div></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green"><BarChart3 size={22} /></div>
                <div>
                  <div className="stat-value">{(summary.totalRevenue || 0).toLocaleString()}</div>
                  <div className="stat-label">Вартість бронювань (CZK, по заїзду) ≈ {toEur(summary.totalRevenue || 0)} EUR</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon yellow"><Calendar size={22} /></div>
                <div><div className="stat-value">{summary.totalBookings || 0}</div><div className="stat-label">Бронювань</div></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon purple"><Users size={22} /></div>
                <div><div className="stat-value">{summary.totalGuests || 0}</div><div className="stat-label">Гостей</div></div>
              </div>
            </div>

            {/* Revenue + Payment Method */}
            <div className="reports-two-col">
              {/* Revenue by category */}
              <div className="card">
                <div className="card-header"><h3 className="card-title">Бронювання по категоріях</h3></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(catData).length === 0 ? (
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: 24 }}>Немає даних</div>
                  ) : (
                    Object.entries(catData).map(([cat, info]: [string, any]) => {
                      const cfg = CATEGORY_LABELS[cat] || { label: cat, color: '#888' };
                      const avgCheck = info.bookings > 0 ? Math.round(info.revenue / info.bookings) : 0;
                      const pct = summary.totalRevenue > 0 ? Math.round((info.revenue / summary.totalRevenue) * 100) : 0;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between mb-2" style={{ fontSize: 13 }}>
                            <span style={{ fontWeight: 600 }}>{cfg.label}</span>
                            <span style={{ fontWeight: 700 }}>
                              {info.revenue.toLocaleString()} CZK
                              <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                                {info.bookings} брон. · сер. {avgCheck.toLocaleString()} CZK
                              </span>
                            </span>
                          </div>
                          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', height: 8, overflow: 'hidden' }}>
                            <div style={{ background: cfg.color, height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-full)', transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Payment by method */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Оплати по методах</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Wallet size={14} style={{ color: 'var(--text-tertiary)' }} />
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-primary)' }}>
                      {totalMethodPayments.toLocaleString()} CZK
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>≈ {toEur(totalMethodPayments)} EUR</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(methodData).length === 0 ? (
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: 24 }}>Немає транзакцій</div>
                  ) : (
                    Object.entries(methodData).sort(([, a], [, b]) => (b as number) - (a as number)).map(([method, amount]) => {
                      const cfg = METHOD_LABELS[method] || { label: method, icon: '💰', color: '#888' };
                      const pct = totalMethodPayments > 0 ? Math.round(((amount as number) / totalMethodPayments) * 100) : 0;
                      return (
                        <div key={method}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 13 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                              <span style={{ fontSize: 16 }}>{cfg.icon}</span> {cfg.label}
                            </span>
                            <span>
                              <span style={{ fontWeight: 700 }}>{(amount as number).toLocaleString()} CZK</span>
                              <span style={{ color: 'var(--text-tertiary)', marginLeft: 6, fontSize: 11 }}>({pct}%)</span>
                            </span>
                          </div>
                          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', height: 8, overflow: 'hidden' }}>
                            <div style={{ background: cfg.color, height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-full)', transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Summary table */}
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header"><h3 className="card-title">Зведена таблиця по категоріях</h3></div>

              {/* Desktop table */}
              <div className="table-wrapper desktop-only" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Категорія</th>
                      <th>Бронювань</th>
                      <th>Ночей</th>
                      <th>Вартість бронювань (CZK)</th>
                      <th>≈ EUR</th>
                      <th>Сер. чек</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(catData).length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 20 }}>Немає даних</td></tr>
                    ) : (
                      Object.entries(catData).map(([cat, info]: [string, any]) => {
                        const cfg = CATEGORY_LABELS[cat] || { label: cat, color: '#888' };
                        const avgCheck = info.bookings > 0 ? Math.round(info.revenue / info.bookings) : 0;
                        return (
                          <tr key={cat}>
                            <td><span className="badge" style={{ background: cfg.color + '22', color: cfg.color }}>{cfg.label}</span></td>
                            <td>{info.bookings}</td>
                            <td>{info.nights}</td>
                            <td style={{ fontWeight: 700 }}>{info.revenue.toLocaleString()}</td>
                            <td style={{ color: 'var(--text-tertiary)' }}>≈ {toEur(info.revenue)}</td>
                            <td>{avgCheck.toLocaleString()}</td>
                          </tr>
                        );
                      })
                    )}
                    {Object.entries(catData).length > 0 && (
                      <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-primary)' }}>
                        <td>Всього</td>
                        <td>{summary.totalBookings}</td>
                        <td>{Object.values(catData).reduce((s: number, v: any) => s + (v as any).nights, 0)}</td>
                        <td style={{ color: 'var(--accent-primary)' }}>{(summary.totalRevenue || 0).toLocaleString()}</td>
                        <td style={{ color: 'var(--text-tertiary)' }}>≈ {toEur(summary.totalRevenue || 0)}</td>
                        <td>{(summary.avgCheck || 0).toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="mobile-only">
                {Object.entries(catData).length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 20 }}>Немає даних</div>
                ) : (
                  <div className="card-list">
                    {Object.entries(catData).map(([cat, info]: [string, any]) => {
                      const cfg = CATEGORY_LABELS[cat] || { label: cat, color: '#888' };
                      const avgCheck = info.bookings > 0 ? Math.round(info.revenue / info.bookings) : 0;
                      return (
                        <div key={cat} className="report-category-card">
                          <div className="report-category-card-header">
                            <span className="badge" style={{ background: cfg.color + '22', color: cfg.color }}>{cfg.label}</span>
                            <span className="report-category-card-value">{info.revenue.toLocaleString()} CZK</span>
                          </div>
                          <div className="report-category-card-stats">
                            <span>{info.bookings} брон.</span>
                            <span>{info.nights} ночей</span>
                            <span>сер. {avgCheck.toLocaleString()} CZK</span>
                          </div>
                        </div>
                      );
                    })}
                    {/* Total */}
                    <div className="report-category-card" style={{ borderColor: 'var(--accent-primary)', borderWidth: 2 }}>
                      <div className="report-category-card-header">
                        <span style={{ fontWeight: 700, fontSize: 14 }}>Всього</span>
                        <span className="report-category-card-value" style={{ fontSize: 18 }}>{(summary.totalRevenue || 0).toLocaleString()} CZK</span>
                      </div>
                      <div className="report-category-card-stats">
                        <span>{summary.totalBookings} брон.</span>
                        <span>{Object.values(catData).reduce((s: number, v: any) => s + (v as any).nights, 0)} ночей</span>
                        <span>≈ {toEur(summary.totalRevenue || 0)} EUR</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <GlampingReportModal 
        isOpen={isGlampingModalOpen} 
        onClose={() => setIsGlampingModalOpen(false)} 
        from={from} 
        to={to} 
      />
    </>
  );
}
