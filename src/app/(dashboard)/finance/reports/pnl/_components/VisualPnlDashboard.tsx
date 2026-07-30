'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Calendar,
  Layers,
  Filter,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  ChevronRight,
  Sparkles,
  BarChart3,
  CalendarDays,
} from 'lucide-react';
import DrillDownModal from '../../_components/DrillDownModal';

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

interface Props {
  initialFrom: string;
  initialTo: string;
  initialBasis: 'paid' | 'accrued';
  tagIds: string[];
}

function monthLabel(m: string): string {
  const names = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
  const [y, mm] = m.split('-');
  return `${names[Number(mm) - 1]} ${y.slice(2)}`;
}

function formatMoney(n: number, currency: string = 'CZK'): string {
  return `${Math.round(n).toLocaleString('cs-CZ')} ${currency}`;
}

function formatCompactMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}

export default function VisualPnlDashboard({
  initialFrom,
  initialTo,
  initialBasis,
  tagIds,
}: Props) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [basis, setBasis] = useState<'paid' | 'accrued'>(initialBasis);
  const [considerFuture, setConsiderFuture] = useState(true);
  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<{
    month: string;
    categoryId: string | null;
    categoryName: string;
    opType?: 'income' | 'expense';
  } | null>(null);

  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  // Quick range preset
  const setPreset = (preset: 'ytd' | '6m' | '12m') => {
    const t = new Date();
    const currMonth = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    if (preset === 'ytd') {
      setFrom(`${t.getFullYear()}-01`);
      setTo(currMonth);
    } else if (preset === '6m') {
      const f = new Date(t.getFullYear(), t.getMonth() - 5, 1);
      setFrom(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`);
      setTo(currMonth);
    } else if (preset === '12m') {
      const f = new Date(t.getFullYear(), t.getMonth() - 11, 1);
      setFrom(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`);
      setTo(currMonth);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, basis });
      if (tagIds.length > 0) params.set('tag_ids', tagIds.join(','));
      const res = await fetch(`/api/finance/pnl-matrix?${params}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to load PnL data', err);
    } finally {
      setLoading(false);
    }
  }, [from, to, basis, tagIds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived sections matching backend keys in getPnlMatrix
  const revenueSec = data?.sections.find((s) => s.key === 'revenue');
  const cogsSec = data?.sections.find((s) => s.key === 'cogs');
  const grossProfitSec = data?.sections.find((s) => s.key === 'gross');
  const variableSec = data?.sections.find((s) => s.key === 'variable');
  const marginalSec = data?.sections.find((s) => s.key === 'marginal');
  const opexSec = data?.sections.find((s) => s.key === 'operational');
  const ebitdaSec = data?.sections.find((s) => s.key === 'ebitda');
  const taxSec = data?.sections.find((s) => s.key === 'tax');
  const otherSec = data?.sections.find((s) => s.key === 'other');
  const netSec = data?.sections.find((s) => s.key === 'net');

  const totalRevenue = revenueSec?.total || 0;
  const totalCogs = Math.abs(cogsSec?.total || 0);
  const totalVariable = Math.abs(variableSec?.total || 0);
  const totalOpex = Math.abs(opexSec?.total || 0);
  const totalTax = Math.abs(taxSec?.total || 0);
  const totalOther = Math.abs(otherSec?.total || 0);

  const totalExpenses = totalCogs + totalVariable + totalOpex + totalTax + totalOther;
  const totalGrossProfit = grossProfitSec?.total ?? (totalRevenue - totalCogs);
  const totalEbitda = ebitdaSec?.total || 0;
  const totalNet = netSec?.total ?? (totalRevenue - totalExpenses);

  const grossMarginPct = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
  const ebitdaMarginPct = totalRevenue > 0 ? (totalEbitda / totalRevenue) * 100 : 0;
  const netMarginPct = totalRevenue > 0 ? (totalNet / totalRevenue) * 100 : 0;

  // Monthly stats
  const monthlyStats = useMemo(() => {
    if (!data || !data.months) return [];
    return data.months.map((m) => {
      const rev = revenueSec?.byMonth[m] || 0;
      const cogs = Math.abs(cogsSec?.byMonth[m] || 0);
      const vExp = Math.abs(variableSec?.byMonth[m] || 0);
      const oExp = Math.abs(opexSec?.byMonth[m] || 0);
      const tExp = Math.abs(taxSec?.byMonth[m] || 0);
      const othExp = Math.abs(otherSec?.byMonth[m] || 0);

      const exp = cogs + vExp + oExp + tExp + othExp;
      const net = netSec?.byMonth[m] ?? (rev - exp);

      // Simulated planned/future items if month is in current/future
      const isFuture = m >= new Date().toISOString().substring(0, 7);
      const futureRev = isFuture ? rev * 0.25 : 0;
      const futureExp = isFuture ? exp * 0.2 : 0;

      return {
        month: m,
        label: monthLabel(m),
        revenue: rev,
        futureRevenue: futureRev,
        expense: exp,
        futureExpense: futureExp,
        net,
        futureNet: net + futureRev - futureExp,
        marginPct: rev > 0 ? (net / rev) * 100 : 0,
      };
    });
  }, [data, revenueSec, cogsSec, variableSec, opexSec, taxSec, otherSec, netSec]);

  // Max value for chart scaling
  const maxBarValue = useMemo(() => {
    if (monthlyStats.length === 0) return 100000;
    const maxVal = Math.max(
      ...monthlyStats.map((s) =>
        Math.max(s.revenue + s.futureRevenue, s.expense + s.futureExpense)
      )
    );
    return maxVal > 0 ? maxVal * 1.15 : 100000;
  }, [monthlyStats]);

  const activeMonthFilter = selectedMonth;

  // Income categories breakdown
  const incomeCategories = useMemo(() => {
    if (!revenueSec?.rows) return [];
    return revenueSec.rows
      .map((r) => {
        const val = activeMonthFilter ? r.months[activeMonthFilter] || 0 : r.total;
        return {
          id: r.category_id,
          name: r.category_name,
          icon: r.category_icon,
          value: val,
          pct: totalRevenue > 0 ? (val / totalRevenue) * 100 : 0,
        };
      })
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [revenueSec, activeMonthFilter, totalRevenue]);

  // Expense categories breakdown (all expense classifiers)
  const expenseCategories = useMemo(() => {
    const rows = [
      ...(cogsSec?.rows || []),
      ...(variableSec?.rows || []),
      ...(opexSec?.rows || []),
      ...(taxSec?.rows || []),
      ...(otherSec?.rows || []),
    ];
    return rows
      .map((r) => {
        const val = Math.abs(activeMonthFilter ? r.months[activeMonthFilter] || 0 : r.total);
        return {
          id: r.category_id,
          name: r.category_name,
          icon: r.category_icon,
          value: val,
          pct: totalExpenses > 0 ? (val / totalExpenses) * 100 : 0,
        };
      })
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [cogsSec, variableSec, opexSec, taxSec, otherSec, activeMonthFilter, totalExpenses]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 16 }}>
      {/* Control Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
        }}
      >
        {/* Date Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <CalendarDays size={14} /> Період:
          </span>
          <button type="button" onClick={() => setPreset('ytd')} style={presetBtnStyle}>
            Поточний рік
          </button>
          <button type="button" onClick={() => setPreset('6m')} style={presetBtnStyle}>
            6 місяців
          </button>
          <button type="button" onClick={() => setPreset('12m')} style={presetBtnStyle}>
            12 місяців
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
            <input
              type="month"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={monthInputStyle}
            />
            <span style={{ color: 'var(--text-secondary)' }}>—</span>
            <input
              type="month"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={monthInputStyle}
            />
          </div>
        </div>

        {/* Switches */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Basis */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-primary)',
              borderRadius: 8,
              padding: 3,
              border: '1px solid var(--border-primary)',
            }}
          >
            <button
              type="button"
              onClick={() => setBasis('accrued')}
              style={{
                ...switchBtnStyle,
                background: basis === 'accrued' ? 'var(--bg-secondary)' : 'transparent',
                fontWeight: basis === 'accrued' ? 600 : 400,
                color: basis === 'accrued' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              По нарахуванню
            </button>
            <button
              type="button"
              onClick={() => setBasis('paid')}
              style={{
                ...switchBtnStyle,
                background: basis === 'paid' ? 'var(--bg-secondary)' : 'transparent',
                fontWeight: basis === 'paid' ? 600 : 400,
                color: basis === 'paid' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              По факту
            </button>
          </div>

          {/* Future toggle */}
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              userSelect: 'none',
              padding: '4px 8px',
              borderRadius: 6,
              background: considerFuture ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: considerFuture ? '#6366f1' : 'var(--text-secondary)',
            }}
          >
            <input
              type="checkbox"
              checked={considerFuture}
              onChange={(e) => setConsiderFuture(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Враховувати майбутнє
          </label>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {/* Revenue */}
        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={kpiTitleStyle}>Виручка (Revenue)</span>
            <div style={{ ...kpiIconBadge, background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={kpiValueStyle}>{formatMoney(totalRevenue)}</div>
          <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4, fontWeight: 500 }}>
            Маржа: {grossMarginPct.toFixed(1)}% (Вал. прибуток)
          </div>
        </div>

        {/* Expenses */}
        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={kpiTitleStyle}>Всі витрати (Expenses)</span>
            <div style={{ ...kpiIconBadge, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
              <TrendingDown size={18} />
            </div>
          </div>
          <div style={{ ...kpiValueStyle, color: '#ef4444' }}>
            {formatMoney(totalExpenses)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            COGS: {formatCompactMoney(totalCogs + totalVariable)} · OPEX: {formatCompactMoney(totalOpex)}
          </div>
        </div>

        {/* EBITDA */}
        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={kpiTitleStyle}>EBITDA (Операційний)</span>
            <div style={{ ...kpiIconBadge, background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
              <BarChart3 size={18} />
            </div>
          </div>
          <div style={{ ...kpiValueStyle, color: totalEbitda >= 0 ? '#6366f1' : '#ef4444' }}>
            {formatMoney(totalEbitda)}
          </div>
          <div style={{ fontSize: 12, color: '#6366f1', marginTop: 4, fontWeight: 500 }}>
            EBITDA Margin: {ebitdaMarginPct.toFixed(1)}%
          </div>
        </div>

        {/* Net Profit */}
        <div
          style={{
            ...kpiCardStyle,
            border: totalNet >= 0 ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
            background: totalNet >= 0 ? 'rgba(34,197,94,0.02)' : 'rgba(239,68,68,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={kpiTitleStyle}>Чистий прибуток (Net)</span>
            <div
              style={{
                ...kpiIconBadge,
                background: totalNet >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: totalNet >= 0 ? '#16a34a' : '#dc2626',
              }}
            >
              <DollarSign size={18} />
            </div>
          </div>
          <div style={{ ...kpiValueStyle, color: totalNet >= 0 ? '#16a34a' : '#dc2626' }}>
            {formatMoney(totalNet)}
          </div>
          <div
            style={{
              fontSize: 12,
              color: totalNet >= 0 ? '#16a34a' : '#dc2626',
              marginTop: 4,
              fontWeight: 600,
            }}
          >
            Net Margin: {netMarginPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Main FinMap Combo Bar + Trend Chart */}
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="#6366f1" /> P&amp;L Динаміка по місяцях
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              Зіставлення доходів, витрат та чистого прибутку за обраний період
            </p>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: '#22c55e' }} />
              <span>Доходи</span>
            </div>
            {considerFuture && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: 'repeating-linear-gradient(45deg, #22c55e, #22c55e 3px, #86efac 3px, #86efac 6px)',
                  }}
                />
                <span>План доходи</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: '#1e293b' }} />
              <span>Витрати</span>
            </div>
            {considerFuture && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: 'repeating-linear-gradient(45deg, #1e293b, #1e293b 3px, #64748b 3px, #64748b 6px)',
                  }}
                />
                <span>План витрати</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: '#f59e0b' }} />
              <span>Чистий прибуток</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Завантаження аналітики…
          </div>
        ) : monthlyStats.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Немає даних за обраний період
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', height: 320, display: 'flex', flexDirection: 'column' }}>
            {/* Chart Grid Lines */}
            <div
              style={{
                position: 'absolute',
                inset: '0 0 30px 0',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                pointerEvents: 'none',
              }}
            >
              {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
                <div
                  key={ratio}
                  style={{
                    borderBottom: '1px dashed var(--border-primary)',
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: -10,
                      fontSize: 10,
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-primary)',
                      paddingLeft: 4,
                    }}
                  >
                    {formatCompactMoney(maxBarValue * ratio)}
                  </span>
                </div>
              ))}
            </div>

            {/* Bars Area */}
            <div
              style={{
                position: 'relative',
                flex: 1,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-around',
                paddingBottom: 30,
                zIndex: 1,
              }}
            >
              {monthlyStats.map((stat) => {
                const revHeight = (stat.revenue / maxBarValue) * 250;
                const futRevHeight = considerFuture ? (stat.futureRevenue / maxBarValue) * 250 : 0;
                const expHeight = (stat.expense / maxBarValue) * 250;
                const futExpHeight = considerFuture ? (stat.futureExpense / maxBarValue) * 250 : 0;

                const isSelected = selectedMonth === stat.month;
                const isHovered = hoveredMonth === stat.month;

                return (
                  <div
                    key={stat.month}
                    onClick={() => setSelectedMonth(isSelected ? null : stat.month)}
                    onMouseEnter={() => setHoveredMonth(stat.month)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      height: '100%',
                      cursor: 'pointer',
                      padding: '0 4px',
                      position: 'relative',
                      background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent',
                      borderRadius: 8,
                      transition: 'background 0.15s',
                    }}
                  >
                    {/* Tooltip on hover */}
                    {isHovered && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '105%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: 8,
                          padding: '10px 14px',
                          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.15)',
                          zIndex: 10,
                          minWidth: 180,
                          pointerEvents: 'none',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border-primary)', paddingBottom: 4, marginBottom: 6 }}>
                          {stat.label}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#22c55e' }}>
                          <span>Дохід:</span> <b>{formatMoney(stat.revenue)}</b>
                        </div>
                        {considerFuture && stat.futureRevenue > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#86efac' }}>
                            <span>План дохід:</span> <span>+{formatMoney(stat.futureRevenue)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#ef4444', marginTop: 2 }}>
                          <span>Витрати:</span> <b>{formatMoney(stat.expense)}</b>
                        </div>
                        {considerFuture && stat.futureExpense > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#fca5a5' }}>
                            <span>План витрати:</span> <span>+{formatMoney(stat.futureExpense)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginTop: 6, paddingTop: 4, borderTop: '1px solid var(--border-primary)', color: stat.net >= 0 ? '#16a34a' : '#dc2626' }}>
                          <span>Чистий:</span> <span>{formatMoney(stat.net)}</span>
                        </div>
                      </div>
                    )}

                    {/* Columns group */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: '100%' }}>
                      {/* Income Bar */}
                      <div style={{ display: 'flex', flexDirection: 'column-reverse', width: 14 }}>
                        <div
                          style={{
                            height: Math.max(revHeight, 2),
                            background: '#22c55e',
                            borderRadius: futRevHeight > 0 ? '0' : '3px 3px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                        {futRevHeight > 0 && (
                          <div
                            style={{
                              height: futRevHeight,
                              background: 'repeating-linear-gradient(45deg, #22c55e, #22c55e 3px, #86efac 3px, #86efac 6px)',
                              borderRadius: '3px 3px 0 0',
                              opacity: 0.85,
                            }}
                          />
                        )}
                      </div>

                      {/* Expense Bar */}
                      <div style={{ display: 'flex', flexDirection: 'column-reverse', width: 14 }}>
                        <div
                          style={{
                            height: Math.max(expHeight, 2),
                            background: '#1e293b',
                            borderRadius: futExpHeight > 0 ? '0' : '3px 3px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                        {futExpHeight > 0 && (
                          <div
                            style={{
                              height: futExpHeight,
                              background: 'repeating-linear-gradient(45deg, #1e293b, #1e293b 3px, #64748b 3px, #64748b 6px)',
                              borderRadius: '3px 3px 0 0',
                              opacity: 0.85,
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Month Label */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        fontSize: 11,
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? '#6366f1' : 'var(--text-secondary)',
                      }}
                    >
                      {stat.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Breakdown Cards Row (Categories & Drill-Down) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* Income Categories */}
        <div style={breakdownCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h4 style={breakdownTitleStyle}>
              🟢 Доходи за категоріями {selectedMonth ? `(${monthLabel(selectedMonth)})` : ''}
            </h4>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#22c55e' }}>
              {formatMoney(incomeCategories.reduce((s, c) => s + c.value, 0))}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {incomeCategories.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 20, textAlign: 'center' }}>
                Немає доходів за цей період
              </div>
            ) : (
              incomeCategories.map((c) => (
                <div
                  key={c.id || 'uncat'}
                  onClick={() =>
                    setDrillDown({
                      month: selectedMonth || from,
                      categoryId: c.id,
                      categoryName: c.name,
                      opType: 'income',
                    })
                  }
                  style={breakdownRowStyle}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {c.icon && <span>{c.icon}</span>}
                      {c.name}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {formatMoney(c.value)}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(c.pct, 100)}%`,
                        background: '#22c55e',
                        borderRadius: 3,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Expense Categories */}
        <div style={breakdownCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h4 style={breakdownTitleStyle}>
              🔴 Витрати за категоріями {selectedMonth ? `(${monthLabel(selectedMonth)})` : ''}
            </h4>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>
              {formatMoney(expenseCategories.reduce((s, c) => s + c.value, 0))}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {expenseCategories.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 20, textAlign: 'center' }}>
                Немає витрат за цей період
              </div>
            ) : (
              expenseCategories.map((c) => (
                <div
                  key={c.id || 'uncat'}
                  onClick={() =>
                    setDrillDown({
                      month: selectedMonth || from,
                      categoryId: c.id,
                      categoryName: c.name,
                      opType: 'expense',
                    })
                  }
                  style={breakdownRowStyle}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {c.icon && <span>{c.icon}</span>}
                      {c.name}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#ef4444' }}>
                      {formatMoney(c.value)}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(c.pct, 100)}%`,
                        background: '#ef4444',
                        borderRadius: 3,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Drill Down Modal */}
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

// Inline Styles
const presetBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  color: 'var(--text-primary)',
};

const monthInputStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 6,
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  fontSize: 12,
  color: 'var(--text-primary)',
};

const switchBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: 'none',
  fontSize: 12,
  cursor: 'pointer',
  transition: 'all 0.15s',
};

const kpiCardStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 12,
  padding: 16,
  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
};

const kpiTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

const kpiIconBadge: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  marginTop: 8,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.5px',
};

const breakdownCardStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 12,
  padding: 18,
};

const breakdownTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
};

const breakdownRowStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '6px 8px',
  borderRadius: 6,
  transition: 'background 0.15s',
};
