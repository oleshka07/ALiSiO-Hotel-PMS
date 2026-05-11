'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Wallet, TrendingUp, Clock, Activity, ExternalLink, CheckCircle } from 'lucide-react';

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
  return `${n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:      { label: 'Active',       color: '#22c55e' },
  in_progress: { label: 'In Progress',  color: '#f59e0b' },
  project:     { label: 'Project',      color: '#6366f1' },
  paused:      { label: 'Paused',       color: '#94a3b8' },
};

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

  if (loading) return <div style={{ padding: 80, textAlign: 'center', color: '#94a3b8' }}>Завантаження…</div>;
  if (error || !data) return (
    <div style={{ padding: 80, textAlign: 'center' }}>
      <h1>404</h1><p style={{ color: '#94a3b8' }}>{error || 'Portal not found'}</p>
    </div>
  );

  const t = data.totals;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', padding: '0' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#16a34a,#22c55e)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>A</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Swipe Scape Investment</div>
          <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Portfolio</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{data.investor.name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Investor</div>
        </div>
      </header>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 32 }}>
        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>Мій інвестиційний портфель</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b' }}>Сумарні показники по всім вашим активам.</p>
        </div>

        {/* Hero summary card */}
        <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)', borderRadius: 16, padding: 32, marginBottom: 24, color: '#fff' }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'inline-block', padding: '4px 10px', background: 'rgba(34,197,94,0.2)', color: '#86efac', borderRadius: 999, fontSize: 11, fontWeight: 600, marginBottom: 12 }}>Active Portfolio</div>
              <h2 style={{ margin: 0, fontSize: 28, marginBottom: 8 }}>Сумарна статистика</h2>
              <p style={{ margin: 0, opacity: 0.85, fontSize: 14, lineHeight: 1.5 }}>
                Ваш портфель включає <b>{t.active_lots}</b> {t.active_lots === 1 ? 'актив' : 'активів'}. Ми постійно
                оптимізуємо операційні витрати для забезпечення стабільного пасивного доходу.
              </p>
            </div>
            <div style={{ minWidth: 280 }}>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>Об&apos;єкт</th>
                <th style={th}>Інвестовано</th>
                <th style={th}>Сумарний ROI</th>
                <th style={th}>Статус</th>
                <th style={{ ...th, width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.properties.map((p) => {
                const stat = STATUS_LABEL[p.status] || STATUS_LABEL.active;
                return (
                  <tr key={p.project_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ ...td, fontWeight: 600, color: '#0f172a' }}>{p.project_name}</td>
                    <td style={{ ...td, color: '#0f172a' }}>{fmt(p.invested, p.currency)}</td>
                    <td style={{ ...td, color: (p.roi_pct || 0) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                      {p.roi_pct != null ? `${p.roi_pct >= 0 ? '+' : ''}${p.roi_pct}%` : '—'}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: `${stat.color}15`, color: stat.color, fontWeight: 600 }}>
                        {stat.label}
                      </span>
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
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>Інвестицій ще немає</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* Capital growth chart + Occupancy dynamics */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 16 }}>
          <Card title="Графік зростання капіталу" subtitle="● Прибуток · ● Інвестиція">
            <CapitalGrowthChart data={data.capital_growth} currency={t.currency} />
          </Card>
          <Card title="Динаміка Occupancy">
            {t.avg_occupancy_pct != null ? (
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#16a34a' }}>{t.avg_occupancy_pct}%</div>
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 16 }}>Portfolio avg</div>
                <OccupancyBars data={data.occupancy_dynamics.slice(-12)} />
              </div>
            ) : (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Метрик occupancy ще немає</div>
            )}
          </Card>
        </div>

        {/* Income by source — derived from real reservations × equity */}
        {data.income_by_source.length > 0 && (
          <Card title="Дохід за джерелами" subtitle="Розподіл за кількістю бронювань (по виїзду)" style={{ marginTop: 16 }}>
            <SourceBreakdown items={data.income_by_source} />
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
  const W = 600, H = 180, P = 30;
  const xStep = (W - P * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => `${P + i * xStep},${H - P - (d.profit_cumulative / max) * (H - P * 2)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="#e2e8f0" />
      <polyline points={points} fill="none" stroke="#16a34a" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={i} cx={P + i * xStep} cy={H - P - (d.profit_cumulative / max) * (H - P * 2)} r="3" fill="#16a34a" />
      ))}
      {data.length > 0 && (
        <text x={P} y={H - 8} fontSize="10" fill="#94a3b8">{data[0].month}</text>
      )}
      {data.length > 1 && (
        <text x={W - P - 30} y={H - 8} fontSize="10" fill="#94a3b8">{data[data.length - 1].month}</text>
      )}
      <text x={W - P} y={20} fontSize="11" fill="#16a34a" fontWeight="600" textAnchor="end">
        {data[data.length - 1]?.profit_cumulative.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} {currency}
      </text>
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
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80, marginTop: 8 }}>
      {data.map((d) => (
        <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={`${d.month}: ${d.occupancy_pct}%`}>
          <div style={{ width: '100%', height: `${Math.min(100, d.occupancy_pct)}%`, minHeight: 2, background: '#22c55e', borderRadius: 2 }} />
          <div style={{ fontSize: 9, color: '#94a3b8' }}>{d.month.substring(5)}</div>
        </div>
      ))}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'middle' };
