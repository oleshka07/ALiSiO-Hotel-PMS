'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, ChevronDown } from 'lucide-react';
import ExportButton from '../../_components/ExportButton';

interface BusinessUnit {
  id: string;
  name: string;
}

interface Pnl2Row {
  key: string;
  name: string;
  type: 'data' | 'calc' | 'calc_pct';
  buValues: Record<string, number>;
  total: number;
  isSubrow?: boolean;
  children?: Pnl2Row[];
}

interface Pnl2Data {
  month: string;
  businessUnits: BusinessUnit[];
  rows: Pnl2Row[];
}

function formatK(n: number | undefined | null): string {
  if (n === undefined || n === null || n === 0) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return n.toFixed(0);
}

function defaultMonth(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

export default function Pnl2Page() {
  const [data, setData] = useState<Pnl2Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(defaultMonth());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      const res = await fetch(`/api/finance/pnl-2?${params}`);
      setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [month]);

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
        <h1 style={{ margin: 0, flex: 1 }}>📊 P&amp;L (Form 2)</h1>
        
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={input} />
      </div>

      {loading || !data ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження…</div>
      ) : (
        <div style={{ marginTop: 20, overflowX: 'auto', border: '1px solid var(--border-primary)', borderRadius: 10 }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 2, minWidth: 280 }}>Статті / Business Unit</th>
                {data.businessUnits.map((bu) => <th key={bu.id} style={th}>{bu.name}</th>)}
                <th style={{ ...th, background: 'var(--bg-secondary)' }}>Итого</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const isCalc = r.type === 'calc' || r.type === 'calc_pct';
                const isPct = r.type === 'calc_pct';
                
                // Highlight EBITDA, Margins, Net Profit rows
                let highlight = false;
                if (r.key.includes('ebitda') || r.key.includes('margin') || r.key.includes('net')) highlight = true;

                return (
                  <React.Fragment key={r.key}>
                    <tr
                      style={{
                        background: highlight ? 'rgba(99,102,241,0.08)' : isCalc ? 'var(--bg-secondary)' : 'transparent',
                        fontWeight: isCalc || highlight ? 700 : 500,
                      }}
                    >
                      <td style={{ ...tdLeft, position: 'sticky', left: 0, background: highlight ? 'rgba(99,102,241,0.08)' : isCalc ? 'var(--bg-secondary)' : 'var(--bg-primary)' }}>
                        {r.children && r.children.length > 0 ? (
                          <button onClick={() => toggleExpand(r.key)} style={expandBtn}>
                            {expanded.has(r.key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        ) : <span style={{ display: 'inline-block', width: 20 }} />}
                        {r.name}
                      </td>
                      {data.businessUnits.map((bu) => {
                        const val = r.buValues[bu.id] || 0;
                        return (
                          <td key={bu.id} style={{ ...td, color: val < 0 && !isPct ? '#ef4444' : (val > 0 && highlight && !isPct ? '#22c55e' : undefined) }}>
                            {isPct ? `${val}%` : formatK(val)}
                          </td>
                        );
                      })}
                      <td style={{ ...td, background: 'var(--bg-secondary)', color: r.total < 0 && !isPct ? '#ef4444' : (r.total > 0 && highlight && !isPct ? '#22c55e' : undefined) }}>
                        {isPct ? `${r.total}%` : formatK(r.total)}
                      </td>
                    </tr>
                    
                    {expanded.has(r.key) && r.children?.map((c) => (
                      <tr key={c.key}>
                        <td style={{ ...tdLeft, paddingLeft: 36, position: 'sticky', left: 0, background: 'var(--bg-primary)', fontSize: 13, color: 'var(--text-secondary)' }}>
                          └ {c.name}
                        </td>
                        {data.businessUnits.map((bu) => {
                          const val = c.buValues[bu.id] || 0;
                          return (
                            <td key={bu.id} style={{ ...td, fontSize: 13, color: 'var(--text-secondary)' }}>
                              {formatK(val)}
                            </td>
                          );
                        })}
                        <td style={{ ...td, fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{formatK(c.total)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// React import needed for Fragment
import React from 'react';

const backLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: 8,
  background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-primary)', textDecoration: 'none',
};
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
