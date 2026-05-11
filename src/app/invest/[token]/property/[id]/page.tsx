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
          const trendStr = (cur: number | null, prev: number | null, unit: 'pp' | '%') => {
            if (cur == null || prev == null) return null;
            const delta = unit === 'pp' ? cur - prev : (prev === 0 ? 0 : ((cur - prev) / prev) * 100);
            const sign = delta >= 0 ? '↑' : '↓';
            const color = delta >= 0 ? '#16a34a' : '#dc2626';
            return { text: `${sign} ${delta > 0 ? '+' : ''}${delta.toFixed(unit === 'pp' ? 1 : 0)}${unit}`, color };
          };
          const occTrend = trendStr(ops.occupancy_now_pct, ops.occupancy_prev_pct, 'pp');
          const adrTrend = trendStr(ops.adr_now, ops.adr_prev, '%');
          const revparTrend = trendStr(ops.revpar_now, ops.revpar_prev, '%');
          return (
            <div className="invest-ops-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
              <OpsMetric label="Occupancy" value={ops.occupancy_now_pct != null ? `${ops.occupancy_now_pct}%` : '—'} trend={occTrend} />
              <OpsMetric label="ADR" value={ops.adr_now != null ? `${ops.adr_now.toLocaleString('cs-CZ')} ${ops.currency}` : '—'} trend={adrTrend} />
              <OpsMetric label="RevPAR" value={ops.revpar_now != null ? `${ops.revpar_now.toLocaleString('cs-CZ')} ${ops.currency}` : '—'} trend={revparTrend} />
            </div>
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

function OpsMetric({ label, value, trend }: { label: string; value: string; trend: { text: string; color: string } | null }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#98a2b3', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {trend && (
        <div style={{ marginTop: 3, fontSize: 10, fontVariantNumeric: 'tabular-nums', color: trend.color }}>{trend.text}</div>
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
