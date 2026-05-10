'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';

interface AuditData {
  generated_at: string;
  pollution_stats: {
    total_business_units: number;
    finance_only: number;
    investor_only: number;
    mixed: number;
    orphan: number;
    supabase_imported: number;
    unit_match_count: number;
  };
  business_units: Array<{
    id: string;
    name: string;
    unit_type: string | null;
    is_active: number;
    is_shared: number;
    role: string;
    is_supabase_imported: boolean;
    matched_unit_id: string | null;
    matched_unit_name: string | null;
    fin_ops_count: number;
    fin_ops_total: number;
    investor_lots: number;
    investor_total: number;
    payout_count: number;
    metric_count: number;
    report_count: number;
    budget_count: number;
  }>;
  glamping_units: Array<{
    id: string;
    name: string;
    code: string;
    is_active: number;
    property_name: string;
    category_name: string;
    reservation_count: number;
    reservation_total: number;
  }>;
  all_units_summary: { glamping: number; camping: number; resort: number };
  investments: Array<{
    id: string;
    investor_name: string;
    project_id: string;
    project_name: string | null;
    amount: number;
    currency: string;
    equity_pct: number | null;
    invested_at: string;
    is_active: number;
  }>;
  polluted_fin_operations_sample: Array<{
    id: string; paid_at: string; amount: number; currency: string;
    op_type: string; project_id: string; comment: string | null; source: string;
  }>;
}

const ROLE_COLOR: Record<string, string> = {
  'finance-only': '#3b82f6',
  'investor-only': '#22c55e',
  'MIXED ⚠': '#dc2626',
  'orphan (empty)': '#94a3b8',
};

interface CascadePreview {
  bu: { id: string; name: string; is_supabase_imported: boolean };
  counts: {
    investor_investments: number;
    investor_payouts: number;
    dividend_fin_operations: number;
    property_monthly_metrics: number;
    property_monthly_reports: number;
    property_work_stages: number;
    investor_property_details: number;
    fin_operations_left_dangling: number;
    fin_budgets_left_dangling: number;
  };
  totals: { investor_amount: number; payout_amount: number };
}

export default function InvestorAuditPage() {
  const [data, setData] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cascadeTarget, setCascadeTarget] = useState<CascadePreview | null>(null);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const reload = () => {
    fetch('/api/finance/investors/audit')
      .then(async (r) => {
        if (!r.ok) { const j = await r.json(); setError(j.error); return; }
        setData(await r.json());
      })
      .catch((e) => setError(e.message));
  };

  useEffect(reload, []);

  async function relinkBu(projectId: string, unitId: string) {
    const res = await fetch('/api/finance/investors/audit/relink', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, unit_id: unitId }),
    });
    const j = await res.json();
    if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
    alert(`✓ Привʼязано до «${j.unit?.name}». Оновлено ${j.updated_rows} рядків.`);
    reload();
  }

  async function openCascadeDelete(buId: string) {
    setCascadeLoading(true);
    setConfirmName('');
    try {
      const res = await fetch(`/api/finance/investors/audit/cascade-delete/${buId}`);
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      setCascadeTarget(j);
    } catch (e: any) {
      alert(`Помилка: ${e.message}`);
    } finally {
      setCascadeLoading(false);
    }
  }

  async function executeCascadeDelete() {
    if (!cascadeTarget) return;
    if (confirmName !== cascadeTarget.bu.name) {
      alert('Назва не співпадає');
      return;
    }
    setCascadeLoading(true);
    try {
      const res = await fetch(`/api/finance/investors/audit/cascade-delete/${cascadeTarget.bu.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_name: confirmName }),
      });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      const d = j.deleted;
      alert(`✓ Видалено «${cascadeTarget.bu.name}»:\n` +
        `• ${d.business_units} business_unit\n` +
        `• ${d.investor_investments} лотів, ${d.investor_payouts} виплат (+ ${d.dividend_fin_operations} fin_ops)\n` +
        `• ${d.property_monthly_metrics} метрик, ${d.property_monthly_reports} звітів, ${d.property_work_stages} етапів, ${d.investor_property_details} property_details`);
      setCascadeTarget(null);
      setConfirmName('');
      reload();
    } catch (e: any) {
      alert(`Помилка: ${e.message}`);
    } finally {
      setCascadeLoading(false);
    }
  }

  if (error) return <div style={{ padding: 40, color: '#dc2626' }}>{error}</div>;
  if (!data) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Завантаження…</div>;

  const s = data.pollution_stats;
  const investorBus = data.business_units.filter((b) => b.role === 'investor-only' || b.role === 'MIXED ⚠');
  const financeBus = data.business_units.filter((b) => b.role === 'finance-only');
  const orphanBus = data.business_units.filter((b) => b.role === 'orphan (empty)');

  return (
    <div className="page-container" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/finance/investors" style={backLink}><ArrowLeft size={14} /></Link>
        <h1 style={{ margin: 0, flex: 1 }}>Аудит: інвестори vs фінанси</h1>
      </div>

      <p style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
        Read-only знімок стану. Згенеровано: {new Date(data.generated_at).toLocaleString('cs-CZ')}.
        Жодних змін у базі не зроблено.
      </p>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        <Tile label="Усього business_units" value={s.total_business_units} />
        <Tile label="Тільки фінанси" value={s.finance_only} color="#3b82f6" />
        <Tile label="Тільки інвестори" value={s.investor_only} color="#22c55e" />
        <Tile label="ЗМІШАНІ ⚠" value={s.mixed} color="#dc2626" warn />
        <Tile label="Порожні (orphan)" value={s.orphan} color="#94a3b8" />
        <Tile label="Імпортовані з Supabase (bu_sb_*)" value={s.supabase_imported} color="#f59e0b" warn={s.supabase_imported > 0} />
      </div>

      <div style={{ marginTop: 24, padding: 14, background: 'rgba(245,158,11,0.08)', border: '1px solid #f59e0b', borderRadius: 10, fontSize: 13 }}>
        <b>Висновок:</b> Supabase importer створив <b>{s.supabase_imported}</b> рядків у <code>business_units</code>.{' '}
        З них <b>{s.unit_match_count}</b> зматчилися з реальними glamping units по назві.{' '}
        Якщо <b>«Тільки фінанси»</b> ≠ {financeBus.length} — звіти/бюджети показують зайве.
      </div>

      {/* Investor-related business_units */}
      <Section title={`🟢 Інвесторські business_units (${investorBus.length})`}
               subtitle="Ці рядки мають investor_investments / payouts / metrics. Якщо в колонці «fin_ops» ≠ 0 — вони ЗМІШАНІ й забруднюють фінансові звіти.">
        <BuTable rows={investorBus} glampingUnits={data.glamping_units} onRelink={relinkBu} onCascadeDelete={openCascadeDelete} />
      </Section>

      {/* Finance-only business_units */}
      <Section title={`🔵 Тільки фінансові business_units (${financeBus.length})`}
               subtitle="Чисті фінансові buckets — Глемпинг, Кемпинг, Резорт, Ресторан, Сауна тощо. Без інвесторських даних.">
        <BuTable rows={financeBus} glampingUnits={data.glamping_units} onRelink={relinkBu} onCascadeDelete={openCascadeDelete} />
      </Section>

      {/* Orphans */}
      {orphanBus.length > 0 && (
        <Section title={`⚪ Порожні business_units (${orphanBus.length})`}
                 subtitle="Ні фінансових операцій, ні інвестицій. Можна архівувати без шкоди.">
          <BuTable rows={orphanBus} glampingUnits={data.glamping_units} onRelink={relinkBu} onCascadeDelete={openCascadeDelete} compact />
        </Section>
      )}

      {/* Glamping units (real PMS houses) */}
      <Section title={`🏠 Реальні glamping units у PMS (${data.glamping_units.length})`}
               subtitle={`Усі юніти: glamping ${data.all_units_summary.glamping}, camping ${data.all_units_summary.camping}, resort ${data.all_units_summary.resort}. Сюди мають вести інвестиції.`}>
        <table style={table}>
          <thead><tr style={tr}>
            <th style={th}>Юніт</th><th style={th}>Property</th><th style={th}>Категорія</th>
            <th style={{ ...th, textAlign: 'right' }}>Бронювань</th>
            <th style={{ ...th, textAlign: 'right' }}>Сума</th>
          </tr></thead>
          <tbody>
            {data.glamping_units.map((u) => (
              <tr key={u.id} style={tr}>
                <td style={td}><b>{u.name}</b> <span style={{ color: 'var(--text-secondary)' }}>({u.code})</span></td>
                <td style={td}>{u.property_name}</td>
                <td style={td}>{u.category_name}</td>
                <td style={{ ...td, textAlign: 'right' }}>{u.reservation_count}</td>
                <td style={{ ...td, textAlign: 'right' }}>{u.reservation_total.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Investments */}
      <Section title={`💼 Усі інвестиції (${data.investments.length})`}
               subtitle="Кожна інвестиція показує project_id (= business_unit) куди вона привʼязана. Ці business_units треба перевести на units (реальні будинки).">
        <table style={table}>
          <thead><tr style={tr}>
            <th style={th}>Дата</th><th style={th}>Інвестор</th>
            <th style={th}>Привʼязка (business_unit)</th>
            <th style={th}>project_id</th>
            <th style={{ ...th, textAlign: 'right' }}>Сума</th>
            <th style={{ ...th, textAlign: 'right' }}>Equity</th>
          </tr></thead>
          <tbody>
            {data.investments.map((i) => (
              <tr key={i.id} style={tr}>
                <td style={td}>{i.invested_at}</td>
                <td style={td}><b>{i.investor_name}</b></td>
                <td style={td}>{i.project_name || <span style={{ color: '#dc2626' }}>(відсутній!)</span>}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{i.project_id}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{i.amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {i.currency}</td>
                <td style={{ ...td, textAlign: 'right' }}>{i.equity_pct != null ? `${i.equity_pct}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Cascade delete confirmation modal */}
      {cascadeTarget && (
        <div
          onClick={() => !cascadeLoading && setCascadeTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 520, maxWidth: 640, border: '1px solid var(--border-primary)' }}>
            <h2 style={{ margin: 0, marginBottom: 6, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trash2 size={20} /> Cascade Delete: {cascadeTarget.bu.name}
            </h2>
            <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
              Незворотна операція. Видалить business_unit і всі привʼязані інвесторські дані.
            </p>

            <div style={{ background: 'var(--bg-secondary)', padding: 14, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Буде видалено:</div>
              <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-primary)' }}>
                <li>business_unit «<b>{cascadeTarget.bu.name}</b>» {cascadeTarget.bu.is_supabase_imported && <span style={{ color: '#f59e0b' }}>(supabase)</span>}</li>
                <li>{cascadeTarget.counts.investor_investments} лот(ів) на сумарно <b>{cascadeTarget.totals.investor_amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })}</b></li>
                <li>{cascadeTarget.counts.investor_payouts} виплат(и) на сумарно <b>{cascadeTarget.totals.payout_amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })}</b> + {cascadeTarget.counts.dividend_fin_operations} дивідендних fin_operations</li>
                <li>{cascadeTarget.counts.property_monthly_metrics} manual-метрик</li>
                <li>{cascadeTarget.counts.property_monthly_reports} місячних звітів</li>
                <li>{cascadeTarget.counts.property_work_stages} етапів робіт</li>
                <li>{cascadeTarget.counts.investor_property_details} property_details (airbnb_url, image, location)</li>
              </ul>
            </div>

            {(cascadeTarget.counts.fin_operations_left_dangling > 0 || cascadeTarget.counts.fin_budgets_left_dangling > 0) && (
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid #f59e0b', padding: 12, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
                <b>⚠ Залишиться (НЕ видаляється автоматично):</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {cascadeTarget.counts.fin_operations_left_dangling > 0 && (
                    <li>{cascadeTarget.counts.fin_operations_left_dangling} fin_operations з <code>project_id={cascadeTarget.bu.id}</code> (стануть «осиротілими» — зачистіть вручну в Operations якщо треба)</li>
                  )}
                  {cascadeTarget.counts.fin_budgets_left_dangling > 0 && (
                    <li>{cascadeTarget.counts.fin_budgets_left_dangling} fin_budgets — теж залишаться</li>
                  )}
                </ul>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Введіть точну назву <code>{cascadeTarget.bu.name}</code> для підтвердження:
              </label>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                disabled={cascadeLoading}
                autoFocus
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-primary)', borderRadius: 6, background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setCascadeTarget(null)}
                disabled={cascadeLoading}
                style={{ padding: '8px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                Відміна
              </button>
              <button
                type="button"
                onClick={executeCascadeDelete}
                disabled={cascadeLoading || confirmName !== cascadeTarget.bu.name}
                style={{
                  padding: '8px 16px',
                  background: confirmName === cascadeTarget.bu.name ? '#dc2626' : '#94a3b8',
                  border: 'none', color: '#fff', borderRadius: 6,
                  cursor: confirmName === cascadeTarget.bu.name && !cascadeLoading ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {cascadeLoading ? 'Видаляю…' : 'Видалити назавжди'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Polluted fin_operations sample */}
      {data.polluted_fin_operations_sample.length > 0 && (
        <Section title={`⚠ Приклад fin_operations що пливуть на інвесторських BUs (${data.polluted_fin_operations_sample.length})`}
                 subtitle="Це РЕАЛЬНІ фінансові операції які зберігалися з project_id = одна з інвесторських business_units. Тобто ваші cashflow/pnl ці суми бачать на тому ж рівні що Глемпинг/Кемпинг.">
          <table style={table}>
            <thead><tr style={tr}>
              <th style={th}>Дата</th><th style={th}>Тип</th><th style={th}>Сума</th>
              <th style={th}>BU</th><th style={th}>Source</th><th style={th}>Коментар</th>
            </tr></thead>
            <tbody>
              {data.polluted_fin_operations_sample.map((op) => (
                <tr key={op.id} style={tr}>
                  <td style={td}>{op.paid_at?.substring(0, 10)}</td>
                  <td style={td}>{op.op_type}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{op.amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {op.currency}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{op.project_id}</td>
                  <td style={td}>{op.source}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)' }}>{op.comment?.substring(0, 50)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

function Tile({ label, value, color, warn }: { label: string; value: number; color?: string; warn?: boolean }) {
  return (
    <div style={{ padding: 14, border: `1px solid ${warn ? '#dc2626' : 'var(--border-primary)'}`, borderRadius: 10, background: warn ? 'rgba(220,38,38,0.05)' : 'var(--bg-secondary)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ margin: 0, marginBottom: 4, fontSize: 16 }}>{title}</h3>
      {subtitle && <p style={{ margin: 0, marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>{subtitle}</p>}
      <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'auto', maxHeight: 400 }}>
        {children}
      </div>
    </div>
  );
}

function BuTable({ rows, glampingUnits, onRelink, onCascadeDelete, compact }: {
  rows: AuditData['business_units'];
  glampingUnits: AuditData['glamping_units'];
  onRelink: (projectId: string, unitId: string) => Promise<void>;
  onCascadeDelete: (buId: string) => Promise<void>;
  compact?: boolean;
}) {
  const [relinkingId, setRelinkingId] = React.useState<string | null>(null);

  return (
    <table style={table}>
      <thead><tr style={tr}>
        <th style={th}>Назва</th>
        <th style={th}>Роль</th>
        <th style={th}>id</th>
        <th style={{ ...th, textAlign: 'right' }}>fin_ops</th>
        <th style={{ ...th, textAlign: 'right' }}>investor lots</th>
        {!compact && <th style={{ ...th, textAlign: 'right' }}>payouts</th>}
        {!compact && <th style={{ ...th, textAlign: 'right' }}>metrics</th>}
        {!compact && <th style={{ ...th, textAlign: 'right' }}>budgets</th>}
        <th style={th}>matched unit</th>
        <th style={{ ...th, width: 1 }}></th>
      </tr></thead>
      <tbody>
        {rows.map((bu) => {
          const showPicker = bu.investor_lots > 0;  // only investor BUs need a unit link
          return (
            <tr key={bu.id} style={tr}>
              <td style={td}>
                <b>{bu.name}</b>
                {bu.is_supabase_imported && <span style={{ marginLeft: 6, fontSize: 10, color: '#f59e0b' }}>(supabase)</span>}
                {!bu.is_active && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-secondary)' }}>(archived)</span>}
              </td>
              <td style={td}><span style={{ fontSize: 11, padding: '2px 8px', background: `${ROLE_COLOR[bu.role]}22`, color: ROLE_COLOR[bu.role], borderRadius: 4, fontWeight: 600 }}>{bu.role}</span></td>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{bu.id}</td>
              <td style={{ ...td, textAlign: 'right' }}>{bu.fin_ops_count}</td>
              <td style={{ ...td, textAlign: 'right' }}>{bu.investor_lots}</td>
              {!compact && <td style={{ ...td, textAlign: 'right' }}>{bu.payout_count}</td>}
              {!compact && <td style={{ ...td, textAlign: 'right' }}>{bu.metric_count}</td>}
              {!compact && <td style={{ ...td, textAlign: 'right' }}>{bu.budget_count}</td>}
              <td style={td}>
                {bu.matched_unit_name ? (
                  <span style={{ color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} /> {bu.matched_unit_name}
                  </span>
                ) : showPicker ? (
                  <select
                    value=""
                    disabled={relinkingId === bu.id}
                    onChange={async (e) => {
                      const unitId = e.target.value;
                      if (!unitId) return;
                      const u = glampingUnits.find((x) => x.id === unitId);
                      if (!confirm(`Привʼязати «${bu.name}» → «${u?.property_name} / ${u?.name}»?\nОновить unit_id у всіх investor-таблицях.`)) return;
                      setRelinkingId(bu.id);
                      try { await onRelink(bu.id, unitId); }
                      finally { setRelinkingId(null); }
                    }}
                    style={{ padding: 4, fontSize: 11, border: '1px solid #f59e0b', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)', maxWidth: 220 }}
                  >
                    <option value="">⚠ зматчити вручну…</option>
                    {glampingUnits.map((u) => (
                      <option key={u.id} value={u.id}>{u.property_name} / {u.name} ({u.code})</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={12} /> —
                  </span>
                )}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => onCascadeDelete(bu.id)}
                  title="Cascade delete (BU + всі інвесторські дані)"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 8px', background: 'transparent',
                    border: '1px solid #dc2626', color: '#dc2626',
                    borderRadius: 4, fontSize: 11, cursor: 'pointer',
                  }}
                >
                  <Trash2 size={12} /> Видалити
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-primary)', textDecoration: 'none' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const tr: React.CSSProperties = { borderTop: '1px solid var(--border-primary)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', background: 'var(--bg-secondary)', position: 'sticky', top: 0 };
const td: React.CSSProperties = { padding: '6px 10px' };
