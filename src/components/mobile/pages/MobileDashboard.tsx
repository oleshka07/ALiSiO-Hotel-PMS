'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight, ArrowUpRight, TrendingUp, BedDouble,
  RefreshCw, BookOpen, CalendarDays, Users, Wallet,
  List, BarChart3, DollarSign, Settings, MessageSquare,
  CheckSquare, Home,
} from 'lucide-react';

interface DashboardData {
  arrivalsToday: number;
  departuresToday: number;
  occupancyRate: number;
  freeUnits: number;
  totalUnits: number;
  upcomingArrivals: Array<{
    id: string; check_in: string; check_out: string; nights: number;
    first_name: string; last_name: string; unit_name: string; unit_code: string; status: string;
  }>;
  todayDepartures: Array<{
    id: string; check_out: string; status: string;
    first_name: string; last_name: string; unit_name: string; unit_code: string; cleaning_status: string;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  tentative: 'var(--accent-warning)',
  confirmed: 'var(--accent-success)',
  checked_in: 'var(--accent-primary)',
  checked_out: 'var(--accent-info)',
};

const CLEAN_COLORS: Record<string, { label: string; color: string }> = {
  clean:       { label: 'Чисто',     color: '#22c55e' },
  dirty:       { label: 'Брудно',    color: '#ef4444' },
  in_progress: { label: 'В процесі', color: '#f59e0b' },
};

const QUICK_ACTIONS = [
  { label: 'Бронювання',  href: '/bookings',       icon: BookOpen,     color: '#3b82f6' },
  { label: 'Денна зміна', href: '/calendar?view=shift', icon: RefreshCw, color: '#3b82f6' },
  { label: 'Календар',    href: '/calendar',        icon: CalendarDays, color: '#14b8a6' },
  { label: 'Гості',       href: '/guests',          icon: Users,        color: '#8b5cf6' },
  { label: 'Журнал',      href: '/finance/operations',     icon: List,         color: '#22c55e' },
  { label: 'Фінанси',     href: '/finance',         icon: Wallet,       color: '#f59e0b' },
  { label: 'Витрати',     href: '/finance/expenses',icon: BarChart3,    color: '#ef4444' },
  { label: 'Ціни',        href: '/pricing',         icon: DollarSign,   color: '#06b6d4' },
  { label: 'Inbox',       href: '/crm/inbox',       icon: MessageSquare,color: '#ec4899' },
  { label: 'Звіти',       href: '/reports',         icon: TrendingUp,   color: '#a855f7' },
  { label: 'Налаштув.',   href: '/settings',        icon: Settings,     color: '#6b7280' },
];

type Tab = 'today' | 'tomorrow' | 'arrivals' | 'departures';

export default function MobileDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('today');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1,2,3,4].map(i => <div key={i} className="m-skeleton" style={{ height: 72, borderRadius: 14 }} />)}
      </div>
    );
  }

  if (!data) return null;

  const occupancyColor = data.occupancyRate >= 80 ? '#22c55e' : data.occupancyRate >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600 }}>
          {new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        <button onClick={fetchData} disabled={loading} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
          <RefreshCw size={16} className={loading ? 'animate-pulse' : ''} />
        </button>
      </div>

      {/* Occupancy banner */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 16, padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 4 }}>ЗАВАНТАЖЕНІСТЬ</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: occupancyColor, lineHeight: 1 }}>
            {data.occupancyRate}%
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {data.totalUnits - data.freeUnits} з {data.totalUnits} юнітів
          </div>
        </div>
        {/* Mini arc */}
        <svg width={72} height={44} viewBox="0 0 72 44">
          <path d="M6 38 A30 30 0 0 1 66 38" fill="none" stroke="var(--border-primary)" strokeWidth="6" strokeLinecap="round" />
          <path d="M6 38 A30 30 0 0 1 66 38" fill="none" stroke={occupancyColor} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${data.occupancyRate * 0.942} 100`} />
        </svg>
      </div>

      {/* Operational Shift Banner */}
      <Link
        href="/calendar?view=shift"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(139,92,246,0.18) 100%)',
          border: '1px solid rgba(59,130,246,0.35)',
          borderRadius: 16,
          padding: '12px 16px',
          marginBottom: 12,
          textDecoration: 'none',
          color: 'inherit',
          boxShadow: '0 2px 8px rgba(59,130,246,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>
            ⚡
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>ДЕННА ЗМІНА</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              🛬 {data.arrivalsToday} заїздів · 🛫 {data.departuresToday} виїздів
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', background: 'var(--bg-card)', padding: '6px 12px', borderRadius: 10, border: '1px solid rgba(59,130,246,0.25)' }}>
          Відкрити →
        </div>
      </Link>

      {/* Tabs */}
      <div className="m-chips" style={{ marginBottom: 10 }}>
        {([
          { key: 'today',      label: 'Сьогодні' },
          { key: 'tomorrow',   label: 'Завтра' },
          { key: 'arrivals',   label: `Заїзди (${data.upcomingArrivals.length})` },
          { key: 'departures', label: `Виїзди (${data.todayDepartures.length})` },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            className={`m-chip ${tab === t.key ? 'm-chip-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI row for selected tab */}
      {(tab === 'today' || tab === 'tomorrow') && (
        <div className="m-kpi-grid" style={{ marginBottom: 14 }}>
          {[
            { value: data.arrivalsToday,   label: 'Заїздів',  icon: ArrowDownRight, color: '#34d399', bg: 'rgba(52,211,153,0.15)', href: '/calendar?view=shift' },
            { value: data.departuresToday, label: 'Виїздів',  icon: ArrowUpRight,   color: '#60a5fa', bg: 'rgba(96,165,250,0.15)', href: '/calendar?view=shift'  },
            { value: data.freeUnits,       label: 'Вільних',  icon: BedDouble,      color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', href: '/bookings' },
            { value: `${data.occupancyRate}%`, label: 'Зайн.', icon: Home,          color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', href: '/calendar'  },
          ].map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <Link key={i} href={kpi.href} className="m-kpi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
                  <Icon size={16} style={{ color: kpi.color }} />
                </div>
                <div className="m-kpi-value">{kpi.value}</div>
                <div className="m-kpi-label">{kpi.label}</div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Arrivals list */}
      {tab === 'arrivals' && (
        data.upcomingArrivals.length === 0 ? (
          <div className="m-empty" style={{ padding: 24 }}>Немає найближчих заїздів</div>
        ) : (
          data.upcomingArrivals.slice(0, 10).map(a => (
            <div key={a.id} className="m-card" style={{ padding: '12px 14px' }}>
              <div className="m-card-row">
                <div>
                  <div className="m-card-title">{a.first_name} {a.last_name}</div>
                  <div className="m-card-subtitle">{a.unit_code} · {a.nights} ноч.</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{a.check_in}</div>
                  <div style={{ fontSize: 11, color: STATUS_COLORS[a.status] || 'var(--text-tertiary)' }}>
                    → {a.check_out}
                  </div>
                </div>
              </div>
            </div>
          ))
        )
      )}

      {/* Departures list */}
      {tab === 'departures' && (
        data.todayDepartures.length === 0 ? (
          <div className="m-empty" style={{ padding: 24 }}>Немає виїздів сьогодні</div>
        ) : (
          data.todayDepartures.map(d => {
            const cl = CLEAN_COLORS[d.cleaning_status] || { label: '—', color: 'var(--text-tertiary)' };
            return (
              <div key={d.id} className="m-card" style={{ padding: '12px 14px' }}>
                <div className="m-card-row">
                  <div>
                    <div className="m-card-title">{d.first_name} {d.last_name}</div>
                    <div className="m-card-subtitle">{d.unit_code}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: `${cl.color}18`, color: cl.color }}>
                    {cl.label}
                  </span>
                </div>
              </div>
            );
          })
        )
      )}

      {/* Quick actions grid */}
      <div className="m-section-title" style={{ marginTop: tab === 'today' || tab === 'tomorrow' ? 4 : 16 }}>
        Швидкий доступ
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 8 }}>
        {QUICK_ACTIONS.map(action => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 4px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-primary)', cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: `${action.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color={action.color} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.2 }}>
                  {action.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Today's check-in list (default tab) */}
      {tab === 'today' && data.upcomingArrivals.length > 0 && (
        <>
          <div className="m-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            🛬 Найближчі заїзди
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '1px 7px', background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
              {data.upcomingArrivals.length}
            </span>
          </div>
          {data.upcomingArrivals.slice(0, 5).map(a => (
            <div key={a.id} className="m-card" style={{ padding: '12px 14px', marginBottom: 8 }}>
              <div className="m-card-row" style={{ alignItems: 'center' }}>
                <div>
                  <div className="m-card-title">{a.first_name} {a.last_name}</div>
                  <div className="m-card-subtitle">{a.unit_code} · {a.nights} ноч. · {a.check_in}</div>
                </div>
                {a.status === 'confirmed' ? (
                  <button
                    onClick={async () => {
                      await fetch(`/api/bookings/${a.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'checked_in' }),
                      });
                      fetchData();
                    }}
                    style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent-primary)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Заселити
                  </button>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(20,184,166,0.15)', color: '#14b8a6' }}>
                    Заселено
                  </span>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
