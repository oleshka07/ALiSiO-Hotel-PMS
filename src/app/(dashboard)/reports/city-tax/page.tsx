'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { Loader2, ChevronLeft, ChevronRight, Download } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

const TAX_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Очікує', color: '#f59e0b', icon: '⏳' },
  paid: { label: 'Оплачено', color: '#22c55e', icon: '✅' },
  exempt: { label: 'Звільнено', color: '#6c7086', icon: '🚫' },
};

export default function CityTaxReportPage() {
  const onMenuClick = useMobileMenu();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [bookingSources, setBookingSources] = useState<any[]>([]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, sourcesRes] = await Promise.all([
        fetch(`/api/reports/city-tax?month=${month}`),
        fetch('/api/booking-sources'),
      ]);
      const reportData = await reportRes.json();
      const sourcesData = await sourcesRes.json();
      setData(reportData);
      if (Array.isArray(sourcesData)) setBookingSources(sourcesData);
    } catch (e) {
      console.error('Failed to fetch city tax report', e);
    }
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const [y, m] = month.split('-').map(Number);
  const monthLabel = `${MONTH_NAMES[m - 1]} ${y}`;

  const sourceLabel = (code: string) => {
    const s = bookingSources.find((bs: any) => bs.code === code);
    return s?.name || code;
  };

  return (
    <>
      <Header title="Туристичний збір" onMenuClick={onMenuClick} />
      <div className="app-content" style={{ padding: '16px 24px', paddingTop: 'calc(var(--header-height) + 16px)' }}>

        {/* Month selector */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24,
          padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-primary)',
        }}>
          <button className="btn btn-secondary btn-sm" onClick={prevMonth}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 18, fontWeight: 700, minWidth: 160, textAlign: 'center' }}>{monthLabel}</div>
          <button className="btn btn-secondary btn-sm" onClick={nextMonth}><ChevronRight size={16} /></button>
          <div style={{ flex: 1 }} />
          <a href={`/reports`} className="btn btn-secondary btn-sm">← Звіти</a>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 8 }}>
            <Loader2 size={20} className="animate-pulse" /> <span style={{ color: 'var(--text-secondary)' }}>Завантаження...</span>
          </div>
        ) : data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-primary)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Бронювань</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{data.totalBookings}</div>
              </div>
              <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-primary)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Гостей (дорослих)</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{data.totalGuests}</div>
              </div>
              <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-primary)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Збір до сплати</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-primary-text)', marginTop: 8 }}>{(data.totalTaxAmount || 0).toLocaleString()} CZK</div>
              </div>
              <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-primary)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Оплачено</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e', marginTop: 8 }}>{(data.totalTaxPaid || 0).toLocaleString()} CZK</div>
              </div>
              <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-primary)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Очікує оплати</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b', marginTop: 8 }}>{(data.totalTaxPending || 0).toLocaleString()} CZK</div>
              </div>
              <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-primary)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Включено у ціну</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#a78bfa', marginTop: 8 }}>{(data.totalTaxIncluded || 0).toLocaleString()} CZK</div>
              </div>
            </div>

            {/* By source */}
            {data.bySource && Object.keys(data.bySource).length > 0 && (
              <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-primary)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>По джерелам</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, auto)', gap: '8px 20px', fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase' }}>Джерело</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Бронювань</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Збір</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Оплачено</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Очікує</div>
                  {Object.entries(data.bySource).map(([src, d]: [string, any]) => (
                    <div key={src} style={{ display: 'contents' }}>
                      <div style={{ fontWeight: 600 }}>{sourceLabel(src)}</div>
                      <div style={{ textAlign: 'right' }}>{d.count}</div>
                      <div style={{ textAlign: 'right', fontWeight: 600 }}>{d.amount.toLocaleString()} CZK</div>
                      <div style={{ textAlign: 'right', color: '#22c55e' }}>{d.paid.toLocaleString()}</div>
                      <div style={{ textAlign: 'right', color: '#f59e0b' }}>{d.pending.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bookings table */}
            <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-primary)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Деталі бронювань ({data.bookings?.length || 0})</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Гість</th>
                      <th>Юніт</th>
                      <th>Заїзд</th>
                      <th>Виїзд</th>
                      <th>Дорослих</th>
                      <th>Джерело</th>
                      <th style={{ textAlign: 'right' }}>Збір</th>
                      <th>Включено</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.bookings || []).map((b: any) => {
                      const ts = TAX_STATUS[b.city_tax_paid] || TAX_STATUS.pending;
                      return (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 600 }}>{b.first_name} {b.last_name}</td>
                          <td>{b.unit_name}</td>
                          <td>{b.check_in}</td>
                          <td>{b.check_out}</td>
                          <td>{b.adults}</td>
                          <td>{sourceLabel(b.source)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{(b.city_tax_amount || 0).toLocaleString()} CZK</td>
                          <td>{b.city_tax_included ? '✅ Так' : '—'}</td>
                          <td>
                            <span className="badge" style={{ background: ts.color + '22', color: ts.color, fontSize: 11 }}>
                              {ts.icon} {ts.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 40 }}>Немає даних</div>
        )}
      </div>
    </>
  );
}
