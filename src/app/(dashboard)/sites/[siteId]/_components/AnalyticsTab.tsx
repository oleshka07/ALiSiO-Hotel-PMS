'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Chart } from "react-google-charts";
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  Globe,
  MapPin,
  Home,
  Target,
  BarChart3,
  Calendar,
  DollarSign
} from 'lucide-react';

interface AnalyticsTabProps {
  siteId: string;
  siteCurrency: string;
}

export function AnalyticsTab({ siteId, siteCurrency = 'CZK' }: AnalyticsTabProps) {
  const [activeSection, setActiveSection] = useState<'overview' | 'funnel' | 'traffic' | 'geo' | 'listings' | 'campaigns'>('overview');
  
  // Date Filters (default: 1st of current month to today)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [dateType, setDateType] = useState<'created_at' | 'check_in'>('created_at');
  
  // Currency Selector
  const [currency, setCurrency] = useState<'CZK' | 'EUR' | 'USD'>('CZK');
  
  // Funnel Sub-filter (Option A vs Option B)
  const [pageFilter, setPageFilter] = useState<string>('all');
  
  // Search & Pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Data State
  const [data, setData] = useState<any>(null);
  const [secondaryData, setSecondaryData] = useState<any>(null); // used to fetch traffic for overview pie chart
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Exchange rate definitions (referenced 23.5 for EUR)
  const exchangeRates = {
    CZK: 1,
    EUR: 23.5,
    USD: 22.0
  };

  const formatValue = (czkVal: number) => {
    const rate = exchangeRates[currency];
    const converted = Math.round(czkVal / rate);
    
    if (currency === 'EUR') {
      return `€${converted.toLocaleString('en-US')}`;
    }
    if (currency === 'USD') {
      return `$${converted.toLocaleString('en-US')}`;
    }
    return `${converted.toLocaleString('cs-CZ')} CZK`;
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Build query string
      let url = `/api/booking-sites/${siteId}/analytics/${activeSection}?date_from=${dateFrom}&date_to=${dateTo}&date_type=${dateType}`;
      
      if (activeSection === 'funnel') {
        url += `&pageFilter=${pageFilter}`;
      } else if (activeSection === 'traffic' || activeSection === 'campaigns') {
        url += `&page=${currentPage}&limit=${itemsPerPage}`;
      }
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Не вдалося завантажити аналітичні дані');
      const json = await res.json();
      setData(json);

      // If active section is overview, also fetch top traffic sources to draw the pie chart
      if (activeSection === 'overview') {
        const trafficRes = await fetch(`/api/booking-sites/${siteId}/analytics/traffic?date_from=${dateFrom}&date_to=${dateTo}&date_type=${dateType}&limit=5`);
        if (trafficRes.ok) {
          const trafficJson = await trafficRes.json();
          setSecondaryData(trafficJson?.data || []);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Сталася помилка при завантаженні даних');
    } finally {
      setLoading(false);
    }
  }, [siteId, activeSection, dateFrom, dateTo, dateType, pageFilter, currentPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when switching section
  useEffect(() => {
    setCurrentPage(1);
    setSearchQuery('');
  }, [activeSection]);

  const renderDelta = (delta: number) => {
    if (delta > 0) {
      return (
        <span style={{ color: 'var(--accent-success)', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '12px', fontWeight: 600 }}>
          <TrendingUp size={14} /> +{delta}%
        </span>
      );
    }
    if (delta < 0) {
      return (
        <span style={{ color: 'var(--accent-danger)', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '12px', fontWeight: 600 }}>
          <TrendingDown size={14} /> {delta}%
        </span>
      );
    }
    return (
      <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', fontWeight: 500 }}>
        0%
      </span>
    );
  };

  const DonutChart = ({ items }: { items: { utm_source: string; sessions: number; bookings: number; revenue: number }[] }) => {
    const totalSessions = items.reduce((acc, item) => acc + item.sessions, 0);
    if (totalSessions === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: 13 }}>
          Немає даних про джерела сесій
        </div>
      );
    }

    const colors = ['#4f6ef7', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];
    
    // Draw SVG Donut segments
    const r = 40;
    const strokeWidth = 14;
    const circ = 2 * Math.PI * r;
    let accumulatedPercent = 0;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
          <svg width="110" height="110" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} fill="transparent" stroke="var(--border-primary)" strokeWidth={strokeWidth} />
            {items.map((item, idx) => {
              const percent = item.sessions / totalSessions;
              const strokeLength = percent * circ;
              const strokeOffset = circ - (accumulatedPercent * circ);
              accumulatedPercent += percent;
              const color = colors[idx % colors.length];

              return (
                <circle
                  key={idx}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="transparent"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${strokeLength} ${circ - strokeLength}`}
                  strokeDashoffset={strokeOffset}
                  transform="rotate(-90 50 50)"
                  style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                />
              );
            })}
          </svg>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{totalSessions}</span>
            <span style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>сесій</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 150 }}>
          {items.map((item, idx) => {
            const color = colors[idx % colors.length];
            const pct = Math.round((item.sessions / totalSessions) * 100);
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color }} />
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.utm_source}</span>
                </div>
                <span style={{ color: 'var(--text-secondary)' }}>{item.sessions} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Filter and Controls Bar */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          {/* Start Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
            <input
              type="date"
              className="form-input"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ width: 140, padding: '6px 10px' }}
            />
          </div>
          
          <span style={{ color: 'var(--text-tertiary)' }}>—</span>

          {/* End Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
            <input
              type="date"
              className="form-input"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ width: 140, padding: '6px 10px' }}
            />
          </div>

          {/* Date Type */}
          <select
            className="form-select"
            value={dateType}
            onChange={e => setDateType(e.target.value as any)}
            style={{ width: 180, padding: '6px 32px 6px 10px', backgroundPosition: 'right 8px center' }}
          >
            <option value="created_at">За датою створення</option>
            <option value="check_in">За датою заїзду</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Currency Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Валюта:</span>
            <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2, border: '1px solid var(--border-primary)' }}>
              {(['CZK', 'EUR', 'USD'] as const).map(cur => (
                <button
                  key={cur}
                  onClick={() => setCurrency(cur)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background: currency === cur ? 'var(--accent-primary)' : 'transparent',
                    color: currency === cur ? 'white' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>

          {/* Refresh Button */}
          <button className="btn btn-secondary" onClick={fetchData} style={{ padding: '6px 12px', height: 32 }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Оновити
          </button>
        </div>
      </div>

      {/* Main Content Layout */}
      <div style={{ display: 'flex', gap: 24, minHeight: 'calc(100vh - 220px)' }}>
        {/* Navigation Sidebar */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 90 }}>
            <button
              onClick={() => setActiveSection('overview')}
              className={`btn ${activeSection === 'overview' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 16px' }}
            >
              <BarChart3 size={16} />
              Загальний огляд
            </button>
            {siteId !== 'all' && (
              <button
                onClick={() => setActiveSection('funnel')}
                className={`btn ${activeSection === 'funnel' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 16px' }}
              >
                <Filter size={16} />
                Воронка конверсії
              </button>
            )}
            <button
              onClick={() => setActiveSection('traffic')}
              className={`btn ${activeSection === 'traffic' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 16px' }}
            >
              <Globe size={16} />
              Джерела трафіку
            </button>
            <button
              onClick={() => setActiveSection('geo')}
              className={`btn ${activeSection === 'geo' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 16px' }}
            >
              <MapPin size={16} />
              Географія
            </button>
            <button
              onClick={() => setActiveSection('listings')}
              className={`btn ${activeSection === 'listings' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 16px' }}
            >
              <Home size={16} />
              Категорії та житло
            </button>
            <button
              onClick={() => setActiveSection('campaigns')}
              className={`btn ${activeSection === 'campaigns' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 16px' }}
            >
              <Target size={16} />
              Кампанії (UTM)
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
              <Loader2 size={32} className="spin" style={{ color: 'var(--accent-primary)' }} />
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Завантаження аналітики...</span>
            </div>
          ) : error ? (
            <div className="card" style={{ borderLeft: '4px solid var(--accent-danger)', padding: 16 }}>
              <div style={{ fontWeight: 600, color: 'var(--accent-danger)' }}>Помилка завантаження</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{error}</div>
              <button className="btn btn-secondary btn-sm" onClick={fetchData} style={{ marginTop: 12 }}>
                Спробувати знову
              </button>
            </div>
          ) : !data ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Немає даних для відображення за обраний період.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              {/* SECTION: OVERVIEW */}
              {activeSection === 'overview' && data.current && data.previous && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* KPI Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Чистий дохід</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{formatValue(data.current.revenue)}</span>
                        {renderDelta(data.deltas.revenue)}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        vs {formatValue(data.previous.revenue)} в минулому
                      </span>
                    </div>

                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(234, 179, 8, 0.05)', borderColor: 'rgba(234, 179, 8, 0.2)' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#ca8a04', textTransform: 'uppercase', letterSpacing: 0.5 }}>Очікує оплату (До оплати)</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: '#ca8a04' }}>{formatValue(data.current.unpaidRevenue || 0)}</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Сума бронювань, які ще не оплачені
                      </span>
                    </div>

                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Бронювання</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{data.current.bookings}</span>
                        {renderDelta(data.deltas.bookings)}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        vs {data.previous.bookings} в минулому
                      </span>
                    </div>

                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Середній чек</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{formatValue(data.current.avgCheck)}</span>
                        {renderDelta(data.deltas.avgCheck)}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        vs {formatValue(data.previous.avgCheck)} в минулому
                      </span>
                    </div>

                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Конверсія %</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{data.current.conversion}%</span>
                        {renderDelta(data.deltas.conversion)}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        vs {data.previous.conversion}% в минулому
                      </span>
                    </div>
                  </div>

                  {/* Sessions KPI & Traffic Pie Chart */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', justifySelf: 'stretch', gap: 16 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Відвідуваність сайту (Сесії)</h4>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>{data.current.sessions}</span>
                        {renderDelta(data.deltas.sessions)}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        Кількість унікальних сесій користувачів, які відвідали сайт та взаємодіяли з віджетом бронювання.
                      </div>
                      <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Попередній період: <strong>{data.previous.sessions}</strong> сесій
                      </div>
                    </div>

                    <div className="card" style={{ display: 'flex', flexDirection: 'column', justifySelf: 'stretch', gap: 16 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Джерела відвідувань (Top 5)</h4>
                      {secondaryData ? (
                        <DonutChart items={secondaryData} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100 }}>
                          <Loader2 size={20} className="spin" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: FUNNEL */}
              {activeSection === 'funnel' && data.funnelWidget && (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Конверсійна воронка відвідувача</h4>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Поетапна аналітика дій від входу на сайт до повної оплати бронювання</p>
                    </div>

                    {/* Funnel subfilter toggle (Option A vs B) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Фільтр сторінок:</span>
                      <select
                        className="form-select"
                        value={pageFilter}
                        onChange={e => {
                          setPageFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        style={{ width: 220, padding: '4px 28px 4px 10px', fontSize: 12, backgroundPosition: 'right 6px center' }}
                      >
                        <option value="all">Всі сторінки разом (Option A)</option>
                        <option value="/">Тільки Головна сторінка (/)</option>
                        <option value="/booking">Тільки сторінка бронювання (/booking)</option>
                        <option value="/contact">Тільки контакти (/contact)</option>
                      </select>
                    </div>
                  </div>

                  {/* Funnel steps chart */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    {data.funnelWidget.map((stepItem: any, idx: number) => {
                      // Determine bar color based on category
                      let barColor = 'linear-gradient(90deg, #4f6ef7, #6382ff)';
                      if (stepItem.step === 1) barColor = 'linear-gradient(90deg, #60a5fa, #3b82f6)';
                      else if (stepItem.step === 2) barColor = 'linear-gradient(90deg, #4f6ef7, #6382ff)';
                      else if (stepItem.step >= 3 && stepItem.step <= 7) barColor = 'linear-gradient(90deg, #8b5cf6, #a78bfa)';
                      else if (stepItem.step === 8) barColor = 'linear-gradient(90deg, #fb923c, #f97316)';
                      else if (stepItem.step >= 9) barColor = 'linear-gradient(90deg, #34d399, #10b981)';

                      return (
                        <div key={stepItem.step} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          {/* Step number and name */}
                          <div style={{ width: 220, flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                width: 22,
                                height: 22,
                                borderRadius: '50%',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-primary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--text-secondary)'
                              }}>
                                {stepItem.step}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{stepItem.name}</span>
                            </div>
                          </div>

                          {/* Visualization Bar */}
                          <div style={{ flex: 1, height: 24, background: 'var(--bg-secondary)', borderRadius: 6, overflow: 'hidden', position: 'relative', border: '1px solid var(--border-primary)' }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.max(1, stepItem.conversionFromFirst)}%`,
                              background: barColor,
                              transition: 'width 0.5s ease',
                              borderRadius: 4
                            }} />
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              left: 12,
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#ffffff',
                              textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                            }}>
                              {stepItem.count.toLocaleString()}
                            </div>
                          </div>

                          {/* Conversion indicators */}
                          <div style={{ width: 180, display: 'flex', gap: 12, fontSize: 12, flexShrink: 0 }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ color: 'var(--text-tertiary)' }}>Загальна:</span>{' '}
                              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{stepItem.conversionFromFirst}%</span>
                            </div>
                            {idx > 0 && (
                              <div style={{ flex: 1 }}>
                                <span style={{ color: 'var(--text-tertiary)' }}>Крок:</span>{' '}
                                <span style={{ fontWeight: 700, color: 'var(--accent-info)' }}>{stepItem.conversionFromPrevious}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION: CONTACT LEADS FUNNEL */}
              {activeSection === 'funnel' && data.funnelContact && (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Воронка: Форми зворотного зв'язку</h4>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Конверсія лідів, що залишили заявку через контактну форму сайту</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    {data.funnelContact.map((stepItem: any, idx: number) => {
                      // Custom colors for contact funnel
                      let barColor = 'linear-gradient(90deg, #8b5cf6, #a78bfa)';
                      if (stepItem.step === 1) barColor = 'linear-gradient(90deg, #60a5fa, #3b82f6)';
                      else if (stepItem.step === 2) barColor = 'linear-gradient(90deg, #fb923c, #f97316)';
                      else if (stepItem.step === 3) barColor = 'linear-gradient(90deg, #4f6ef7, #6382ff)';
                      else if (stepItem.step >= 4) barColor = 'linear-gradient(90deg, #34d399, #10b981)';

                      return (
                        <div key={stepItem.step} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ width: 220, flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)'
                              }}>
                                {stepItem.step}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{stepItem.name}</span>
                            </div>
                          </div>

                          <div style={{ flex: 1, height: 24, background: 'var(--bg-secondary)', borderRadius: 6, overflow: 'hidden', position: 'relative', border: '1px solid var(--border-primary)' }}>
                            <div style={{
                              height: '100%', width: `${Math.max(1, stepItem.conversionFromFirst)}%`, background: barColor, transition: 'width 0.5s ease', borderRadius: 4
                            }} />
                            <div style={{
                              position: 'absolute', top: 0, left: 12, height: '100%', display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                            }}>
                              {stepItem.count.toLocaleString()}
                            </div>
                          </div>

                          <div style={{ width: 180, display: 'flex', gap: 12, fontSize: 12, flexShrink: 0 }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ color: 'var(--text-tertiary)' }}>Загальна:</span>{' '}
                              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{stepItem.conversionFromFirst}%</span>
                            </div>
                            {idx > 0 && (
                              <div style={{ flex: 1 }}>
                                <span style={{ color: 'var(--text-tertiary)' }}>Крок:</span>{' '}
                                <span style={{ fontWeight: 700, color: 'var(--accent-info)' }}>{stepItem.conversionFromPrevious}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION: TRAFFIC */}
              {activeSection === 'traffic' && data.data && Array.isArray(data.data) && (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Джерела переходу на сайт</h4>
                    
                    {/* Search Bar */}
                    <div style={{ position: 'relative', width: 240 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Пошук джерела..."
                        value={searchQuery}
                        onChange={e => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        style={{ paddingLeft: 32, height: 32 }}
                      />
                      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Джерело (UTM Source)</th>
                          <th style={{ textAlign: 'right' }}>Сесії</th>
                          <th style={{ textAlign: 'right' }}>Бронювання</th>
                          <th style={{ textAlign: 'right' }}>Дохід</th>
                          <th style={{ textAlign: 'right' }}>До оплати</th>
                          <th style={{ textAlign: 'right' }}>Конверсія %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const filtered = data.data.filter((item: any) =>
                            item.utm_source.toLowerCase().includes(searchQuery.toLowerCase())
                          );

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)' }}>
                                  Джерела за запитом не знайдені
                                </td>
                              </tr>
                            );
                          }

                          return filtered.map((item: any, idx: number) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.utm_source}</td>
                              <td style={{ textAlign: 'right' }}>{item.sessions.toLocaleString()}</td>
                              <td style={{ textAlign: 'right' }}>{item.bookings.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatValue(item.revenue)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#ca8a04' }}>{formatValue(item.unpaid_revenue || 0)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <span className={`badge ${item.conversion > 4 ? 'badge-success' : item.conversion > 1 ? 'badge-primary' : 'badge-primary'}`} style={{ minWidth: 48, justifyContent: 'center' }}>
                                  {item.conversion}%
                                </span>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {data.pagination && data.pagination.totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      >
                        Попередня
                      </button>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        Сторінка {currentPage} з {data.pagination.totalPages}
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={currentPage === data.pagination.totalPages}
                        onClick={() => setCurrentPage(prev => Math.min(data.pagination.totalPages, prev + 1))}
                      >
                        Наступна
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: GEOGRAPHY */}
              {activeSection === 'geo' && data.languages && data.countries && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Map Component */}
                  <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Карта відвідувань (Сесії)</h4>
                    <div style={{ height: 400, background: 'var(--bg-tertiary)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
                      <Chart
                        chartType="GeoChart"
                        width="100%"
                        height="400px"
                        data={[
                          ["Країна", "Сесії"],
                          ...data.countries.map((c: any) => [c.country_code || "Unknown", c.sessions])
                        ]}
                        options={{
                          colorAxis: { colors: ['#e0e7ff', '#4f6ef7'] },
                          backgroundColor: 'transparent',
                          datalessRegionColor: 'var(--bg-secondary)',
                          defaultColor: 'var(--bg-secondary)',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                  {/* Languages Column */}
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Мовні преференції</h4>
                    <div className="table-wrapper">
                      <table className="table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Мова</th>
                            <th style={{ textAlign: 'right' }}>Сесії</th>
                            <th style={{ textAlign: 'right' }}>Бронювання</th>
                            <th style={{ textAlign: 'right' }}>Дохід</th>
                            <th style={{ textAlign: 'right' }}>До оплати</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.languages.length === 0 ? (
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'center', padding: 12, color: 'var(--text-tertiary)' }}>Немає даних</td>
                            </tr>
                          ) : (
                            data.languages.map((item: any, idx: number) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 600 }}>{item.lang.toUpperCase()}</td>
                                <td style={{ textAlign: 'right' }}>{item.sessions}</td>
                                <td style={{ textAlign: 'right' }}>{item.bookings}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatValue(item.revenue)}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#ca8a04' }}>{formatValue(item.unpaid_revenue || 0)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Countries Column */}
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Країни (за Cloudflare Headers)</h4>
                    <div className="table-wrapper">
                      <table className="table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Країна</th>
                            <th style={{ textAlign: 'right' }}>Сесії</th>
                            <th style={{ textAlign: 'right' }}>Бронювання</th>
                            <th style={{ textAlign: 'right' }}>Дохід</th>
                            <th style={{ textAlign: 'right' }}>До оплати</th>
                            <th style={{ textAlign: 'right' }}>Конверсія %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.countries.length === 0 ? (
                            <tr>
                              <td colSpan={5} style={{ textAlign: 'center', padding: 12, color: 'var(--text-tertiary)' }}>Немає даних</td>
                            </tr>
                          ) : (
                            data.countries.map((item: any, idx: number) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 600 }}>{item.country_code || 'Невідомо'}</td>
                                <td style={{ textAlign: 'right' }}>{item.sessions}</td>
                                <td style={{ textAlign: 'right' }}>{item.bookings}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatValue(item.revenue)}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#ca8a04' }}>{formatValue(item.unpaid_revenue || 0)}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <span className={`badge ${item.conversion > 4 ? 'badge-success' : item.conversion > 1 ? 'badge-primary' : 'badge-primary'}`} style={{ minWidth: 48, justifyContent: 'center' }}>
                                    {item.conversion}%
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: LISTINGS */}
              {activeSection === 'listings' && data.unitTypes && data.categories && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                  {/* Unit Types Column */}
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Типи номерів / Об'єкти</h4>
                    <div className="table-wrapper">
                      <table className="table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Тип</th>
                            <th style={{ textAlign: 'right' }}>Бронювання</th>
                            <th style={{ textAlign: 'right' }}>Дохід</th>
                            <th style={{ textAlign: 'right' }}>До оплати</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.unitTypes.length === 0 ? (
                            <tr>
                              <td colSpan={3} style={{ textAlign: 'center', padding: 12, color: 'var(--text-tertiary)' }}>Немає даних</td>
                            </tr>
                          ) : (
                            data.unitTypes.map((item: any, idx: number) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 600 }}>{item.unit_type_name} ({item.unit_type_code})</td>
                                <td style={{ textAlign: 'right' }}>{item.bookings}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatValue(item.revenue)}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#ca8a04' }}>{formatValue(item.unpaid_revenue || 0)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Categories Column */}
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Категорії у віджеті</h4>
                    <div className="table-wrapper">
                      <table className="table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Категорія</th>
                            <th style={{ textAlign: 'right' }}>Бронювання</th>
                            <th style={{ textAlign: 'right' }}>Дохід</th>
                            <th style={{ textAlign: 'right' }}>До оплати</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.categories.length === 0 ? (
                            <tr>
                              <td colSpan={3} style={{ textAlign: 'center', padding: 12, color: 'var(--text-tertiary)' }}>Немає даних</td>
                            </tr>
                          ) : (
                            data.categories.map((item: any, idx: number) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 600 }}>{item.category_name} ({item.category_type})</td>
                                <td style={{ textAlign: 'right' }}>{item.bookings}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatValue(item.revenue)}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#ca8a04' }}>{formatValue(item.unpaid_revenue || 0)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: CAMPAIGNS */}
              {activeSection === 'campaigns' && data.data && Array.isArray(data.data) && (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>UTM Маркетингові кампанії</h4>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Детальна аналітика по рекламних каналах, медіа та назвах кампаній</p>
                    </div>

                    {/* Search Bar */}
                    <div style={{ position: 'relative', width: 240 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Пошук кампанії..."
                        value={searchQuery}
                        onChange={e => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        style={{ paddingLeft: 32, height: 32 }}
                      />
                      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Source</th>
                          <th>Medium</th>
                          <th>Campaign</th>
                          <th style={{ textAlign: 'right' }}>Сесії</th>
                          <th style={{ textAlign: 'right' }}>Бронювання</th>
                          <th style={{ textAlign: 'right' }}>Дохід</th>
                          <th style={{ textAlign: 'right' }}>До оплати</th>
                          <th style={{ textAlign: 'right' }}>Конверсія %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const filtered = data.data.filter((item: any) =>
                            item.utm_source.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.utm_medium.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.utm_campaign.toLowerCase().includes(searchQuery.toLowerCase())
                          );

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)' }}>
                                  Кампанії за запитом не знайдені
                                </td>
                              </tr>
                            );
                          }

                          return filtered.map((item: any, idx: number) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.utm_source}</td>
                              <td style={{ color: 'var(--text-secondary)' }}>{item.utm_medium}</td>
                              <td style={{ color: 'var(--text-secondary)' }}>{item.utm_campaign}</td>
                              <td style={{ textAlign: 'right' }}>{item.sessions.toLocaleString()}</td>
                              <td style={{ textAlign: 'right' }}>{item.bookings.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatValue(item.revenue)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#ca8a04' }}>{formatValue(item.unpaid_revenue || 0)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <span className="badge badge-primary" style={{ minWidth: 48, justifyContent: 'center' }}>
                                  {item.conversion}%
                                </span>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {data.pagination && data.pagination.totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      >
                        Попередня
                      </button>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        Сторінка {currentPage} з {data.pagination.totalPages}
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={currentPage === data.pagination.totalPages}
                        onClick={() => setCurrentPage(prev => Math.min(data.pagination.totalPages, prev + 1))}
                      >
                        Наступна
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
