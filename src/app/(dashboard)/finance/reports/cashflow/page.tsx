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
  classifier: string | null;
  parent_id: string | null;
  op_type: string;
  months: Record<string, number>;
  total: number;
  children?: MatrixRow[];
}

interface CashflowData {
  months: string[];
  basis: string;
  income: { roots: MatrixRow[]; byMonth: Record<string, number>; total: number };
  expense: { roots: MatrixRow[]; byMonth: Record<string, number>; total: number };
  netByMonth: Record<string, number>;
  netTotal: number;
  monthBalances: Record<string, { opening: number; ending: number }>;
}

function monthLabel(m: string): string {
  const names = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
  const [y, mm] = m.split('-');
  return `${names[Number(mm) - 1]} ${y.slice(2)}`;
}

function formatK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  if (n === 0) return '—';
  return n.toFixed(0);
}

function defaultRange(): { from: string; to: string } {
  const t = new Date();
  const to = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  const f = new Date(t.getFullYear(), t.getMonth() - 5, 1);
  const from = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
  return { from, to };
}

export default function CashflowMatrixPage() {
  const [data, setData] = useState<CashflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(defaultRange());
  const [basis, setBasis] = useState<'paid' | 'accrued'>('paid');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drillDown, setDrillDown] = useState<{ month: string; categoryId: string | null; categoryName: string; opType?: 'income' | 'expense' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, basis });
      if (tagIds.length > 0) params.set('tag_ids', tagIds.join(','));
      const res = await fetch(`/api/finance/cashflow-matrix?${params}`);
      setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [range, basis, tagIds]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="page-container" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/finance/reports" style={backLink}><ArrowLeft size={14} /></Link>
        <h1 style={{ margin: 0, flex: 1 }}>💰 Cash Flow</h1>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border-primary)' }}>
          <button onClick={() => setBasis('paid')} style={{ ...tabBtn, ...(basis === 'paid' ? tabActive : {}) }}>По факту</button>
          <button onClick={() => setBasis('accrued')} style={{ ...tabBtn, ...(basis === 'accrued' ? tabActive : {}) }}>По нарахуванню</button>
        </div>
        <input type="month" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} style={input} />
        <span style={{ color: 'var(--text-secondary)' }}>—</span>
        <input type="month" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} style={input} />
        <TagFilter selected={tagIds} onChange={setTagIds} />
        <ExportButton
          endpoint="/api/finance/export/cashflow"
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
                <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 2, minWidth: 260 }}>Категорія</th>
                {data.months.map((m) => <th key={m} style={th}>{monthLabel(m)}</th>)}
                <th style={{ ...th, background: 'var(--bg-secondary)' }}>Σ</th>
                <th style={th}>Середнє</th>
                <th style={{ ...th, textAlign: 'center', minWidth: 120 }}>Тренд</th>
              </tr>
            </thead>
            <tbody>
              {/* Income section */}
              <SectionRow label="+ Надходження" color="#22c55e" months={data.months} byMonth={data.income.byMonth} total={data.income.total} />
              {data.income.roots.map((r) => (
                <CategoryRows key={r.category_id || `un_${r.category_name}`} row={r} months={data.months} expanded={expanded} onToggle={toggleExpand} onDrillDown={(m) => setDrillDown({ month: m, categoryId: r.category_id, categoryName: r.category_name, opType: 'income' })} />
              ))}

              <tr><td colSpan={data.months.length + 4} style={{ height: 8, background: 'var(--bg-secondary)' }}></td></tr>

              {/* Expense section */}
              <SectionRow label="− Видатки" color="#ef4444" months={data.months} byMonth={data.expense.byMonth} total={data.expense.total} />
              {data.expense.roots.map((r) => (
                <CategoryRows key={r.category_id || `un_${r.category_name}`} row={r} months={data.months} expanded={expanded} onToggle={toggleExpand} onDrillDown={(m) => setDrillDown({ month: m, categoryId: r.category_id, categoryName: r.category_name, opType: 'expense' })} />
              ))}

              <tr><td colSpan={data.months.length + 4} style={{ height: 8, background: 'var(--bg-secondary)' }}></td></tr>

              {/* Net flow */}
              <tr style={netRowStyle}>
                <td style={{ ...tdLeft, fontWeight: 700 }}>= Чистий потік</td>
                {data.months.map((m) => (
                  <td key={m} style={{ ...td, fontWeight: 700, color: data.netByMonth[m] >= 0 ? '#22c55e' : '#ef4444' }}>
                    {formatK(data.netByMonth[m])}
                  </td>
                ))}
                <td style={{ ...td, fontWeight: 700, color: data.netTotal >= 0 ? '#22c55e' : '#ef4444', background: 'var(--bg-secondary)' }}>
                  {formatK(data.netTotal)}
                </td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatK(data.netTotal / data.months.length)}</td>
                <td style={{ ...td, textAlign: 'center', padding: '4px 8px' }}>
                  <Sparkline values={data.months.map((m) => data.netByMonth[m] || 0)} color="#6366f1" />
                </td>
              </tr>

              {/* Balances */}
              <tr style={balanceRowStyle}>
                <td style={{ ...tdLeft, color: 'var(--text-secondary)' }}>Залишок на початок</td>
                {data.months.map((m) => (
                  <td key={m} style={{ ...td, color: 'var(--text-secondary)' }}>{formatK(data.monthBalances[m].opening)}</td>
                ))}
                <td style={{ ...td, background: 'var(--bg-secondary)' }}></td>
                <td style={td}></td>
                <td style={td}></td>
              </tr>
              <tr style={balanceRowStyle}>
                <td style={{ ...tdLeft, fontWeight: 600 }}>Залишок на кінець</td>
                {data.months.map((m) => (
                  <td key={m} style={{ ...td, fontWeight: 600, color: data.monthBalances[m].ending < 0 ? '#ef4444' : 'var(--text-primary)' }}>
                    {formatK(data.monthBalances[m].ending)}
                  </td>
                ))}
                <td style={{ ...td, background: 'var(--bg-secondary)' }}></td>
                <td style={td}></td>
                <td style={{ ...td, textAlign: 'center', padding: '4px 8px' }}>
                  <Sparkline
                    values={data.months.map((m) => data.monthBalances[m].ending)}
                    color="#0ea5e9"
                    showZeroLine={true}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {drillDown && (
        <DrillDownModal
          month={drillDown.month}
          categoryId={drillDown.categoryId}
          categoryName={drillDown.categoryName}
          opType={drillDown.opType}
          basis={basis}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}

function SectionRow({ label, color, months, byMonth, total }: { label: string; color: string; months: string[]; byMonth: Record<string, number>; total: number }) {
  return (
    <tr style={{ background: 'var(--bg-secondary)', opacity: 0.9 }}>
      <td style={{ ...tdLeft, fontWeight: 600, color, position: 'sticky', left: 0, background: 'var(--bg-secondary)' }}>{label}</td>
      {months.map((m) => <td key={m} style={{ ...td, fontWeight: 600, color }}>{formatK(byMonth[m] || 0)}</td>)}
      <td style={{ ...td, fontWeight: 700, color, background: 'var(--bg-secondary)' }}>{formatK(total)}</td>
      <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatK(total / months.length)}</td>
      <td style={{ ...td, textAlign: 'center', padding: '4px 8px' }}>
        <Sparkline values={months.map((m) => byMonth[m] || 0)} color={color} />
      </td>
    </tr>
  );
}

function CategoryRows({ row, months, expanded, onToggle, onDrillDown }: {
  row: MatrixRow; months: string[]; expanded: Set<string>; onToggle: (id: string) => void; onDrillDown: (month: string) => void;
}) {
  const key = row.category_id || `un_${row.category_name}`;
  const isExpanded = expanded.has(key);
  const hasChildren = row.children && row.children.length > 0;

  return (
    <>
      <tr>
        <td style={{ ...tdLeft, paddingLeft: 20, position: 'sticky', left: 0, background: 'var(--bg-primary)' }}>
          {hasChildren ? (
            <button onClick={() => onToggle(key)} style={expandBtn}>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : <span style={{ display: 'inline-block', width: 20 }} />}
          {row.category_icon ? <span style={{ marginRight: 4 }}>{row.category_icon}</span> : null}
          {row.category_name}
        </td>
        {months.map((m) => {
          const val = row.months[m] || 0;
          return (
            <td
              key={m}
              style={{ ...td, cursor: val !== 0 ? 'pointer' : 'default', color: val === 0 ? 'var(--text-secondary)' : 'inherit' }}
              onClick={() => val !== 0 && onDrillDown(m)}
            >
              {formatK(val)}
            </td>
          );
        })}
        <td style={{ ...td, fontWeight: 600, background: 'var(--bg-secondary)' }}>{formatK(row.total)}</td>
        <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatK(row.total / months.length)}</td>
        <td style={{ ...td, textAlign: 'center', padding: '4px 8px' }}>
          <Sparkline values={months.map((m) => row.months[m] || 0)} height={22} width={100} />
        </td>
      </tr>
      {isExpanded && row.children?.map((child) => (
        <tr key={child.category_id}>
          <td style={{ ...tdLeft, paddingLeft: 50, fontSize: 13, color: 'var(--text-secondary)', position: 'sticky', left: 0, background: 'var(--bg-primary)' }}>
            └ {child.category_icon ? <span style={{ marginRight: 4 }}>{child.category_icon}</span> : null}
            {child.category_name}
          </td>
          {months.map((m) => {
            const val = child.months[m] || 0;
            return (
              <td key={m} style={{ ...td, fontSize: 13, cursor: val !== 0 ? 'pointer' : 'default', color: val === 0 ? 'var(--text-secondary)' : 'var(--text-secondary)' }}
                  onClick={() => val !== 0 && onDrillDown(m)}>
                {formatK(val)}
              </td>
            );
          })}
          <td style={{ ...td, fontSize: 13, background: 'var(--bg-secondary)' }}>{formatK(child.total)}</td>
          <td style={{ ...td, fontSize: 13, color: 'var(--text-secondary)' }}>{formatK(child.total / months.length)}</td>
          <td style={{ ...td, textAlign: 'center', padding: '4px 8px' }}>
            <Sparkline values={months.map((m) => child.months[m] || 0)} height={18} width={80} />
          </td>
        </tr>
      ))}
    </>
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
const netRowStyle: React.CSSProperties = { background: 'rgba(99,102,241,0.06)' };
const balanceRowStyle: React.CSSProperties = { background: 'var(--bg-secondary)' };
const expandBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, marginRight: 4,
  color: 'var(--text-secondary)', verticalAlign: 'middle',
};
