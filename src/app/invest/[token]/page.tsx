'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Wallet, TrendingUp, Clock, Activity, ExternalLink, CheckCircle, FileText, Download } from 'lucide-react';

interface PortalData {
  investor: { id: string; name: string; email: string | null; status: string };
  totals: {
    invested: number; paid_out: number; pending: number;
    accumulated_profit: number; monthly_profit: number;
    annualised_yield_pct: number | null; payback_years: number | null;
    avg_occupancy_pct: number | null; active_lots: number; currency: string;
  };
  properties: Array<{
    project_id: string; project_name: string; invested: number; equity_pct: number | null;
    currency: string; invested_at: string; status: string;
    monthly_profit: number; accumulated_profit: number; paid_out: number; pending: number;
    roi_pct: number | null; payback_years: number | null;
    last_metric_month: string | null; last_metric_occupancy: number | null;
    last_metric_revenue: number | null; work_stages: Array<{ name: string; pct: number }>;
    airbnb_url?: string | null;
  }>;
  capital_growth: Array<{ month: string; invested: number; profit_cumulative: number }>;
  occupancy_dynamics: Array<{ month: string; occupancy_pct: number }>;
  income_by_source: Array<{ source: string; currency: string; total_share: number; reservations: number }>;
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
  // v2 fields
  cashback_status?: {
    status: 'ahead' | 'on_track' | 'slightly_behind' | 'behind' | 'no_schedule';
    cumulative_paid_eur: number;
    cumulative_planned_eur: number;
    delta_eur: number;
    delta_pct: number;
    total_planned_eur: number;
    next_planned_period: string | null;
    next_planned_amount_eur: number;
    schedule: Array<{ period: string; planned_eur: number }>;
    paid_periods: Array<{ period: string; eur: number }>;
  };
  occupancy_by_month?: Array<{ month: string; occupancy_pct: number }>;
  performance_scores?: Record<string, {
    score: 'above' | 'on_track' | 'below' | 'unknown';
    actual_apy: number | null;
    target_apy: number | null;
    ratio: number | null;
  }>;
  ceo_note?: {
    scope: string; scope_id: string; month: string;
    ceo_name: string | null; body_md: string | null; updated_at: string;
  } | null;
  documents?: Array<{
    id: string; type: string; name: string; file_size: number;
    mime_type: string | null; period_start: string | null; period_end: string | null;
    uploaded_at: string; business_unit_id: string | null; download_url: string;
  }>;
  scenarios?: Record<string, Array<{
    scenario: 'pessimistic' | 'base' | 'optimistic';
    assumptions_json: string | null;
    monthly_cashback_projection_json: string | null;
    full_repayment_eta: string | null;
  }>>;
  pulse?: {
    locked_in_nights_this_month: number;
    nights_in_month: number;
    total_available_nights_this_month: number;
    pipeline_inquiries_count: number;
    expected_inflow_next_30_days_eur: number;
    expected_inflow_by_currency: Array<{ currency: string; amount: number }>;
    fx_rate_warning: string | null;
  };
  ops_metrics?: Record<string, {
    occupancy_now_pct: number | null;
    occupancy_prev_pct: number | null;
    adr_now: number | null;
    adr_prev: number | null;
    revpar_now: number | null;
    revpar_prev: number | null;
    currency: string;
  }>;
}

interface ScenarioPoint { period: string; eur: number }

function safeParse<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

function aggregateScenario(
  scenarios: NonNullable<PortalData['scenarios']>,
  scenarioKey: 'pessimistic' | 'base' | 'optimistic',
): { series: ScenarioPoint[]; latestEta: string | null; assumptions: Array<{ buId: string; raw: string | null }> } {
  // Accumulate {period → eur} across all BUs
  const acc = new Map<string, number>();
  let latestEta: string | null = null;
  const assumptions: Array<{ buId: string; raw: string | null }> = [];

  for (const [buId, items] of Object.entries(scenarios)) {
    const sc = items.find((x) => x.scenario === scenarioKey);
    if (!sc) continue;
    assumptions.push({ buId, raw: sc.assumptions_json });
    if (sc.full_repayment_eta && (!latestEta || sc.full_repayment_eta > latestEta)) {
      latestEta = sc.full_repayment_eta;
    }
    const proj = safeParse<ScenarioPoint[]>(sc.monthly_cashback_projection_json);
    if (!proj || !Array.isArray(proj)) continue;
    for (const p of proj) {
      acc.set(p.period, (acc.get(p.period) || 0) + (p.eur || 0));
    }
  }

  const series = [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, eur]) => ({ period, eur }));
  return { series, latestEta, assumptions };
}

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  direct:      { label: 'Direct',       color: '#16a34a' },
  phone:       { label: 'Phone',        color: '#0891b2' },
  whatsapp:    { label: 'WhatsApp',     color: '#22c55e' },
  booking_com: { label: 'Booking.com',  color: '#003580' },
  airbnb:      { label: 'Airbnb',       color: '#ff5a5f' },
  other_ota:   { label: 'Other OTA',    color: '#94a3b8' },
};

function fmt(n: number, cur: string): string {
  // Round sub-1 cents (positive or negative) to zero — investor doesn't care
  // about €0.10 left "owed" from rounding (request #8).
  const value = Math.abs(n) < 1 ? 0 : n;
  return `${value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:      { label: 'Active',       color: '#22c55e' },
  in_progress: { label: 'In Progress',  color: '#f59e0b' },
  project:     { label: 'Project',      color: '#6366f1' },
  paused:      { label: 'Paused',       color: '#94a3b8' },
};

const CASHBACK_STATUS_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  ahead:           { label: 'Ahead of plan',  bg: 'rgba(34,197,94,0.18)',  fg: '#16a34a', dot: '#16a34a' },
  on_track:        { label: 'On Track',       bg: 'rgba(34,197,94,0.18)',  fg: '#16a34a', dot: '#16a34a' },
  slightly_behind: { label: 'Slightly behind', bg: 'rgba(245,158,11,0.18)', fg: '#b45309', dot: '#f59e0b' },
  behind:          { label: 'Behind',         bg: 'rgba(220,38,38,0.15)',  fg: '#b91c1c', dot: '#dc2626' },
  no_schedule:     { label: 'No schedule',    bg: 'rgba(148,163,184,0.18)', fg: '#475569', dot: '#94a3b8' },
};

const PERFORMANCE_META: Record<string, { color: string; label: string }> = {
  above:    { color: '#16a34a', label: 'Above plan' },
  on_track: { color: '#f59e0b', label: 'On track' },
  below:    { color: '#dc2626', label: 'Below plan' },
  unknown:  { color: '#94a3b8', label: 'No target set' },
};

const DOC_TYPE_LABEL: Record<string, string> = {
  agreement:      'Договір',
  monthly_report: 'Звіт',
  tax_statement:  'Податковий',
  bank_statement: 'Виписка',
  other:          'Інше',
};

const DOC_TYPE_COLOR: Record<string, string> = {
  agreement:      '#3b82f6',
  monthly_report: '#16a34a',
  tax_statement:  '#f59e0b',
  bank_statement: '#7c3aed',
  other:          '#64748b',
};

/** Very small markdown renderer: bold (**), italic (*), and paragraphs.
 *  Adequate for CEO notes; falls back to plain text safely. */
function renderMarkdown(md: string): React.ReactNode {
  const paragraphs = md.split(/\n\s*\n/);
  return paragraphs.map((p, i) => {
    // Process inline: **bold** then *italic*
    const tokens: React.ReactNode[] = [];
    let rest = p;
    let key = 0;
    while (rest.length > 0) {
      const boldMatch = rest.match(/\*\*(.+?)\*\*/);
      const italicMatch = rest.match(/\*(.+?)\*/);
      const m = boldMatch && (!italicMatch || boldMatch.index! <= italicMatch.index!) ? boldMatch : italicMatch;
      if (!m || m.index === undefined) { tokens.push(rest); break; }
      if (m.index > 0) tokens.push(rest.substring(0, m.index));
      const isBold = m === boldMatch;
      tokens.push(isBold
        ? <b key={`b${key++}`}>{m[1]}</b>
        : <i key={`i${key++}`}>{m[1]}</i>);
      rest = rest.substring(m.index + m[0].length);
    }
    return <p key={i} style={{ margin: i > 0 ? '8px 0 0' : 0 }}>{tokens}</p>;
  });
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function InvestorPortalPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invest/${params.token}/portfolio`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json();
          setError(j.error || 'Unable to load');
          return;
        }
        setData(await r.json());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  if (loading) return <PortalSkeleton />;
  if (error || !data) return (
    <div style={{ padding: 80, textAlign: 'center' }}>
      <h1>404</h1><p style={{ color: '#94a3b8' }}>{error || 'Portal not found'}</p>
    </div>
  );

  const t = data.totals;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', padding: '0' }}>
      {/* Header */}
      <header className="invest-topnav">
        <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#16a34a,#22c55e)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, flexShrink: 0 }}>A</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Swipe Scape Investment</div>
          <div className="invest-topnav-brand-sub" style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Portfolio</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{data.investor.name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Investor</div>
        </div>
      </header>

      <div className="invest-container invest-content">
        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>Мій інвестиційний портфель</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b' }}>Сумарні показники по всім вашим активам.</p>
        </div>

        {/* CEO Monthly Note */}
        {data.ceo_note?.body_md && (
          <div style={{ background: 'linear-gradient(135deg,#ffffff 0%,#f8faf9 100%)', border: '1px solid #e2e8f0', borderLeft: '3px solid #16a34a', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#04392c,#065f46)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>
                {(data.ceo_note.ceo_name || 'C').charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{data.ceo_note.ceo_name || 'CEO'} · CEO</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Місячний звіт · {data.ceo_note.month}</div>
              </div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: '#0f172a' }}>
              {renderMarkdown(data.ceo_note.body_md)}
            </div>
          </div>
        )}

        {/* Hero summary card */}
        <div className="invest-hero" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)', borderRadius: 16, padding: 32, marginBottom: 24, color: '#fff' }}>
          <div className="invest-hero-flex">
            <div style={{ flex: 1 }}>
              {(() => {
                const cb = data.cashback_status;
                const meta = cb ? CASHBACK_STATUS_META[cb.status] : null;
                return meta ? (
                  <div
                    title={cb ? `Виплачено ${cb.cumulative_paid_eur.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} EUR з планованих на сьогодні ${cb.cumulative_planned_eur.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} EUR (deltaPct ${cb.delta_pct}%)` : undefined}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: meta.bg, color: meta.fg, borderRadius: 999, fontSize: 11, fontWeight: 600, marginBottom: 12, letterSpacing: 0.03 }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot }} />
                    {meta.label}
                  </div>
                ) : (
                  <div style={{ display: 'inline-block', padding: '4px 10px', background: 'rgba(34,197,94,0.2)', color: '#86efac', borderRadius: 999, fontSize: 11, fontWeight: 600, marginBottom: 12 }}>Active Portfolio</div>
                );
              })()}
              <h2 className="invest-hero-title" style={{ margin: 0, fontSize: 28, marginBottom: 8 }}>Сумарна статистика</h2>
              <p className="invest-hero-desc" style={{ margin: 0, opacity: 0.85, fontSize: 14, lineHeight: 1.5 }}>
                Ваш портфель включає <b>{t.active_lots}</b> {t.active_lots === 1 ? 'актив' : 'активів'}. Ми постійно
                оптимізуємо операційні витрати для забезпечення стабільного пасивного доходу.
              </p>
            </div>
            <div className="invest-hero-stats" style={{ minWidth: 280 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Stat label="Кількість лотів" value={String(t.active_lots)} />
                <Stat label="Прогноз окупності" value={t.payback_years ? `~${t.payback_years}р` : '—'} />
              </div>
              {t.avg_occupancy_pct != null && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase' }}>Середній Occupancy Rate</span>
                    <span style={{ fontSize: 28, fontWeight: 700 }}>{t.avg_occupancy_pct}%</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, t.avg_occupancy_pct)}%`, background: '#22c55e' }} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Live Operations Pulse */}
        {data.pulse && (
          <div style={{ background: 'linear-gradient(135deg,#ffffff 0%,#f5fbf8 100%)', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Що відбувається зараз</div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#047857', fontWeight: 600 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', animation: 'pulse 2s ease-in-out infinite' }} />
                LIVE
              </span>
            </div>
            <div className="invest-pulse-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
              <PulseStat
                label="Цей місяць locked-in"
                value={`${data.pulse.locked_in_nights_this_month} ${data.pulse.locked_in_nights_this_month === 1 ? 'ніч' : 'ночей'}`}
                sub={`${data.pulse.total_available_nights_this_month > 0 ? Math.round((data.pulse.locked_in_nights_this_month / data.pulse.total_available_nights_this_month) * 100) : 0}% завантаження`}
                tooltip={`З ${data.pulse.total_available_nights_this_month} доступних ночей (днів у місяці × кількість об'єктів)`}
              />
              <PulseStat
                label="Попередні запити · 14 днів"
                value={`+${data.pulse.pipeline_inquiries_count} ${data.pulse.pipeline_inquiries_count === 1 ? 'запит' : 'запитів'}`}
                sub="попередні, не підтверджені"
                tooltip="Reservations зі статусом «tentative» на наступні 14 днів — гості ще можуть скасувати"
              />
              <PulseStat
                label="Очікувані надходження · 30 днів"
                value={fmt(data.pulse.expected_inflow_next_30_days_eur, 'EUR')}
                sub="ваша частка з підтверджених бронювань"
                accent
                tooltip={(() => {
                  const breakdown = data.pulse.expected_inflow_by_currency.map((b) => `${b.amount.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${b.currency}`).join(' + ');
                  const base = `Ваша частка (equity_pct × total_price) з підтверджених бронювань (check-in у наступні 30 днів) на ваших об'єктах. Конвертовано в EUR за поточним курсом.\n\nРаз-валюта: ${breakdown || '—'}`;
                  return data.pulse.fx_rate_warning ? `${base}\n\n⚠ ${data.pulse.fx_rate_warning}` : base;
                })()}
              />
            </div>
          </div>
        )}

        {/* Cashback Schedule Timeline — графік повернення капіталу */}
        {data.cashback_status && data.cashback_status.schedule.length > 0 && (
          <Card title="Графік повернення капіталу" subtitle="Plan vs Actual" style={{ marginBottom: 24 }}>
            <CashbackTimeline status={data.cashback_status} currency={t.currency} />
          </Card>
        )}

        {/* Forward Projection fan chart */}
        {data.scenarios && Object.keys(data.scenarios).length > 0 && (
          <Card title="Прогноз повного повернення" subtitle="3 сценарії" style={{ marginBottom: 24 }}>
            <ForwardProjection scenarios={data.scenarios} totalInvested={t.invested} currency={t.currency} />
          </Card>
        )}

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <KpiCard label="Вкладений капітал" value={fmt(t.invested, t.currency)} sub={t.invested > 0 ? `${(t.paid_out / t.invested * 100).toFixed(1)}% повернуто` : undefined} barPct={t.invested > 0 ? (t.paid_out / t.invested * 100) : 0} icon={<Wallet />} color="#3b82f6" />
          <KpiCard label="Виплачено" value={fmt(t.paid_out, t.currency)} sub={`${data.payouts.length} ${data.payouts.length === 1 ? 'виплата' : 'виплат'}`} icon={<CheckCircle />} color="#22c55e" />
          <KpiCard label="До виплати" value={fmt(t.pending, t.currency)} sub="Нараховано за поточний період" icon={<Clock />} color={t.pending >= 0 ? '#f59e0b' : '#ef4444'} highlight />
          <KpiCard label="Прибутковість" value={t.annualised_yield_pct != null ? `${t.annualised_yield_pct}%` : '—'} sub="Середній річний відсоток" icon={<Activity />} color="#22c55e" />
          <KpiCard label="Термін окупності" value={t.payback_years ? `${t.payback_years} років` : '—'} sub="Базований на середніх темпах" icon={<TrendingUp />} color="#6366f1" />
        </div>

        {/* Asset allocation table */}
        <Card title="Розподіл активів у портфелі">
          <table className="invest-assets-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>Об&apos;єкт</th>
                <th style={th}>Інвестовано</th>
                <th style={{ ...th, textAlign: 'right' }}>Накопичений профіт</th>
                <th style={{ ...th, textAlign: 'right' }}>% від інвестиції</th>
                <th style={{ ...th, textAlign: 'right' }}>APY</th>
                <th style={{ ...th, width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.properties.map((p) => {
                const perf = data.performance_scores?.[p.project_id];
                const perfMeta = perf ? PERFORMANCE_META[perf.score] : PERFORMANCE_META.unknown;
                const cumulativeProfit = p.accumulated_profit;
                const profitPct = p.invested > 0 ? (cumulativeProfit / p.invested) * 100 : 0;
                return (
                  <tr key={p.project_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ ...td, fontWeight: 600, color: '#0f172a', position: 'relative', paddingLeft: 18 }}>
                      <span
                        title={perf ? `${perfMeta.label}${perf.actual_apy != null ? ` (actual ${(perf.actual_apy * 100).toFixed(1)}% vs target ${perf.target_apy != null ? (perf.target_apy * 100).toFixed(1) + '%' : '?'})` : ''}` : 'No target_apy set on investment'}
                        style={{
                          position: 'absolute', left: 8, top: 12, bottom: 12,
                          width: 4, background: perfMeta.color, borderRadius: 2,
                        }} />
                      {p.project_name}
                    </td>
                    <td style={{ ...td, color: '#0f172a' }}>{fmt(p.invested, p.currency)}</td>
                    <td style={{ ...td, textAlign: 'right', color: cumulativeProfit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(cumulativeProfit, p.currency)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: profitPct >= 0 ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                      {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: (p.roi_pct || 0) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {p.roi_pct != null ? `${p.roi_pct >= 0 ? '+' : ''}${p.roi_pct}%` : '—'}
                    </td>
                    <td style={td}>
                      <Link href={`/invest/${params.token}/property/${p.project_id}`} style={{ color: '#3b82f6', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        Деталі <ExternalLink size={11} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {data.properties.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>Інвестицій ще немає</td></tr>
              )}
            </tbody>
          </table>
          {/* Performance indicator legend */}
          <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 10, background: '#16a34a', borderRadius: 2 }} /> Above plan
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 10, background: '#f59e0b', borderRadius: 2 }} /> On track
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 10, background: '#dc2626', borderRadius: 2 }} /> Below plan
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 10, background: '#94a3b8', borderRadius: 2 }} /> No target
            </span>
          </div>
        </Card>

        {/* Capital growth chart + Occupancy dynamics — hide both sides if empty */}
        {(data.capital_growth.some((p) => p.profit_cumulative > 0) || (data.occupancy_by_month && data.occupancy_by_month.some((m) => m.occupancy_pct > 0))) && (
        <div className="invest-row-2col">
          {data.capital_growth.some((p) => p.profit_cumulative > 0) ? (
            <Card title="Графік зростання капіталу" subtitle="Накопичений прибуток за період">
              <CapitalGrowthChart data={data.capital_growth} currency={t.currency} />
            </Card>
          ) : null}
          {(data.occupancy_by_month && data.occupancy_by_month.some((m) => m.occupancy_pct > 0)) ? (
            <Card title="Динаміка Occupancy" subtitle="Останні 12 місяців">
              {(() => {
                const vals = (data.occupancy_by_month || []).filter((m) => m.occupancy_pct > 0).map((m) => m.occupancy_pct);
                const avg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
                return (
                  <div>
                    <div style={{ fontSize: 36, fontWeight: 700, color: '#16a34a' }}>{avg.toFixed(1)}%</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 16 }}>середнє за 12 міс</div>
                    <OccupancyBars data={data.occupancy_by_month || []} />
                  </div>
                );
              })()}
            </Card>
          ) : null}
        </div>
        )}

        {/* Income by source — derived from real reservations × equity */}
        {data.income_by_source.length > 0 && (
          <Card title="Дохід за джерелами" subtitle="Розподіл за кількістю бронювань (по виїзду)" style={{ marginTop: 16 }}>
            <SourceBreakdown items={data.income_by_source} />
          </Card>
        )}

        {/* Documents vault */}
        {data.documents && data.documents.length > 0 && (
          <Card title="Документи" subtitle={`${data.documents.length} ${data.documents.length === 1 ? 'файл' : 'файлів'}`} style={{ marginTop: 16 }}>
            <DocumentsList items={data.documents} />
          </Card>
        )}

        {/* Payouts history */}
        {data.payouts.length > 0 && (
          <Card title="Історія виплат" subtitle={`${data.payouts.length} ${data.payouts.length === 1 ? 'запис' : 'записів'}`} style={{ marginTop: 16 }}>
            <PayoutsTable items={data.payouts} />
          </Card>
        )}

        {/* Monthly reports */}
        {data.monthly_reports.length > 0 && (
          <Card title="Фінансова звітність" style={{ marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {data.monthly_reports.slice(0, 6).map((r) => (
                <div key={`${r.project_id}-${r.year_month}`} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{r.year_month}</div>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: '#0f172a' }}>{r.project_name}</div>
                  {r.general_comment && <div style={{ fontSize: 12, color: '#475569' }}>{r.general_comment.substring(0, 100)}{r.general_comment.length > 100 ? '…' : ''}</div>}
                  <Link href={`/invest/${params.token}/property/${r.project_id}`} style={{ display: 'inline-block', marginTop: 8, color: '#3b82f6', fontSize: 12, textDecoration: 'none' }}>Відкрити звіт →</Link>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div style={{ marginTop: 32, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
          Swipe Scape Investment · Дані оновлюються автоматично · Конфіденційно
        </div>
      </div>
    </div>
  );
}

function PortalSkeleton() {
  return (
    <div className="invest-page-root">
      <header className="invest-topnav">
        <span className="invest-skel" style={{ width: 36, height: 36, borderRadius: 8 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="invest-skel" style={{ width: 160, height: 14, marginBottom: 4 }} />
          <span className="invest-skel" style={{ width: 60, height: 10 }} />
        </div>
      </header>
      <div className="invest-container">
        <span className="invest-skel" style={{ width: 240, height: 28, marginBottom: 8 }} />
        <span className="invest-skel" style={{ width: 320, height: 14, marginBottom: 24 }} />
        <div className="invest-skel-card">
          <span className="invest-skel" style={{ width: 100, height: 12, marginBottom: 12 }} />
          <span className="invest-skel" style={{ width: '60%', height: 22, marginBottom: 8 }} />
          <span className="invest-skel" style={{ width: '90%', height: 12 }} />
        </div>
        <div style={{ background: 'linear-gradient(135deg,#064e3b 0%,#065f46 100%)', borderRadius: 16, padding: 32, marginBottom: 24, color: '#fff' }}>
          <span className="invest-skel" style={{ width: 120, height: 24, marginBottom: 12, background: 'rgba(255,255,255,0.2)', backgroundImage: 'none' }} />
          <span className="invest-skel" style={{ width: 200, height: 32, marginBottom: 16, background: 'rgba(255,255,255,0.2)', backgroundImage: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="invest-skel-card" style={{ marginBottom: 0 }}>
              <span className="invest-skel" style={{ width: 80, height: 10, marginBottom: 12 }} />
              <span className="invest-skel" style={{ width: '70%', height: 22 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function KpiCard({ label, value, sub, barPct, icon, color, highlight }: { label: string; value: string; sub?: string; barPct?: number; icon: React.ReactNode; color: string; highlight?: boolean }) {
  return (
    <div style={{ background: '#fff', padding: 18, borderRadius: 12, border: highlight ? `1px solid ${color}40` : '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: highlight ? color : '#0f172a' }}>{value}</div>
      {sub && <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>{sub}</div>}
      {barPct != null && (
        <div style={{ marginTop: 10, height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, barPct))}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

function Card({ title, subtitle, children, style }: { title: string; subtitle?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>{title}</h3>
        {subtitle && <span style={{ fontSize: 11, color: '#94a3b8' }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function CapitalGrowthChart({ data, currency }: { data: { month: string; profit_cumulative: number }[]; currency: string }) {
  if (data.length === 0) return <div style={{ color: '#94a3b8', padding: 20 }}>Поки немає даних</div>;
  const max = Math.max(...data.map((d) => d.profit_cumulative), 1);
  const W = 600, H = 200, P = 30;
  const xStep = (W - P * 2) / Math.max(1, data.length - 1);
  const xFor = (i: number) => P + i * xStep;
  const yFor = (v: number) => H - P - (v / max) * (H - P * 2);
  const points = data.map((d, i) => `${xFor(i)},${yFor(d.profit_cumulative)}`).join(' ');

  // Show X labels for first, middle, last + every ~3rd in between to avoid clutter
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="cgrow-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16a34a" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* baseline */}
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="#e2e8f0" />
      {/* gradient area under curve */}
      <path
        d={`M${xFor(0)},${H - P} ${data.map((d, i) => `L${xFor(i)},${yFor(d.profit_cumulative)}`).join(' ')} L${xFor(data.length - 1)},${H - P} Z`}
        fill="url(#cgrow-fill)"
      />
      <polyline points={points} fill="none" stroke="#16a34a" strokeWidth="2" />
      {data.map((d, i) => (
        <g key={i}>
          {/* dot with tooltip */}
          <circle cx={xFor(i)} cy={yFor(d.profit_cumulative)} r="4" fill="#16a34a" stroke="#fff" strokeWidth="1.5">
            <title>{`${d.month}: ${d.profit_cumulative.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currency}`}</title>
          </circle>
          {/* tap target for mobile */}
          <rect x={xFor(i) - 12} y={yFor(d.profit_cumulative) - 12} width={24} height={24} fill="transparent">
            <title>{`${d.month}: ${d.profit_cumulative.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currency}`}</title>
          </rect>
          {/* X-label every Nth point */}
          {(i === 0 || i === data.length - 1 || i % labelEvery === 0) && (
            <text x={xFor(i)} y={H - 10} fontSize="10" fill="#94a3b8" textAnchor="middle">{d.month}</text>
          )}
        </g>
      ))}
      {/* current value pinned at top-right */}
      <text x={W - P} y={20} fontSize="12" fill="#16a34a" fontWeight="600" textAnchor="end">
        {data[data.length - 1]?.profit_cumulative.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} {currency}
      </text>
      {/* "Наведіть для деталей" hint */}
      <text x={P} y={20} fontSize="10" fill="#94a3b8">Наведіть курсор на точку для деталей</text>
    </svg>
  );
}

function SourceBreakdown({ items }: { items: Array<{ source: string; currency: string; total_share: number; reservations: number }> }) {
  // Aggregate by source across currencies — we only display reservation counts.
  const aggregated = new Map<string, number>();
  for (const it of items) {
    aggregated.set(it.source, (aggregated.get(it.source) || 0) + it.reservations);
  }
  const rows = [...aggregated.entries()]
    .map(([source, reservations]) => ({ source, reservations }))
    .sort((a, b) => b.reservations - a.reservations);
  const totalRes = rows.reduce((s, x) => s + x.reservations, 0);
  if (totalRes === 0) return <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>Поки немає даних</div>;
  return (
    <div>
      <div style={{ display: 'flex', height: 18, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
        {rows.map((it) => {
          const meta = SOURCE_LABEL[it.source] || { label: it.source, color: '#64748b' };
          const pct = (it.reservations / totalRes) * 100;
          return (
            <div key={it.source} style={{ width: `${pct}%`, background: meta.color }}
                 title={`${meta.label}: ${pct.toFixed(1)}% (${it.reservations} брон.)`} />
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {rows.map((it) => {
          const meta = SOURCE_LABEL[it.source] || { label: it.source, color: '#64748b' };
          const pct = (it.reservations / totalRes) * 100;
          return (
            <div key={it.source} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, background: meta.color, borderRadius: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{meta.label}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{pct.toFixed(0)}%</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>{it.reservations} брон.</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ForwardProjection({ scenarios, totalInvested, currency }: {
  scenarios: NonNullable<PortalData['scenarios']>;
  totalInvested: number;
  currency: string;
}) {
  const opt  = aggregateScenario(scenarios, 'optimistic');
  const base = aggregateScenario(scenarios, 'base');
  const pes  = aggregateScenario(scenarios, 'pessimistic');

  // Cumulative series per scenario, projected as % of totalInvested.
  const cumulative = (series: ScenarioPoint[]) => {
    let sum = 0;
    return series.map((p) => { sum += p.eur; return { period: p.period, pct: totalInvested > 0 ? Math.min(150, (sum / totalInvested) * 100) : 0 }; });
  };
  const cOpt  = cumulative(opt.series);
  const cBase = cumulative(base.series);
  const cPes  = cumulative(pes.series);

  // Union of periods, sorted
  const allPeriods = [...new Set([...cOpt, ...cBase, ...cPes].map((p) => p.period))].sort();
  if (allPeriods.length === 0) {
    return <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Сценарії поки не задані</div>;
  }

  const periodToIdx = new Map(allPeriods.map((p, i) => [p, i] as const));
  const W = 800, H = 200, PAD = 20;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2 - 12; // reserve bottom for x-labels
  const stepX = innerW / Math.max(1, allPeriods.length - 1);

  // Helper: turn a cumulative series → path string mapped onto axes
  const xFor = (period: string) => PAD + (periodToIdx.get(period) || 0) * stepX;
  const yFor = (pct: number) => PAD + (innerH - (Math.min(100, pct) / 100) * innerH);
  const baseY = PAD + innerH;

  const toLinePath = (series: { period: string; pct: number }[]): string => {
    if (series.length === 0) return '';
    return series.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.period).toFixed(1)},${yFor(p.pct).toFixed(1)}`).join(' ');
  };

  const linePes  = toLinePath(cPes);
  const lineBase = toLinePath(cBase);
  const lineOpt  = toLinePath(cOpt);

  // Areas between bounds
  const areaBetween = (top: { period: string; pct: number }[], bottom: { period: string; pct: number }[]): string => {
    if (top.length === 0 || bottom.length === 0) return '';
    const topPath = top.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.period).toFixed(1)},${yFor(p.pct).toFixed(1)}`).join(' ');
    const bottomReversed = [...bottom].reverse();
    const bottomPath = bottomReversed.map((p) => `L${xFor(p.period).toFixed(1)},${yFor(p.pct).toFixed(1)}`).join(' ');
    return `${topPath} ${bottomPath} Z`;
  };
  const areaOptBase = areaBetween(cOpt, cBase);
  const areaBasePes = areaBetween(cBase, cPes);

  // Today line
  const todayPeriod = new Date().toISOString().substring(0, 7);
  let todayX: number | null = null;
  for (let i = 0; i < allPeriods.length; i++) {
    if (allPeriods[i] <= todayPeriod) todayX = xFor(allPeriods[i]);
  }

  // Year labels — pick periods at start of each year that exists in data
  const yearLabels = allPeriods.filter((p) => p.endsWith('-01') || p === allPeriods[0]);

  // Format scenario chip — extract years from ETA or last period reached 100%
  const fmtEta = (etaIso: string | null, fallbackSeries: { period: string; pct: number }[]) => {
    if (etaIso) return etaIso.substring(0, 7);
    // Find first period where pct >= 100
    const reached = fallbackSeries.find((p) => p.pct >= 100);
    return reached ? reached.period : '—';
  };

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="band-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* 100% reference line */}
        <line x1={PAD} y1={yFor(100)} x2={W - PAD} y2={yFor(100)} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2,3" />
        <text x={W - PAD - 4} y={yFor(100) - 3} fill="#94a3b8" fontSize="9" textAnchor="end">100%</text>

        {/* Areas */}
        {areaOptBase && <path d={areaOptBase} fill="url(#band-fill)" />}
        {areaBasePes && <path d={areaBasePes} fill="url(#band-fill)" />}

        {/* Lines */}
        {linePes  && <path d={linePes}  fill="none" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.4" />}
        {lineBase && <path d={lineBase} fill="none" stroke="#16a34a" strokeWidth="2.5" />}
        {lineOpt  && <path d={lineOpt}  fill="none" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.4" />}

        {/* Today line */}
        {todayX != null && (
          <>
            <line x1={todayX} y1={PAD} x2={todayX} y2={baseY} stroke="#04392c" strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={todayX} cy={yFor(cBase.find((p) => p.period <= todayPeriod) ? (cBase.findLast?.((p) => p.period <= todayPeriod)?.pct ?? 0) : 0)} r="4" fill="#04392c" />
          </>
        )}

        {/* Year labels along the bottom */}
        {yearLabels.map((p) => (
          <text key={p} x={xFor(p)} y={H - 4} fill="#94a3b8" fontSize="9" textAnchor="middle">
            {p.substring(2, 4)}
          </text>
        ))}
      </svg>

      {/* Scenario chips */}
      <div className="invest-scenarios-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12, marginBottom: 12 }}>
        <ScenarioChip label="Песимістичний" value={fmtEta(pes.latestEta, cPes)}  />
        <ScenarioChip label="Базовий"       value={fmtEta(base.latestEta, cBase)} highlight />
        <ScenarioChip label="Оптимістичний" value={fmtEta(opt.latestEta, cOpt)}  />
      </div>

      {/* Assumptions summary */}
      {(() => {
        const baseAssumps = base.assumptions
          .map((a) => safeParse<{ occupancy?: number; adr?: number; opex_growth?: number; notes?: string }>(a.raw))
          .filter((x): x is { occupancy?: number; adr?: number; opex_growth?: number; notes?: string } => x !== null);
        if (baseAssumps.length === 0) return null;
        const avg = (key: 'occupancy' | 'adr' | 'opex_growth') => {
          const vals = baseAssumps.map((a) => a[key]).filter((v): v is number => v != null);
          if (vals.length === 0) return null;
          return vals.reduce((s, v) => s + v, 0) / vals.length;
        };
        const occ = avg('occupancy');
        const adr = avg('adr');
        const opx = avg('opex_growth');
        const parts: string[] = [];
        if (occ != null) parts.push(`occupancy ${(occ * 100).toFixed(0)}%`);
        if (adr != null) parts.push(`ADR ${adr.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} CZK`);
        if (opx != null) parts.push(`OPEX growth +${(opx * 100).toFixed(0)}%/рік`);
        if (parts.length === 0) return null;
        return (
          <div style={{ fontSize: 11, color: '#64748b', paddingTop: 10, borderTop: '1px solid #f1f5f9', lineHeight: 1.5 }}>
            <b>Базовий сценарій:</b> {parts.join(' · ')}{currency === 'EUR' ? '' : `. Сума: ${totalInvested.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currency}`}
          </div>
        );
      })()}
    </div>
  );
}

function PulseStat({ label, value, sub, accent, tooltip }: { label: string; value: string; sub: string; accent?: boolean; tooltip?: string }) {
  return (
    <div title={tooltip} style={{ background: '#f5f7fa', borderRadius: 10, padding: '10px 12px', cursor: tooltip ? 'help' : 'default' }}>
      <div style={{ fontSize: 10, letterSpacing: 0.5, color: '#98a2b3', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? '#047857' : '#0e1116', letterSpacing: '-0.01em' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function ScenarioChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      padding: '10px 8px', borderRadius: 10, textAlign: 'center',
      border: '1px solid #e2e8f0',
      background: highlight ? '#dcfce7' : '#f8fafc',
      borderColor: highlight ? '#16a34a' : '#e2e8f0',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, color: highlight ? '#047857' : '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: highlight ? '#047857' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

function CashbackTimeline({ status, currency }: {
  status: NonNullable<PortalData['cashback_status']>;
  currency: string;
}) {
  const meta = CASHBACK_STATUS_META[status.status];
  const totalPct = status.total_planned_eur > 0
    ? (status.cumulative_paid_eur / status.total_planned_eur) * 100
    : 0;
  const plannedPct = status.total_planned_eur > 0
    ? (status.cumulative_planned_eur / status.total_planned_eur) * 100
    : 0;

  // Build per-period rows
  const periods = new Map<string, { planned: number; actual: number }>();
  for (const p of status.schedule) {
    periods.set(p.period, { planned: p.planned_eur, actual: 0 });
  }
  for (const p of status.paid_periods) {
    const existing = periods.get(p.period) || { planned: 0, actual: 0 };
    existing.actual = p.eur;
    periods.set(p.period, existing);
  }
  let sortedPeriods = [...periods.entries()].sort(([a], [b]) => a.localeCompare(b));

  // Auto-aggregate to quarters when too many monthly periods (more than 36).
  // Investor doesn't read 60 thin bars; quarters are visually clean.
  const useQuarterly = sortedPeriods.length > 36 && !sortedPeriods[0][0].includes('-Q');
  if (useQuarterly) {
    const q = new Map<string, { planned: number; actual: number }>();
    for (const [period, v] of sortedPeriods) {
      const [y, m] = period.split('-');
      const qNum = Math.ceil(parseInt(m, 10) / 3);
      const key = `${y}-Q${qNum}`;
      const cell = q.get(key) || { planned: 0, actual: 0 };
      cell.planned += v.planned;
      cell.actual += v.actual;
      q.set(key, cell);
    }
    sortedPeriods = [...q.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  const maxAmount = Math.max(
    ...sortedPeriods.map(([, v]) => Math.max(v.planned, v.actual)),
    1,
  );

  // "Today" cursor index
  const today = new Date().toISOString().substring(0, 7);
  const periodEndsByOrBefore = (period: string, dateStr: string): boolean => {
    if (period.includes('-Q')) {
      const [y, qPart] = period.split('-Q');
      const qNum = parseInt(qPart, 10);
      const monthEnd = qNum * 3;
      return `${y}-${String(monthEnd).padStart(2, '0')}` <= dateStr;
    }
    return period <= dateStr;
  };
  let todayIdx = -1;
  for (let i = 0; i < sortedPeriods.length; i++) {
    if (periodEndsByOrBefore(sortedPeriods[i][0], today)) todayIdx = i;
  }

  // SVG dimensions — taller for line+bars overlay
  const W = 800, H = 200, PAD_X = 16, PAD_Y = 18;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2 - 16;
  const barGroupW = innerW / Math.max(1, sortedPeriods.length);
  const barW = Math.min(16, barGroupW * 0.35);
  const baseY = H - PAD_Y - 16;

  // Pre-compute cumulative series for the line overlay
  let cPlanned = 0, cActual = 0;
  const cumulativeSeries = sortedPeriods.map(([period, v]) => {
    cPlanned += v.planned;
    cActual += v.actual;
    return { period, cPlanned, cActual };
  });
  const totalContract = Math.max(status.total_planned_eur, 1);
  const yForCum = (eur: number) => PAD_Y + (innerH - (Math.min(1, eur / totalContract)) * innerH);

  return (
    <div>
      {/* Header summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a' }}>
            {status.cumulative_paid_eur.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} {currency}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>cashback ({status.paid_periods.length} {status.paid_periods.length === 1 ? 'період' : 'періодів'})</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: meta.bg, color: meta.fg }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot }} />
            {meta.label}
          </span>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            Plan: {status.total_planned_eur.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} {currency} · {totalPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Progress bar — actual vs planned cumulative */}
      <div style={{ position: 'relative', height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'visible', marginBottom: 4 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${Math.min(100, totalPct)}%`,
          background: 'linear-gradient(90deg, #16a34a, #22c55e)',
          borderRadius: 5, zIndex: 2,
        }} />
        {plannedPct > 0 && (
          <div style={{
            position: 'absolute', top: -3, bottom: -3, left: `${Math.min(100, plannedPct)}%`,
            width: 2, background: '#475569', zIndex: 3,
          }} title={`Planned by today: ${status.cumulative_planned_eur.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currency}`} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', marginBottom: 14 }}>
        <span>Actual: {totalPct.toFixed(1)}%</span>
        <span>Planned: {plannedPct.toFixed(1)}%</span>
      </div>

      {/* Subtitle showing aggregation */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
        {useQuarterly
          ? `Згруповано по кварталах для зручності (${sortedPeriods.length} періодів)`
          : `${sortedPeriods.length} ${sortedPeriods.length === 1 ? 'місяць' : 'місяців'}`}
      </div>

      {/* Combined chart: bars + cumulative line */}
      {sortedPeriods.length > 0 && (
        <>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="cb-cum-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* baseline */}
            <line x1={PAD_X} y1={baseY} x2={W - PAD_X} y2={baseY} stroke="#e2e8f0" strokeWidth={1} />

            {/* Per-period bars */}
            {sortedPeriods.map(([period, v], i) => {
              const groupX = PAD_X + i * barGroupW + (barGroupW / 2);
              const plannedH = (v.planned / maxAmount) * innerH;
              const actualH = (v.actual / maxAmount) * innerH;
              const isFuture = i > todayIdx;
              const plannedColor = isFuture ? '#e2e8f0' : '#cbd5e1';
              return (
                <g key={period}>
                  <rect
                    x={groupX - barW - 1}
                    y={baseY - plannedH}
                    width={barW}
                    height={Math.max(0, plannedH)}
                    rx={2}
                    fill={plannedColor}
                  >
                    <title>{`Plan ${period}: ${v.planned.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currency}`}</title>
                  </rect>
                  {v.actual > 0 && (
                    <rect
                      x={groupX + 1}
                      y={baseY - actualH}
                      width={barW}
                      height={Math.max(0, actualH)}
                      rx={2}
                      fill="#16a34a"
                    >
                      <title>{`Actual ${period}: ${v.actual.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currency}`}</title>
                    </rect>
                  )}
                </g>
              );
            })}

            {/* Cumulative lines overlay — planned (grey) + actual (green) */}
            {cumulativeSeries.length > 1 && (() => {
              const xFor = (i: number) => PAD_X + i * barGroupW + (barGroupW / 2);
              const plannedPath = cumulativeSeries.map((c, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yForCum(c.cPlanned).toFixed(1)}`).join(' ');
              const actualPathUntilToday = cumulativeSeries.slice(0, todayIdx + 1).map((c, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yForCum(c.cActual).toFixed(1)}`).join(' ');
              return (
                <>
                  {/* Planned line — dashed grey */}
                  <path d={plannedPath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4,3" opacity="0.7" />
                  {/* Actual cumulative — solid emerald */}
                  {actualPathUntilToday && (
                    <path d={actualPathUntilToday} fill="none" stroke="#047857" strokeWidth="2.5" />
                  )}
                  {/* Endpoint marker on actual line */}
                  {todayIdx >= 0 && (
                    <circle cx={xFor(todayIdx)} cy={yForCum(cumulativeSeries[todayIdx].cActual)} r="4" fill="#047857" stroke="#fff" strokeWidth="1.5">
                      <title>{`Накопичено на ${cumulativeSeries[todayIdx].period}: ${cumulativeSeries[todayIdx].cActual.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currency}`}</title>
                    </circle>
                  )}
                </>
              );
            })()}

            {/* Today cursor */}
            {todayIdx >= 0 && todayIdx < sortedPeriods.length - 1 && (() => {
              const x = PAD_X + (todayIdx + 1) * barGroupW;
              return (
                <g>
                  <line x1={x} y1={PAD_Y} x2={x} y2={baseY} stroke="#04392c" strokeWidth={1} strokeDasharray="3,3" />
                  <text x={x} y={H - 2} fill="#04392c" fontSize={9} fontWeight={600} textAnchor="middle">today</text>
                </g>
              );
            })()}

            {/* X-axis labels — pick year transitions */}
            {sortedPeriods.map(([period], i) => {
              const isFirst = i === 0;
              const isLast = i === sortedPeriods.length - 1;
              const showLabel = isFirst || isLast || (i % Math.max(1, Math.floor(sortedPeriods.length / 6)) === 0);
              if (!showLabel) return null;
              const x = PAD_X + i * barGroupW + (barGroupW / 2);
              return (
                <text key={`lbl-${period}`} x={x} y={baseY + 12} fill="#94a3b8" fontSize="9" textAnchor="middle">
                  {period.length > 7 ? period : period.substring(2)}
                </text>
              );
            })}
          </svg>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#64748b' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, background: '#16a34a', borderRadius: 2 }} />
              Виплачено (фактично)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, background: '#cbd5e1', borderRadius: 2 }} />
              План по контракту
            </span>
            {status.next_planned_period && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
                Наступна виплата: <b style={{ color: '#0f172a' }}>{status.next_planned_amount_eur.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} {currency}</b> · {status.next_planned_period}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DocumentsList({ items }: { items: NonNullable<PortalData['documents']> }) {
  return (
    <div>
      {items.map((d) => {
        const color = DOC_TYPE_COLOR[d.type] || DOC_TYPE_COLOR.other;
        return (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}18`, color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <FileText size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                <span style={{ background: `${color}18`, color, padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                  {DOC_TYPE_LABEL[d.type] || d.type}
                </span>
                {' · '}{fmtSize(d.file_size)}
                {' · '}{d.uploaded_at?.substring(0, 10)}
                {d.period_start && ` · період ${d.period_start}${d.period_end ? `..${d.period_end}` : ''}`}
              </div>
            </div>
            <a href={d.download_url} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 14px', background: '#f1f5f9', color: '#3b82f6', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              <Download size={14} /> Завантажити
            </a>
          </div>
        );
      })}
    </div>
  );
}

function PayoutsTable({ items }: { items: PortalData['payouts'] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: '#f8fafc' }}>
          <th style={th}>Дата</th>
          <th style={th}>Об&apos;єкт</th>
          <th style={th}>Період</th>
          <th style={{ ...th, textAlign: 'right' }}>Сума</th>
          <th style={th}>Коментар</th>
        </tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <tr key={p.id} style={{ borderTop: '1px solid #e2e8f0' }}>
            <td style={{ ...td, color: '#0f172a' }}>{p.paid_at}</td>
            <td style={{ ...td, color: '#0f172a' }}>{p.project_name || '—'}</td>
            <td style={{ ...td, color: '#64748b' }}>{p.period_year_month || '—'}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{fmt(p.amount, p.currency)}</td>
            <td style={{ ...td, color: '#64748b' }}>{p.comment || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OccupancyBars({ data }: { data: { month: string; occupancy_pct: number }[] }) {
  if (data.length === 0) return <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>Немає даних</div>;
  const max = Math.max(...data.map((d) => d.occupancy_pct), 100);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 100, marginTop: 8 }}>
      {data.map((d) => {
        const heightPct = (d.occupancy_pct / max) * 100;
        return (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }} title={`${d.month}: ${d.occupancy_pct}%`}>
            <div style={{ fontSize: 9, fontWeight: 600, color: d.occupancy_pct > 0 ? '#16a34a' : 'transparent' }}>
              {d.occupancy_pct.toFixed(0)}%
            </div>
            <div style={{ width: '100%', height: `${Math.max(2, heightPct * 0.8)}%`, minHeight: 2, background: d.occupancy_pct > 0 ? '#22c55e' : '#e2e8f0', borderRadius: 2 }} />
            <div style={{ fontSize: 9, color: '#94a3b8' }}>{d.month.substring(5)}</div>
          </div>
        );
      })}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'middle' };
