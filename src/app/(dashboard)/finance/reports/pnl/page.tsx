'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, ChevronDown } from 'lucide-react';
import DrillDownModal from '../_components/DrillDownModal';
import ExportButton from '../../_components/ExportButton';
import Sparkline from '../../_components/Sparkline';
import TagFilter from '../../_components/TagFilter';

interface MatrixRow {
  category_id: string | null;
  category_name: string;
  category_icon: string | null;
  months: Record<string, number>;
  total: number;
  children?: MatrixRow[];
}

interface PnlSection {
  key: string;
  name: string;
  rows?: MatrixRow[];
  byMonth: Record<string, number>;
  total: number;
  sign?: number;
  margin_pct?: number | null;
  isDerived?: boolean;
  isTotal?: boolean;
  highlight?: boolean;
}

interface PnlData {
  months: string[];
  basis: string;
  sections: PnlSection[];
}

function monthLabel(m: string): string {
  const names = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
  const [y, mm] = m.split('-');
  return `${names[Number(mm) - 1]} ${y.slice(2)}`;
}

function formatK(n: number): string {
  if (n === 0) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return n.toFixed(0);
}

function defaultRange(): { from: string; to: string } {
  const t = new Date();
  const to = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  const f = new Date(t.getFullYear(), t.getMonth() - 5, 1);
  const from = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
  return { from, to };
}

export default function PnlMatrixPage() {
  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(defaultRange());
  const [basis, setBasis] = useState<'paid' | 'accrued'>('accrued');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drillDown, setDrillDown] = useState<{ month: string; categoryId: string | null; categoryName: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, basis });
      if (tagIds.length > 0) params.set('tag_ids', tagIds.join(','));
      const res = await fetch(`/api/finance/pnl-matrix?${params}`);
      setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [range, basis, tagIds]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleExpand(k: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  return (
    <div className="page-container" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/finance/reports" style={backLink}><ArrowLeft size={14} /></Link>
        <h1 style={{ margin: 0, flex: 1 }}>📊 P&amp;L</h1>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border-primary)' }}>
          <button onClick={() => setBasis('accrued')} style={{ ...tabBtn, ...(basis === 'accrued' ? tabActive : {}) }}>По нарахуванню</button>
          <button onClick={() => setBasis('paid')} style={{ ...tabBtn, ...(basis === 'paid' ? tabActive : {}) }}>По факту</button>
        </div>
        <input type="month" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} style={input} />
        <span style={{ color: 'var(--text-secondary)' }}>—</span>
        <input type="month" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} style={input} />
        <TagFilter selected={tagIds} onChange={setTagIds} />
        <ExportButton
          endpoint="/api/finance/export/pnl"
          params={{ from: range.from, to: range.to, basis }}
        />
      </div>

      {loading || !data ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження…</div>
      ) : (
        <div style={{ marginTop: 20, overflowX: 'auto', border: '1px solid var(--border-primary)', borderRadius: 10 }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 2, minWidth: 280 }}>Категорія</th>
                {data.months.map((m) => <th key={m} style={th}>{monthLabel(m)}</th>)}
                <th style={{ ...th, background: 'var(--bg-secondary)' }}>Σ</th>
                <th style={th}>%</th>
                <th style={{ ...th, textAlign: 'center', minWidth: 120 }}>Тренд</th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((s) => {
                const isDerived = s.isDerived;
                const highlight = s.highlight;
                const sign = s.sign || 1;

                return (
                  <>
                    <tr
                      key={s.key}
                      style={{
                        background: highlight ? 'rgba(99,102,241,0.08)' : isDerived ? 'var(--bg-secondary)' : 'transparent',
                        fontWeight: isDerived || s.isTotal ? 700 : 500,
                      }}
                    >
                      <td style={{ ...tdLeft, position: 'sticky', left: 0, background: highlight ? 'rgba(99,102,241,0.08)' : isDerived ? 'var(--bg-secondary)' : 'var(--bg-primary)' }}>
                        {s.rows && s.rows.length > 0 ? (
                          <button onClick={() => toggleExpand(s.key)} style={expandBtn}>
                            {expanded.has(s.key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        ) : <span style={{ display: 'inline-block', width: 20 }} />}
                        {sign < 0 ? '− ' : ''}
                        {s.name}
                      </td>
                      {data.months.map((m) => {
                        const val = (s.byMonth[m] || 0) * sign;
                        return (
                          <td key={m} style={{ ...td, color: isDerived ? (val >= 0 ? '#22c55e' : '#ef4444') : undefined }}>
                            {formatK(val)}
                          </td>
                        );
                      })}
                      <td style={{ ...td, background: 'var(--bg-secondary)', color: isDerived ? (s.total * sign >= 0 ? '#22c55e' : '#ef4444') : undefined }}>
                        {formatK(s.total * sign)}
                      </td>
                      <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 11 }}>
                        {s.margin_pct !== undefined && s.margin_pct !== null ? `${s.margin_pct}%` : ''}
                      </td>
                      <td style={{ ...td, textAlign: 'center', padding: '4px 8px' }}>
                        <Sparkline
                          values={data.months.map((m) => (s.byMonth[m] || 0) * sign)}
                          color={highlight ? '#6366f1' : isDerived ? undefined : (sign < 0 ? '#ef4444' : '#22c55e')}
                        />
                      </td>
                    </tr>
                    {expanded.has(s.key) && s.rows?.map((r) => {
                      const key = r.category_id || `un_${r.category_name}`;
                      const rowExpanded = expanded.has(`${s.key}_${key}`);
                      const hasChildren = r.children && r.children.length > 0;
                      return (
                        <>
                          <tr key={key}>
                            <td style={{ ...tdLeft, paddingLeft: 36, position: 'sticky', left: 0, background: 'var(--bg-primary)', fontSize: 13 }}>
                              {hasChildren ? (
                                <button onClick={() => toggleExpand(`${s.key}_${key}`)} style={expandBtn}>
                                  {rowExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                </button>
                              ) : <span style={{ display: 'inline-block', width: 18 }} />}
                              {r.category_icon ? <span style={{ marginRight: 4 }}>{r.category_icon}</span> : null}
                              {r.category_name}
                            </td>
                            {data.months.map((m) => {
                              const v = (r.months[m] || 0) * sign;
                              return (
                                <td key={m} style={{ ...td, fontSize: 13, cursor: v !== 0 ? 'pointer' : 'default', color: v === 0 ? 'var(--text-secondary)' : undefined }}
                                  onClick={() => v !== 0 && setDrillDown({ month: m, categoryId: r.category_id, categoryName: r.category_name })}
                                >
                                  {formatK(v)}
                                </td>
                              );
                            })}
                            <td style={{ ...td, fontSize: 13, fontWeight: 600, background: 'var(--bg-secondary)' }}>{formatK(r.total * sign)}</td>
                            <td style={{ ...td, fontSize: 13, color: 'var(--text-secondary)' }}></td>
                            <td style={{ ...td, textAlign: 'center', padding: '4px 8px' }}>
                              <Sparkline
                                values={data.months.map((m) => (r.months[m] || 0) * sign)}
                                color={sign < 0 ? '#ef4444' : '#22c55e'}
                                height={22}
                                width={100}
                              />
                            </td>
                          </tr>
                          {rowExpanded && r.children?.map((c) => (
                            <tr key={c.category_id}>
                              <td style={{ ...tdLeft, paddingLeft: 68, fontSize: 12, color: 'var(--text-secondary)', position: 'sticky', left: 0, background: 'var(--bg-primary)' }}>
                                └ {c.category_name}
                              </td>
                              {data.months.map((m) => {
                                const v = (c.months[m] || 0) * sign;
                                return (
                                  <td key={m} style={{ ...td, fontSize: 12, color: 'var(--text-secondary)', cursor: v !== 0 ? 'pointer' : 'default' }}
                                    onClick={() => v !== 0 && setDrillDown({ month: m, categoryId: c.category_id, categoryName: c.category_name })}
                                  >
                                    {formatK(v)}
                                  </td>
                                );
                              })}
                              <td style={{ ...td, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{formatK(c.total * sign)}</td>
                              <td style={td}></td>
                              <td style={{ ...td, textAlign: 'center', padding: '4px 8px' }}>
                                <Sparkline
                                  values={data.months.map((m) => (c.months[m] || 0) * sign)}
                                  color={sign < 0 ? '#ef4444' : '#22c55e'}
                                  height={18}
                                  width={80}
                                />
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {drillDown && (
        <DrillDownModal
          month={drillDown.month}
          categoryId={drillDown.categoryId}
          categoryName={drillDown.categoryName}
          basis={basis}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}

const backLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: 8,
  background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-primary)', textDecoration: 'none',
};
const tabBtn: React.CSSProperties = {
  padding: '6px 12px', border: 'none', background: 'transparent',
  color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 6, fontSize: 13, fontWeight: 500,
};
const tabActive: React.CSSProperties = { background: 'var(--bg-primary)', color: 'var(--text-primary)', fontWeight: 600, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
const input: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 8, fontSize: 13,
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
};
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' };
const th: React.CSSProperties = {
  textAlign: 'right', padding: '10px 12px', fontWeight: 600, fontSize: 12,
  color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border-primary)' };
const tdLeft: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap' };
const expandBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, marginRight: 4,
  color: 'var(--text-secondary)', verticalAlign: 'middle',
};
