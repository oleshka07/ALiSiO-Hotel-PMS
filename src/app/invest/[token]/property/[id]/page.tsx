'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Wallet, Activity, Clock, TrendingUp, ExternalLink, CheckCircle } from 'lucide-react';

interface PortalData {
  investor: { name: string };
  totals: { currency: string };
  properties: Array<{
    project_id: string; project_name: string; invested: number; equity_pct: number | null;
    currency: string; invested_at: string; status: string;
    monthly_profit: number; accumulated_profit: number; paid_out: number; pending: number;
    roi_pct: number | null; payback_years: number | null;
    last_metric_month: string | null; last_metric_occupancy: number | null;
    last_metric_revenue: number | null; work_stages: Array<{ name: string; pct: number }>;
    airbnb_url?: string | null;
  }>;
  capital_growth: Array<{ month: string; profit_cumulative: number }>;
  occupancy_dynamics: Array<{ month: string; occupancy_pct: number }>;
  monthly_reports: Array<{
    project_id: string; project_name: string; year_month: string;
    adr: number | null; general_comment: string | null;
    market_insight: string | null; photo_url: string | null;
  }>;
  payouts: Array<{
    id: string; paid_at: string; amount: number; currency: string;
    project_id: string | null; project_name: string | null;
    period_year_month: string | null; comment: string | null;
  }>;
  ops_metrics?: Record<string, {
    occupancy_now_pct: number | null;
    occupancy_prev_pct: number | null;
    adr_now: number | null;
    adr_prev: number | null;
    revpar_now: number | null;
    revpar_prev: number | null;
    currency: string;
  }>;
  asset_notes?: Record<string, { month: string; ceo_name: string | null; body_md: string | null }>;
  occupancy_by_month_per_asset?: Record<string, Array<{ month: string; occupancy_pct: number }>>;
  scenarios?: Record<string, Array<{
    scenario: 'pessimistic' | 'base' | 'optimistic';
    assumptions_json: string | null;
    monthly_cashback_projection_json: string | null;
    full_repayment_eta: string | null;
  }>>;
}

function fmt(n: number, cur: string): string {
  const value = Math.abs(n) < 1 ? 0 : n;
  return `${value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:      { label: 'Active',       color: '#22c55e' },
  in_progress: { label: 'In Progress',  color: '#f59e0b' },
  project:     { label: 'Project',      color: '#6366f1' },
  paused:      { label: 'Paused',       color: '#94a3b8' },
};

export default function PropertyDetailPage() {
  const params = useParams<{ token: string; id: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invest/${params.token}/portfolio`)
      .then(async (r) => {
        if (!r.ok) { const j = await r.json(); setError(j.error); return; }
        setData(await r.json());
      })
      .catch((e) => setError(e.message));
  }, [params.token]);

  if (error) return <div style={{ padding: 80, textAlign: 'center', color: '#dc2626' }}>{error}</div>;
  if (!data) return (
    <div className="invest-page-root">
      <header className="invest-topnav">
        <span className="invest-skel" style={{ width: 80, height: 16 }} />
      </header>
      <div className="invest-container">
        <span className="invest-skel" style={{ width: 160, height: 24, marginBottom: 8 }} />
        <span className="invest-skel" style={{ width: 280, height: 12, marginBottom: 16 }} />
        <div className="invest-skel-card"><span className="invest-skel" style={{ width: '50%', height: 28 }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {[1, 2, 3].map((i) => <div key={i} className="invest-skel-card" style={{ marginBottom: 0, textAlign: 'center' }}><span className="invest-skel" style={{ width: '70%', height: 18, margin: '0 auto' }} /></div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 12 }}>
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="invest-skel-card" style={{ marginBottom: 0 }}><span className="invest-skel" style={{ width: '70%', height: 18 }} /></div>)}
        </div>
      </div>
    </div>
  );

  const property = data.properties.find((p) => p.project_id === params.id);
  if (!property) return (
    <div style={{ padding: 80, textAlign: 'center' }}>
      <h1>Об&apos;єкт не знайдено</h1>
      <Link href={`/invest/${params.token}`} style={{ color: '#3b82f6' }}>← До портфеля</Link>
    </div>
  );

  const stat = STATUS_LABEL[property.status] || STATUS_LABEL.active;
  const reports = data.monthly_reports.filter((r) => r.project_id === params.id);
  const propertyPayouts = data.payouts.filter((p) => p.project_id === params.id);
  const recoveredPct = property.invested > 0 ? property.paid_out / property.invested * 100 : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', paddingBottom: 32 }}>
      <header className="invest-topnav">
        <Link href={`/invest/${params.token}`} style={{ color: '#0f172a', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} /> Портфель
        </Link>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{data.investor.name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Інвестор</div>
        </div>
      </header>

      <div className="invest-container invest-content" style={{ maxWidth: 1200 }}>
        <h1 style={{ margin: 0, marginBottom: 4, color: '#0f172a' }}>Деталі об&apos;єкта</h1>
        <p style={{ margin: 0, color: '#64748b' }}>Поточна результативність {property.project_name}</p>

        {/* Title card */}
        <div className="invest-asset-title-card" style={{ marginTop: 16, padding: 24, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div className="invest-asset-title-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: 'inline-block', padding: '4px 10px', background: `${stat.color}15`, color: stat.color, borderRadius: 4, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>{stat.label}</span>
              <h2 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>{property.project_name}</h2>
              {property.airbnb_url && (
                <a href={property.airbnb_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, padding: '6px 12px', background: '#fce7f3', color: '#be185d', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  <ExternalLink size={14} /> Переглянути на Airbnb
                </a>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Поточний APY</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: (property.roi_pct || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{property.roi_pct != null ? `${property.roi_pct}%` : '—'}</div>
            </div>
          </div>
        </div>

        {/* Hospitality Ops Metrics — ADR / RevPAR / Occupancy */}
        {data.ops_metrics?.[params.id] && (() => {
          const ops = data.ops_metrics[params.id];
          // Period labels for the tooltip — current month vs previous month
          const now = new Date();
          const monthNames = ['січень','лютий','березень','квітень','травень','червень','липень','серпень','вересень','жовтень','листопад','грудень'];
          const curMonth = monthNames[now.getMonth()];
          const prevMonth = monthNames[(now.getMonth() + 11) % 12];
          const periodLabel = `${curMonth} vs ${prevMonth}`;
          const trendStr = (cur: number | null, prev: number | null, unit: 'pp' | '%') => {
            if (cur == null || prev == null) return null;
            const delta = unit === 'pp' ? cur - prev : (prev === 0 ? 0 : ((cur - prev) / prev) * 100);
            const sign = delta >= 0 ? '↑' : '↓';
            const color = delta >= 0 ? '#16a34a' : '#dc2626';
            const tooltip = `${periodLabel}: ${prev?.toFixed(1) || '?'} → ${cur?.toFixed(1) || '?'}`;
            return { text: `${sign} ${delta > 0 ? '+' : ''}${delta.toFixed(unit === 'pp' ? 1 : 0)}${unit}`, color, tooltip };
          };
          const occTrend = trendStr(ops.occupancy_now_pct, ops.occupancy_prev_pct, 'pp');
          const adrTrend = trendStr(ops.adr_now, ops.adr_prev, '%');
          const revparTrend = trendStr(ops.revpar_now, ops.revpar_prev, '%');
          return (
            <>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 16, marginBottom: 4, textAlign: 'right' }}>Порівняння: {periodLabel}</div>
              <div className="invest-ops-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <OpsMetric label="Occupancy" value={ops.occupancy_now_pct != null ? `${ops.occupancy_now_pct}%` : '—'} trend={occTrend} />
                <OpsMetric label="ADR" value={ops.adr_now != null ? `${ops.adr_now.toLocaleString('cs-CZ')} ${ops.currency}` : '—'} trend={adrTrend} />
                <OpsMetric label="RevPAR" value={ops.revpar_now != null ? `${ops.revpar_now.toLocaleString('cs-CZ')} ${ops.currency}` : '—'} trend={revparTrend} />
              </div>
            </>
          );
        })()}

        {/* Per-asset occupancy dynamics (last 12 months) */}
        {data.occupancy_by_month_per_asset?.[params.id] && data.occupancy_by_month_per_asset[params.id].some((m) => m.occupancy_pct > 0) && (
          <div style={{ marginTop: 16, padding: 20, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>Динаміка Occupancy</h3>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Останні 12 місяців</span>
            </div>
            <AssetOccupancyBars data={data.occupancy_by_month_per_asset[params.id]} />
          </div>
        )}

        {/* Asset-level CEO note */}
        {data.asset_notes?.[params.id]?.body_md && (
          <div style={{ marginTop: 16, padding: 14, background: 'linear-gradient(135deg,#ffffff 0%,#f8faf9 100%)', border: '1px solid #e2e8f0', borderLeft: '3px solid #16a34a', borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
              {data.asset_notes[params.id].ceo_name || 'CEO'} · {data.asset_notes[params.id].month}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: '#0f172a', whiteSpace: 'pre-wrap' }}>
              {data.asset_notes[params.id].body_md}
            </div>
          </div>
        )}

        {/* Per-asset Forward Projection */}
        {data.scenarios?.[params.id] && data.scenarios[params.id].length > 0 && (
          <div style={{ marginTop: 16, padding: 20, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>Прогноз повного повернення</h3>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>3 сценарії</span>
            </div>
            <AssetForwardProjection
              scenarios={data.scenarios[params.id]}
              invested={property.invested}
              currency={property.currency}
            />
          </div>
        )}

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
          <KpiCard label="Вкладений капітал" value={fmt(property.invested, property.currency)} sub={`${recoveredPct.toFixed(1)}% повернуто`} barPct={recoveredPct} icon={<Wallet />} color="#3b82f6" />
          <KpiCard label="Виплачено" value={fmt(property.paid_out, property.currency)} sub={`${propertyPayouts.length} ${propertyPayouts.length === 1 ? 'виплата' : 'виплат'}`} icon={<CheckCircle />} color="#22c55e" />
          <KpiCard label="До виплати" value={fmt(property.pending, property.currency)} sub="Нараховано за поточний період" icon={<Clock />} color="#f59e0b" />
          <KpiCard label="Прибутковість" value={property.roi_pct != null ? `${property.roi_pct}%` : '—'} sub="Середній річний відсоток" icon={<Activity />} color="#22c55e" />
          <KpiCard label="Термін окупності" value={property.payback_years != null ? `${property.payback_years} років` : '—'} sub="Базований на середніх темпах" icon={<TrendingUp />} color="#6366f1" />
        </div>

        {/* Work stages */}
        {property.work_stages.length > 0 && (
          <div style={{ marginTop: 16, padding: 20, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, marginBottom: 12, fontSize: 16, color: '#0f172a' }}>Прогрес реалізації</h3>
            {property.work_stages.map((s, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                  <span>{s.name}</span>
                  <span>{s.pct}%</span>
                </div>
                <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, s.pct)}%`, background: s.pct >= 99 ? '#16a34a' : '#22c55e' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payouts for this property */}
        {propertyPayouts.length > 0 && (
          <div style={{ marginTop: 16, padding: 20, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, marginBottom: 12, fontSize: 16, color: '#0f172a' }}>Історія виплат</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Дата</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Період</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Сума</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Коментар</th>
                </tr>
              </thead>
              <tbody>
                {propertyPayouts.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px 12px', color: '#0f172a' }}>{p.paid_at}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{p.period_year_month || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{fmt(p.amount, p.currency)}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{p.comment || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Monthly reports for this property */}
        {reports.length > 0 && (
          <div style={{ marginTop: 16, padding: 20, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>Фінансова звітність</h3>
              <span style={{ fontSize: 11, color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>● ONLINE LIVE</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {reports.map((r) => (
                <div key={r.year_month} style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{r.year_month}</div>
                  <div style={{ fontWeight: 600, marginBottom: 6, color: '#0f172a' }}>{property.project_name}</div>
                  {r.adr != null && <div style={{ fontSize: 12, color: '#475569' }}>ADR: <b>{fmt(r.adr, property.currency)}</b></div>}
                  {r.general_comment && <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>{r.general_comment}</div>}
                  {r.market_insight && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' }}>📊 {r.market_insight}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ScenarioPoint { period: string; eur: number }

function safeParse<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

function AssetForwardProjection({ scenarios, invested, currency }: {
  scenarios: NonNullable<PortalData['scenarios']>[string];
  invested: number;
  currency: string;
}) {
  const aggregate = (key: 'pessimistic' | 'base' | 'optimistic') => {
    const sc = scenarios.find((x) => x.scenario === key);
    if (!sc) return { series: [] as Array<{ period: string; pct: number }>, eta: null as string | null, assumptions: null };
    const proj = safeParse<ScenarioPoint[]>(sc.monthly_cashback_projection_json) || [];
    let sum = 0;
    const series = proj.map((p) => {
      sum += p.eur;
      return { period: p.period, pct: invested > 0 ? Math.min(150, (sum / invested) * 100) : 0 };
    });
    return {
      series,
      eta: sc.full_repayment_eta,
      assumptions: safeParse<{ occupancy?: number; adr?: number; opex_growth?: number; notes?: string }>(sc.assumptions_json),
    };
  };

  const opt  = aggregate('optimistic');
  const base = aggregate('base');
  const pes  = aggregate('pessimistic');

  const allPeriods = [...new Set([...opt.series, ...base.series, ...pes.series].map((p) => p.period))].sort();
  if (allPeriods.length === 0) {
    return <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Сценарії задано, але без monthly projection JSON</div>;
  }

  const periodToIdx = new Map(allPeriods.map((p, i) => [p, i] as const));
  const W = 800, H = 200, PAD = 20;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2 - 12;
  const stepX = innerW / Math.max(1, allPeriods.length - 1);
  const xFor = (period: string) => PAD + (periodToIdx.get(period) || 0) * stepX;
  const yFor = (pct: number) => PAD + (innerH - (Math.min(100, pct) / 100) * innerH);
  const baseY = PAD + innerH;

  const toLinePath = (series: { period: string; pct: number }[]): string => {
    if (series.length === 0) return '';
    return series.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.period).toFixed(1)},${yFor(p.pct).toFixed(1)}`).join(' ');
  };

  const todayPeriod = new Date().toISOString().substring(0, 7);
  let todayX: number | null = null;
  for (let i = 0; i < allPeriods.length; i++) {
    if (allPeriods[i] <= todayPeriod) todayX = xFor(allPeriods[i]);
  }

  const fmtEta = (etaIso: string | null, fallbackSeries: { period: string; pct: number }[]) => {
    if (etaIso) return etaIso.substring(0, 7);
    const reached = fallbackSeries.find((p) => p.pct >= 100);
    return reached ? reached.period : '—';
  };

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="asset-band-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <line x1={PAD} y1={yFor(100)} x2={W - PAD} y2={yFor(100)} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2,3" />
        <text x={W - PAD - 4} y={yFor(100) - 3} fill="#94a3b8" fontSize="9" textAnchor="end">100%</text>

        {toLinePath(pes.series)  && <path d={toLinePath(pes.series)}  fill="none" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.45" />}
        {toLinePath(base.series) && <path d={toLinePath(base.series)} fill="none" stroke="#16a34a" strokeWidth="2.5" />}
        {toLinePath(opt.series)  && <path d={toLinePath(opt.series)}  fill="none" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.45" />}

        {todayX != null && (
          <line x1={todayX} y1={PAD} x2={todayX} y2={baseY} stroke="#04392c" strokeWidth="1" strokeDasharray="3,3" />
        )}

        {allPeriods.filter((p) => p.endsWith('-01') || p === allPeriods[0] || p === allPeriods[allPeriods.length - 1]).map((p) => (
          <text key={p} x={xFor(p)} y={H - 4} fill="#94a3b8" fontSize="9" textAnchor="middle">{p}</text>
        ))}
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
        {[
          { label: 'Песимістичний', value: fmtEta(pes.eta, pes.series), highlight: false },
          { label: 'Базовий',       value: fmtEta(base.eta, base.series), highlight: true },
          { label: 'Оптимістичний', value: fmtEta(opt.eta, opt.series), highlight: false },
        ].map((c) => (
          <div key={c.label} style={{
            padding: '10px 8px', borderRadius: 10, textAlign: 'center',
            background: c.highlight ? '#dcfce7' : '#f8fafc',
            border: `1px solid ${c.highlight ? '#16a34a' : '#e2e8f0'}`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: c.highlight ? '#047857' : '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.highlight ? '#047857' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {base.assumptions && (() => {
        const a = base.assumptions;
        const parts: string[] = [];
        if (a.occupancy != null)    parts.push(`occupancy ${(a.occupancy * 100).toFixed(0)}%`);
        if (a.adr != null)          parts.push(`ADR ${a.adr.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} CZK`);
        if (a.opex_growth != null)  parts.push(`OPEX growth +${(a.opex_growth * 100).toFixed(0)}%/рік`);
        if (parts.length === 0)     return null;
        return (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9', lineHeight: 1.5 }}>
            <b>Базовий сценарій:</b> {parts.join(' · ')}. Інвестиція: {invested.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} {currency}.
          </div>
        );
      })()}
    </div>
  );
}

function AssetOccupancyBars({ data }: { data: { month: string; occupancy_pct: number }[] }) {
  const max = Math.max(...data.map((d) => d.occupancy_pct), 100);
  const nonZero = data.filter((d) => d.occupancy_pct > 0);
  const avg = nonZero.length > 0 ? nonZero.reduce((s, d) => s + d.occupancy_pct, 0) / nonZero.length : 0;
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a', marginBottom: 12 }}>
        {avg.toFixed(1)}%
        <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginLeft: 8, fontWeight: 500 }}>середнє за період</span>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 140 }}>
        {data.map((d) => {
          const heightPct = (d.occupancy_pct / max) * 100;
          return (
            <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }} title={`${d.month}: ${d.occupancy_pct}%`}>
              <div style={{ fontSize: 10, fontWeight: 600, color: d.occupancy_pct > 0 ? '#16a34a' : 'transparent' }}>
                {d.occupancy_pct.toFixed(0)}%
              </div>
              <div style={{ width: '100%', height: `${Math.max(2, heightPct * 0.8)}%`, minHeight: 2, background: d.occupancy_pct > 0 ? '#22c55e' : '#e2e8f0', borderRadius: 3 }} />
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{d.month.substring(5)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpsMetric({ label, value, trend }: { label: string; value: string; trend: { text: string; color: string; tooltip?: string } | null }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#98a2b3', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {trend && (
        <div title={trend.tooltip} style={{ marginTop: 3, fontSize: 10, fontVariantNumeric: 'tabular-nums', color: trend.color, cursor: trend.tooltip ? 'help' : 'default' }}>{trend.text}</div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, barPct, icon, color }: { label: string; value: string; sub?: string; barPct?: number; icon: React.ReactNode; color: string }) {
  return (
    <div style={{ background: '#fff', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{value}</div>
      {sub && <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>{sub}</div>}
      {barPct != null && (
        <div style={{ marginTop: 10, height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, barPct))}%`, background: color }} />
        </div>
      )}
    </div>
  );
}
