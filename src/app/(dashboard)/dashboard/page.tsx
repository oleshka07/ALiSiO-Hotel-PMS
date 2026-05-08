'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { useDevice } from '@/lib/useDevice';
import MobileDashboard from '@/components/mobile/pages/MobileDashboard';
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  BedDouble,
  CalendarDays,
  Users,
  Loader2,
  Flame,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface DashboardData {
  arrivalsToday: number;
  departuresToday: number;
  occupancyRate: number;
  freeUnits: number;
  totalUnits: number;
  upcomingArrivals: Array<{
    id: string; check_in: string; check_out: string; nights: number; adults: number; children: number; status: string;
    first_name: string; last_name: string; unit_name: string; unit_code: string;
  }>;
  todayDepartures: Array<{
    id: string; check_out: string; status: string;
    first_name: string; last_name: string; unit_name: string; unit_code: string; cleaning_status: string;
  }>;
}

const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Чернетка', badge: 'badge-info' },
  tentative: { label: 'Очікується', badge: 'badge-warning' },
  confirmed: { label: 'Підтверджено', badge: 'badge-success' },
  checked_in: { label: 'Заселено', badge: 'badge-primary' },
  checked_out: { label: 'Виселено', badge: 'badge-info' },
};

const CLEAN_MAP: Record<string, { label: string; badge: string }> = {
  clean: { label: 'Прибрано', badge: 'badge-success' },
  dirty: { label: 'Брудно', badge: 'badge-danger' },
  in_progress: { label: 'Прибирається', badge: 'badge-warning' },
};

const STATUS_ORDER_MAP: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Очікує оплати', badge: 'badge-warning' },
  confirmed: { label: 'Підтверджено', badge: 'badge-info' },
  paid: { label: 'Оплачено', badge: 'badge-success' },
  completed: { label: 'Виконано', badge: 'badge-primary' },
  cancelled: { label: 'Скасовано', badge: 'badge-danger' },
};

interface ServiceOrder {
  id: string;
  source: string;
  serviceId: string;
  serviceName: string;
  serviceDate: string;
  startHour: number | null;
  endHour: number | null;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  guestName: string | null;
  unitName: string | null;
  menuItemName?: string | null;
  quantity?: number;
  createdAt: string;
}

export default function DashboardPage() {
  const { isMobile } = useDevice();
  if (isMobile) return <MobileDashboard />;
  return <DashboardDesktop />;
}

function DashboardDesktop() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [soDate, setSoDate] = useState(new Date().toISOString().split('T')[0]);
  const [soPeriod, setSoPeriod] = useState<'day'|'week'|'all'>('day');
  const [loading, setLoading] = useState(true);
  const onMenuClick = useMobileMenu();

  /** DD.MM.YYYY */
  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  };

  const loadServiceOrders = (date: string, period: string) => {
    fetch(`/api/service-orders?date=${date}&period=${period}`)
      .then(r => r.json())
      .then(d => setServiceOrders(d.orders || []))
      .catch(console.error);
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard').then(r => r.json()),
      fetch(`/api/service-orders?date=${soDate}&period=${soPeriod}`).then(r => r.json()).catch(() => ({ orders: [] })),
    ]).then(([dashData, soData]) => {
      setData(dashData);
      setServiceOrders(soData.orders || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDateChange = (offset: number) => {
    const d = new Date(soDate);
    d.setDate(d.getDate() + offset);
    const newDate = d.toISOString().split('T')[0];
    setSoDate(newDate);
    loadServiceOrders(newDate, soPeriod);
  };

  const handlePeriodChange = (p: 'day'|'week'|'all') => {
    setSoPeriod(p);
    loadServiceOrders(soDate, p);
  };

  const handleOrderAction = async (id: string, action: 'complete' | 'cancel' | 'reopen') => {
    await fetch('/api/service-orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    loadServiceOrders(soDate, soPeriod);
  };

  if (loading || !data) {
    return (
      <>
        <Header title="Dashboard" onMenuClick={onMenuClick} />
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <Loader2 size={24} className="animate-pulse" /> <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>Завантаження...</span>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Dashboard" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Stats cards */}
        <div className="dashboard-stats-grid">
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(52, 211, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowDownRight size={22} style={{ color: 'var(--accent-success)' }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{data.arrivalsToday}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Заїзди сьогодні</div>
            </div>
          </div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(96, 165, 250, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUpRight size={22} style={{ color: 'var(--accent-info)' }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{data.departuresToday}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Виїзди сьогодні</div>
            </div>
          </div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(251, 191, 36, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={22} style={{ color: 'var(--accent-warning)' }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{data.occupancyRate}%</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Завантаженість</div>
            </div>
          </div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(167, 139, 250, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BedDouble size={22} style={{ color: '#a78bfa' }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{data.freeUnits}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Вільних номерів</div>
            </div>
          </div>
        </div>

        {/* Service Orders */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <Flame size={16} style={{ color: '#f59e0b' }} /> Замовлення послуг
                {serviceOrders.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: 10 }}>
                    {serviceOrders.length}
                  </span>
                )}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Period selector */}
                {(['day', 'week', 'all'] as const).map(p => (
                  <button key={p} onClick={() => handlePeriodChange(p)}
                    style={{ padding: '3px 10px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: soPeriod === p ? 'var(--accent)' : 'var(--surface-2)', color: soPeriod === p ? '#fff' : 'var(--text-secondary)' }}>
                    {p === 'day' ? 'День' : p === 'week' ? 'Тиждень' : 'Все'}
                  </button>
                ))}
                {/* Date nav */}
                <button onClick={() => handleDateChange(-1)} style={{ padding: '3px 6px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                  <ChevronLeft size={14} />
                </button>
                <input type="date" value={soDate} onChange={e => { setSoDate(e.target.value); loadServiceOrders(e.target.value, soPeriod); }}
                  style={{ padding: '3px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }} />
                <button onClick={() => handleDateChange(1)} style={{ padding: '3px 6px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            {serviceOrders.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Немає замовлень на цю дату</div>
            ) : (
            <>
            <div className="desktop-only">
              <table className="table">
                <thead>
                  <tr><th>Послуга</th><th>Гість</th><th>Дата / час</th><th>Юніт</th><th>Сума</th><th>Статус</th><th></th></tr>
                </thead>
                <tbody>
                  {serviceOrders.map(o => (
                    <tr key={o.id} style={{ opacity: o.status === 'cancelled' ? 0.5 : 1 }}>
                      <td style={{ fontWeight: 600 }}>
                        {o.serviceName}
                        {o.menuItemName && <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>🍽 {o.menuItemName}{(o.quantity || 0) > 1 ? ` ×${o.quantity}` : ''}</div>}
                      </td>
                      <td>{o.guestName || '—'}</td>
                      <td>
                        {fmtDate(o.serviceDate)}
                        {o.startHour != null && <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>{String(o.startHour).padStart(2,'0')}:00–{String(o.endHour).padStart(2,'0')}:00</span>}
                      </td>
                      <td>{o.unitName ? <span className="badge badge-primary">{o.unitName}</span> : '—'}</td>
                      <td style={{ fontWeight: 600 }}>{o.totalPrice} Kč</td>
                      <td>
                        <span className={`badge ${STATUS_ORDER_MAP[o.status]?.badge || 'badge-info'}`}>
                          {STATUS_ORDER_MAP[o.status]?.label || o.status}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {o.status === 'paid' || o.status === 'confirmed' ? (
                          <button onClick={() => handleOrderAction(o.id, 'complete')}
                            title="Відмітити як виконано"
                            style={{ padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(52,211,153,0.15)', color: 'var(--accent-success)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Check size={12} /> Виконано
                          </button>
                        ) : o.status === 'completed' ? (
                          <button onClick={() => handleOrderAction(o.id, 'reopen')}
                            title="Повернути"
                            style={{ padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text-tertiary)', fontSize: 11 }}>
                            ↩ Повернути
                          </button>
                        ) : o.status === 'pending' ? (
                          <button onClick={() => handleOrderAction(o.id, 'cancel')}
                            title="Скасувати"
                            style={{ padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(239,68,68,0.1)', color: 'var(--accent-danger)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <X size={12} /> Скасувати
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-only">
              <div className="card-list">
                {serviceOrders.map(o => (
                  <div key={o.id} className="dashboard-event-card" style={{ opacity: o.status === 'cancelled' ? 0.5 : 1 }}>
                    <div className="dashboard-event-card-icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                      <Flame size={18} style={{ color: '#f59e0b' }} />
                    </div>
                    <div className="dashboard-event-card-info">
                      <div className="dashboard-event-card-name">
                        {o.serviceName}
                        {o.menuItemName && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>🍽 {o.menuItemName}</span>}
                      </div>
                      <div className="dashboard-event-card-detail">
                        {o.guestName || 'Клієнт'}
                        {o.startHour != null && ` · ${o.startHour}:00–${o.endHour}:00`}
                      </div>
                    </div>
                    <div className="dashboard-event-card-right">
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{o.totalPrice} Kč</div>
                      <span className={`badge ${STATUS_ORDER_MAP[o.status]?.badge || 'badge-info'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                        {STATUS_ORDER_MAP[o.status]?.label || o.status}
                      </span>
                      {(o.status === 'paid' || o.status === 'confirmed') && (
                        <button onClick={() => handleOrderAction(o.id, 'complete')}
                          style={{ padding: '2px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'rgba(52,211,153,0.15)', color: 'var(--accent-success)', fontSize: 10, marginTop: 4 }}>
                          <Check size={10} /> ✓
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </>
            )}
          </div>

        {/* Tables */}
        <div className="dashboard-tables-grid">
          {/* Upcoming Arrivals */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={16} /> Найближчі заїзди
              <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(52,211,153,0.15)', color: 'var(--accent-success)', padding: '2px 8px', borderRadius: 10 }}>
                {data.upcomingArrivals.length}
              </span>
            </h3>
            {data.upcomingArrivals.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Немає найближчих заїздів</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="desktop-only">
                  <table className="table">
                    <thead>
                      <tr><th>Гість</th><th>Юніт</th><th>Заїзд</th><th>Ночей</th><th>Статус</th></tr>
                    </thead>
                    <tbody>
                      {data.upcomingArrivals.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 500 }}>{a.first_name} {a.last_name}</td>
                          <td><span className="badge badge-primary">{a.unit_code}</span></td>
                          <td>{fmtDate(a.check_in)}</td>
                          <td>{a.nights}</td>
                          <td><span className={`badge ${STATUS_MAP[a.status]?.badge || 'badge-info'}`}>{STATUS_MAP[a.status]?.label || a.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="mobile-only">
                  <div className="card-list">
                    {data.upcomingArrivals.map(a => (
                      <div key={a.id} className="dashboard-event-card">
                        <div className="dashboard-event-card-icon" style={{ background: 'rgba(52, 211, 153, 0.15)' }}>
                          <ArrowDownRight size={18} style={{ color: 'var(--accent-success)' }} />
                        </div>
                        <div className="dashboard-event-card-info">
                          <div className="dashboard-event-card-name">{a.first_name} {a.last_name}</div>
                          <div className="dashboard-event-card-detail">
                            <span className="badge badge-primary" style={{ fontSize: 10, padding: '1px 6px' }}>{a.unit_code}</span>
                            · {a.nights} ночей
                          </div>
                        </div>
                        <div className="dashboard-event-card-right">
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(a.check_in)}</div>
                          <span className={`badge ${STATUS_MAP[a.status]?.badge || 'badge-info'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                            {STATUS_MAP[a.status]?.label || a.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Departures Today */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowUpRight size={16} /> Виїзди сьогодні
              <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(96,165,250,0.15)', color: 'var(--accent-info)', padding: '2px 8px', borderRadius: 10 }}>
                {data.todayDepartures.length}
              </span>
            </h3>
            {data.todayDepartures.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Немає виїздів сьогодні</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="desktop-only">
                  <table className="table">
                    <thead>
                      <tr><th>Гість</th><th>Юніт</th><th>Виїзд</th><th>Прибирання</th></tr>
                    </thead>
                    <tbody>
                      {data.todayDepartures.map(d => (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 500 }}>{d.first_name} {d.last_name}</td>
                          <td><span className="badge badge-primary">{d.unit_code}</span></td>
                          <td>{fmtDate(d.check_out)}</td>
                          <td><span className={`badge ${CLEAN_MAP[d.cleaning_status]?.badge || 'badge-info'}`}>{CLEAN_MAP[d.cleaning_status]?.label || d.cleaning_status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="mobile-only">
                  <div className="card-list">
                    {data.todayDepartures.map(d => (
                      <div key={d.id} className="dashboard-event-card">
                        <div className="dashboard-event-card-icon" style={{ background: 'rgba(96, 165, 250, 0.15)' }}>
                          <ArrowUpRight size={18} style={{ color: 'var(--accent-info)' }} />
                        </div>
                        <div className="dashboard-event-card-info">
                          <div className="dashboard-event-card-name">{d.first_name} {d.last_name}</div>
                          <div className="dashboard-event-card-detail">
                            <span className="badge badge-primary" style={{ fontSize: 10, padding: '1px 6px' }}>{d.unit_code}</span>
                          </div>
                        </div>
                        <div className="dashboard-event-card-right">
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(d.check_out)}</div>
                          <span className={`badge ${CLEAN_MAP[d.cleaning_status]?.badge || 'badge-info'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                            {CLEAN_MAP[d.cleaning_status]?.label || d.cleaning_status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
