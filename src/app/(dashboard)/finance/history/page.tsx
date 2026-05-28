'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Filter, History, X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AuditItem {
  id: string;
  operation_id: string;
  action: 'create' | 'update' | 'delete' | 'convert';
  user_id: string | null;
  user_name: string | null;
  before_json: string | null;
  after_json: string | null;
  performed_at: string;
  op_amount: number | null;
  op_currency: string | null;
  op_type: string | null;
  op_comment: string | null;
  account_name: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AUDIT_TRACK_FIELDS = [
  'op_type', 'amount', 'currency', 'paid_at', 'accrued_at',
  'account_from_id', 'account_to_id',
  'category_id', 'project_id', 'counterparty_id',
  'comment', 'status', 'method', 'payment_subtype', 'reservation_id',
] as const;

const actionMeta: Record<AuditItem['action'], { label: string; color: string; bg: string }> = {
  create:  { label: 'Створено',      color: '#16a34a', bg: 'rgba(34,197,94,0.10)' },
  update:  { label: 'Редаговано',    color: '#3b82f6', bg: 'rgba(59,130,246,0.10)' },
  convert: { label: 'Конвертовано',  color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  delete:  { label: 'Видалено',      color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
};

const PAGE_SIZE = 50;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function diffSummary(beforeJson: string | null, afterJson: string | null): string[] {
  try {
    const before = beforeJson ? JSON.parse(beforeJson) : null;
    const after = afterJson ? JSON.parse(afterJson) : null;
    const out: string[] = [];
    for (const key of AUDIT_TRACK_FIELDS) {
      const b = before?.[key];
      const a = after?.[key];
      if (b !== a) {
        const fmt = (v: unknown) => (v == null || v === '' ? '∅' : String(v));
        out.push(`${key}: ${fmt(b)} → ${fmt(a)}`);
      }
    }
    return out;
  } catch { return []; }
}

function formatMoney(n: number, currency: string): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().substring(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().substring(0, 10);
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function FinanceHistoryPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  /* Filters */
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayStr);
  const [actionFilter, setActionFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [search, setSearch] = useState('');

  /* Expanded row ids (for create/delete snapshot toggle) */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (actionFilter) params.set('action', actionFilter);
    if (userSearch.trim()) params.set('user', userSearch.trim());
    if (search.trim()) params.set('search', search.trim());
    try {
      const res = await fetch(`/api/finance/history?${params}`);
      const json = await res.json();
      setItems(json.items || []);
      setTotal(json.total ?? 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, from, to, actionFilter, userSearch, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Reset page when filters change */
  useEffect(() => { setPage(1); }, [from, to, actionFilter, userSearch, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setFrom(monthStart());
    setTo(todayStr());
    setActionFilter('');
    setUserSearch('');
    setSearch('');
  }

  const hasFilters = actionFilter || userSearch.trim() || search.trim();

  return (
    <div className="page-container" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>📋 Історія змін</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Аудит фінансових операцій — хто, що, коли
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} style={{ color: 'var(--text-secondary)' }} />

          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
          <span style={{ color: 'var(--text-secondary)' }}>—</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />

          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={input}>
            <option value="">Всі дії</option>
            <option value="create">Створено</option>
            <option value="update">Редаговано</option>
            <option value="delete">Видалено</option>
            <option value="convert">Конвертовано</option>
          </select>

          <div style={{ position: 'relative', minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Користувач…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              style={{ ...input, paddingLeft: 30, width: '100%' }}
            />
          </div>

          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Пошук у коментарях / операціях…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...input, paddingLeft: 30, width: '100%' }}
            />
          </div>

          {hasFilters && (
            <button onClick={clearFilters} style={clearBtn} title="Скинути фільтри">
              <X size={14} /> Скинути
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <History size={24} style={{ marginBottom: 8, opacity: 0.5, animation: 'spin 1.5s linear infinite' }} />
            <div>Завантаження…</div>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 10 }}>
            Записів не знайдено за обраний період.
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={th}>Дата/час</th>
                  <th style={th}>Дія</th>
                  <th style={th}>Користувач</th>
                  <th style={th}>Операція</th>
                  <th style={{ ...th, textAlign: 'right' }}>Сума</th>
                  <th style={th}>Рахунок</th>
                  <th style={th}>Зміни</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const meta = actionMeta[item.action];
                  const changes = (item.action === 'update' || item.action === 'convert')
                    ? diffSummary(item.before_json, item.after_json)
                    : [];
                  const isExpandable = item.action === 'create' || item.action === 'delete';
                  const isExpanded = expanded.has(item.id);
                  const isSystem = !item.user_id;

                  return (
                    <tr
                      key={item.id}
                      style={{ borderTop: '1px solid var(--border-primary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Date/time */}
                      <td style={{ ...td, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>
                        {new Date(item.performed_at).toLocaleString('cs-CZ')}
                      </td>

                      {/* Action badge */}
                      <td style={td}>
                        <span style={{
                          display: 'inline-flex', padding: '2px 8px', borderRadius: 4,
                          fontSize: 10, fontWeight: 700, color: meta.color, background: meta.bg,
                          textTransform: 'uppercase',
                        }}>
                          {meta.label}
                        </span>
                      </td>

                      {/* User */}
                      <td style={td}>
                        {isSystem
                          ? <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: 12 }}>System</span>
                          : <span style={{ fontSize: 13, fontWeight: 500 }}>{item.user_name}</span>
                        }
                      </td>

                      {/* Operation (type + comment excerpt) */}
                      <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.op_type && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, marginRight: 6,
                            padding: '1px 5px', borderRadius: 3,
                            background: item.op_type === 'income' ? 'rgba(34,197,94,0.10)' :
                                        item.op_type === 'expense' ? 'rgba(220,38,38,0.10)' :
                                        'rgba(99,102,241,0.10)',
                            color: item.op_type === 'income' ? '#16a34a' :
                                   item.op_type === 'expense' ? '#dc2626' : '#6366f1',
                          }}>
                            {item.op_type}
                          </span>
                        )}
                        <span title={item.op_comment || undefined} style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                          {item.op_comment || '—'}
                        </span>
                      </td>

                      {/* Amount */}
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {item.op_amount != null && item.op_currency
                          ? formatMoney(item.op_amount, item.op_currency)
                          : <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        }
                      </td>

                      {/* Account */}
                      <td style={td}>
                        {item.account_name || <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                      </td>

                      {/* Changes */}
                      <td style={{ ...td, maxWidth: 340 }}>
                        {(item.action === 'update' || item.action === 'convert') && (
                          changes.length === 0
                            ? <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>(зміни поза tracked fields)</span>
                            : (
                              <ul style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, paddingLeft: 16, lineHeight: 1.5 }}>
                                {changes.map((c, i) => <li key={i} style={{ fontFamily: 'monospace' }}>{c}</li>)}
                              </ul>
                            )
                        )}
                        {isExpandable && (
                          <button
                            onClick={() => toggleExpand(item.id)}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: meta.color, fontSize: 11, padding: 0, textDecoration: 'underline',
                            }}
                          >
                            {isExpanded ? 'Сховати snapshot' : 'Показати snapshot'}
                          </button>
                        )}
                        {isExpandable && isExpanded && (
                          <pre style={{
                            fontFamily: 'monospace', fontSize: 10,
                            background: 'var(--bg-secondary)', padding: 8, borderRadius: 4,
                            marginTop: 6, overflow: 'auto', maxHeight: 200,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                          }}>
                            {(() => {
                              const raw = item.action === 'create' ? item.after_json : item.before_json;
                              try { return JSON.stringify(JSON.parse(raw || '{}'), null, 2); } catch { return raw || ''; }
                            })()}
                          </pre>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && items.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          marginTop: 16, padding: '12px 0',
        }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ ...paginationBtn, opacity: page <= 1 ? 0.4 : 1 }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Сторінка <b style={{ color: 'var(--text-primary)' }}>{page}</b> з <b style={{ color: 'var(--text-primary)' }}>{totalPages}</b>
            <span style={{ marginLeft: 8, fontSize: 11 }}>({total} записів)</span>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{ ...paginationBtn, opacity: page >= totalPages ? 0.4 : 1 }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline style constants (consistent with operations page)           */
/* ------------------------------------------------------------------ */

const input: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid var(--border-primary)',
  borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)',
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontWeight: 600, fontSize: 12,
  color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)',
};
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle' };
const clearBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px',
  background: 'transparent', border: '1px solid var(--border-primary)',
  borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12,
};
const paginationBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, background: 'var(--bg-secondary)',
  border: '1px solid var(--border-primary)', borderRadius: 6, cursor: 'pointer',
  color: 'var(--text-primary)',
};
