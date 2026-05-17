'use client';

import { useEffect, useState } from 'react';

interface Section {
  key: string;
  title: string;
  severity: 'green' | 'yellow' | 'red' | 'info';
  headline: string;
  metric_label?: string;
  metric_value?: string;
  description?: string;
  details?: any[];
}

interface AuditData {
  generated_at: string;
  totals: Record<string, number>;
  sections: Section[];
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; badge: string; emoji: string }> = {
  red:    { bg: 'bg-red-50',    border: 'border-red-300',    badge: 'bg-red-600 text-white',    emoji: '🔴' },
  yellow: { bg: 'bg-amber-50',  border: 'border-amber-300',  badge: 'bg-amber-500 text-white',  emoji: '🟡' },
  green:  { bg: 'bg-emerald-50',border: 'border-emerald-300',badge: 'bg-emerald-600 text-white',emoji: '✅' },
  info:   { bg: 'bg-slate-50',  border: 'border-slate-300',  badge: 'bg-slate-500 text-white',  emoji: 'ℹ️' },
};

export default function FinanceAuditPage() {
  const [data, setData] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/audit', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggle(key: string) {
    const next = new Set(openSections);
    if (next.has(key)) next.delete(key); else next.add(key);
    setOpenSections(next);
  }

  const counts = data
    ? data.sections.reduce(
        (acc, s) => { acc[s.severity] = (acc[s.severity] || 0) + 1; return acc; },
        {} as Record<string, number>,
      )
    : null;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">
            🩺 Аудит фінансової архітектури
          </h1>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? '...' : '↻ Оновити'}
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Read-only діагностика. Тільки читає БД, нічого не міняє. Безпечно тримати на проді.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          <div className="font-semibold mb-1">Помилка завантаження</div>
          <code className="text-xs">{error}</code>
        </div>
      )}

      {loading && !data && (
        <div className="text-slate-500 text-sm">Завантажую...</div>
      )}

      {data && counts && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Summary label="🔴 Критично"   value={counts.red    || 0} />
          <Summary label="🟡 Увага"       value={counts.yellow || 0} />
          <Summary label="✅ ОК"          value={counts.green  || 0} />
          <Summary label="ℹ️ Інфо"        value={counts.info   || 0} />
        </div>
      )}

      {data && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
          <div className="font-semibold text-slate-700 mb-2">Загальна статистика БД</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(data.totals).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-500">{k.replace(/_/g, ' ')}</span>
                <span className="font-mono font-semibold text-slate-900">
                  {typeof v === 'number' ? v.toLocaleString('cs-CZ') : String(v)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-slate-400">
            Згенеровано: {new Date(data.generated_at).toLocaleString('uk-UA')}
          </div>
        </div>
      )}

      {data?.sections.map((s) => {
        const style = SEVERITY_STYLES[s.severity] || SEVERITY_STYLES.info;
        const isOpen = openSections.has(s.key);
        const hasDetails = s.details && s.details.length > 0;

        return (
          <div
            key={s.key}
            className={`rounded-lg border-2 ${style.border} ${style.bg} p-4 space-y-3`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-lg">{style.emoji}</span>
                  <h2 className="font-bold text-slate-900 text-base md:text-lg">{s.title}</h2>
                </div>
                <p className="text-sm text-slate-800">{s.headline}</p>
              </div>

              {s.metric_value && (
                <div className={`shrink-0 px-3 py-2 rounded-md ${style.badge} text-right`}>
                  <div className="text-[10px] uppercase opacity-90">{s.metric_label || 'Метрика'}</div>
                  <div className="text-base font-bold font-mono">{s.metric_value}</div>
                </div>
              )}
            </div>

            {s.description && (
              <p className="text-xs text-slate-600 leading-relaxed">{s.description}</p>
            )}

            {hasDetails && (
              <div>
                <button
                  onClick={() => toggle(s.key)}
                  className="text-xs font-medium text-slate-700 underline"
                >
                  {isOpen
                    ? `▲ Сховати ${s.details!.length} рядків`
                    : `▼ Показати ${s.details!.length} рядків`}
                </button>

                {isOpen && (
                  <div className="mt-2 overflow-x-auto rounded-md bg-white border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          {Object.keys(s.details![0]).map((col) => (
                            <th key={col} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.details!.map((row, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            {Object.values(row).map((val: any, j) => (
                              <td key={j} className="px-2 py-1.5 font-mono text-slate-700 whitespace-nowrap">
                                {val === null || val === undefined
                                  ? <span className="text-slate-400">—</span>
                                  : typeof val === 'number'
                                    ? val.toLocaleString('cs-CZ')
                                    : String(val).length > 60
                                      ? String(val).slice(0, 60) + '…'
                                      : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <footer className="text-xs text-slate-400 text-center pt-4">
        Сторінка тільки для діагностики. Не змінює даних. Не для постійного перегляду гостями.
      </footer>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
