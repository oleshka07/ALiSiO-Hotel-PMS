'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, ChevronDown, Search, RefreshCw } from 'lucide-react';

interface AuditEntry {
  id: string;
  reservation_id: string;
  action: string;
  details: string;
  user_id: string | null;
  user_name: string | null;
  before_json: string | null;
  after_json: string | null;
  booking_label: string | null;
  created_at: string;
}

const ACTION_ICONS: Record<string, string> = {
  created: '✨', deleted: '🗑️', status_change: '🔄', payment_status_change: '💰',
  price_change: '💲', unit_change: '🏠', dates_change: '📅',
  registration_change: '📋', notes_change: '📝', internal_notes_change: '📝',
  payment_marker: '💳',
};

const ACTION_COLORS: Record<string, string> = {
  created: '#4ADE80', deleted: '#F26B6B', status_change: '#5B7CFF',
  payment_status_change: '#F5B847', price_change: '#F5B847',
  unit_change: '#A78BFA', dates_change: '#A78BFA',
  registration_change: '#5B7CFF', notes_change: '#8B99AE',
  internal_notes_change: '#8B99AE', payment_marker: '#F5B847',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'Створення', deleted: 'Видалення', status_change: 'Зміна статусу',
  payment_status_change: 'Зміна оплати', price_change: 'Зміна ціни',
  unit_change: 'Зміна кімнати', dates_change: 'Зміна дат',
  registration_change: 'Реєстрація', notes_change: 'Нотатки',
  internal_notes_change: 'Внутр. нотатки', payment_marker: 'Платіж',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [limit, setLimit] = useState(50);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      const res = await fetch(`/api/audit/bookings?${params}`);
      if (res.status === 403) {
        setLogs([]);
        return;
      }
      const data = await res.json();
      setLogs(data.items || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [limit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = logs.filter(log => {
    if (actionFilter && log.action !== actionFilter) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return (
        (log.details || '').toLowerCase().includes(q) ||
        (log.user_name || '').toLowerCase().includes(q) ||
        (log.booking_label || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by date
  const grouped = filtered.reduce<Record<string, AuditEntry[]>>((acc, log) => {
    const d = new Date(log.created_at + 'Z');
    const key = d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(log);
    return acc;
  }, {});

  const uniqueActions = [...new Set(logs.map(l => l.action))].sort();

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Clock size={24} style={{ color: 'var(--text-accent)' }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Журнал бронювань
        </h1>
        <button
          onClick={fetchLogs}
          disabled={loading}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-primary)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Оновити
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-tertiary)',
          }} />
          <input
            placeholder="Пошук по імені, гостю, деталям..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
              border: '1px solid var(--border-primary)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: 13, outline: 'none',
            }}
          />
        </div>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-primary)',
            background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13,
            cursor: 'pointer', minWidth: 160,
          }}
        >
          <option value="">Всі дії</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
          ))}
        </select>
        <select
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-primary)',
            background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <option value={50}>50 записів</option>
          <option value={100}>100 записів</option>
          <option value={200}>200 записів</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
          Завантаження...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: 'var(--text-tertiary)',
          background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-primary)',
        }}>
          <Clock size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontSize: 15 }}>Немає записів</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Зміни будуть з'являтися тут автоматично</div>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--border-primary)', overflow: 'hidden',
        }}>
          {Object.entries(grouped).map(([dateLabel, entries]) => (
            <div key={dateLabel}>
              {/* Date header */}
              <div style={{
                padding: '10px 16px', background: 'var(--bg-page)',
                fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: 0.5,
                borderBottom: '1px solid var(--border-primary)',
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                {dateLabel}
              </div>

              {entries.map((log) => {
                const d = new Date(log.created_at + 'Z');
                const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
                const color = ACTION_COLORS[log.action] || 'var(--text-primary)';
                const icon = ACTION_ICONS[log.action] || '📌';
                const isExpanded = expandedId === log.id;

                return (
                  <div
                    key={log.id}
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    style={{
                      padding: '12px 16px', borderBottom: '1px solid var(--border-primary)',
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.03))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Icon */}
                    <div style={{
                      fontSize: 20, flexShrink: 0, marginTop: 2,
                      width: 32, height: 32, borderRadius: 8,
                      background: `${color}15`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color }}>
                          {log.details}
                        </div>
                        <div style={{
                          fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap',
                          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        }}>
                          {time}
                        </div>
                      </div>

                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: 3, gap: 8,
                      }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {log.booking_label || log.reservation_id}
                        </div>
                        <div style={{
                          fontSize: 11, color: log.user_name ? 'var(--text-accent)' : 'var(--text-tertiary)',
                          whiteSpace: 'nowrap',
                        }}>
                          {log.user_name || 'Система'}
                        </div>
                      </div>

                      {/* Expanded — before/after diff */}
                      {isExpanded && (log.before_json || log.after_json) && (
                        <div style={{
                          marginTop: 10, padding: 10, borderRadius: 8,
                          background: 'var(--bg-page)', fontSize: 11,
                          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                          lineHeight: 1.5, maxHeight: 300, overflowY: 'auto',
                        }}>
                          {(() => {
                            try {
                              const before = log.before_json ? JSON.parse(log.before_json) : {};
                              const after = log.after_json ? JSON.parse(log.after_json) : {};
                              const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
                              const changed = allKeys.filter(k =>
                                JSON.stringify(before[k]) !== JSON.stringify(after[k]) &&
                                !['updated_at', 'created_at'].includes(k)
                              );
                              if (changed.length === 0) return <span style={{ color: 'var(--text-tertiary)' }}>Без змін у полях</span>;
                              return changed.map(k => (
                                <div key={k} style={{ marginBottom: 4 }}>
                                  <span style={{ color: 'var(--text-tertiary)' }}>{k}: </span>
                                  {before[k] !== undefined && (
                                    <span style={{ color: '#F26B6B', textDecoration: 'line-through' }}>
                                      {String(before[k] ?? '—')}
                                    </span>
                                  )}
                                  {before[k] !== undefined && after[k] !== undefined && ' → '}
                                  {after[k] !== undefined && (
                                    <span style={{ color: '#4ADE80' }}>
                                      {String(after[k] ?? '—')}
                                    </span>
                                  )}
                                </div>
                              ));
                            } catch { return <span style={{ color: 'var(--text-tertiary)' }}>Помилка парсингу</span>; }
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Expand chevron */}
                    {(log.before_json || log.after_json) && (
                      <ChevronDown
                        size={14}
                        style={{
                          flexShrink: 0, marginTop: 4, color: 'var(--text-tertiary)',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                          transition: 'transform 0.2s',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
