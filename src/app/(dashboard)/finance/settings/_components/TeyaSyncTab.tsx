'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface SyncStatus {
  never_run?: boolean;
  from?: string;
  to?: string;
  fetched?: number;
  matched?: number;
  created?: number;
  skipped?: number;
  errors?: number;
  ran_at?: string;
  updated_at?: string;
}

interface SyncOutcome {
  txn_id: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  outcome: 'matched' | 'created' | 'skipped' | 'error';
  operation_id?: string;
  message?: string;
}

interface SyncResult {
  ok: boolean;
  from: string;
  to: string;
  fetched: number;
  matched: number;
  created: number;
  skipped: number;
  errors: number;
  outcomes: SyncOutcome[];
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getTime() - 7 * 24 * 3600 * 1000);
  return {
    from: from.toISOString().substring(0, 10),
    to: today.toISOString().substring(0, 10),
  };
}

export default function TeyaSyncTab() {
  const [range, setRange] = useState(defaultRange());
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [csvCurrency, setCsvCurrency] = useState('CZK');
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);

  async function importCsv(file: File) {
    setCsvBusy(true);
    setCsvMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('currency', csvCurrency);
      const res = await fetch('/api/finance/teya/import-csv', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) setCsvMsg(`❌ ${json.error || 'Помилка імпорту'}`);
      else {
        setCsvMsg(`✅ Звірка (нічого не записано в операції). Оброблено ${json.parsedRows} на ${Number(json.grossTotal || 0).toLocaleString('uk-UA')} ${json.currency}, вже у PMS ${json.matched}, нових ${json.newRows}, пропущено ${json.skippedRows}. Гроші приходять з банк-виписки.`);
        fetchStatus();
      }
    } catch (e: any) { setCsvMsg(`❌ ${e.message}`); }
    setCsvBusy(false);
  }

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/teya/sync');
      const json = await res.json();
      setStatus(json);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function runSync() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/finance/teya/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: range.from, to: range.to }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(`${json.error || 'Sync failed'}${json.hint ? ` — ${json.hint}` : ''}`);
      } else {
        setResult(json);
        fetchStatus();
      }
    } catch (e: any) {
      setError(e.message);
    }
    setRunning(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <CreditCard size={20} color="#3b82f6" />
        <h2 style={{ margin: 0, fontSize: 18 }}>Teya — синхронізація транзакцій</h2>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Підтягує всі Teya-транзакції за період через API. Webhook ловить тільки платежі через наш checkout —
        платежі з телефону / POS-терміналу / ресторану повз нього. Цей sync їх дотягує і створює fin_operations
        для ще-не-записаних. <b>Дублі не створюються</b> — матчинг по transaction_id.
      </p>

      {/* CSV import — reliable fallback for terminal/POS payments */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>📄 Імпорт CSV (експорт транзакцій Teya)</span>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Валюта:</label>
        <select value={csvCurrency} onChange={e => setCsvCurrency(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6 }}>
          <option value="CZK">CZK</option>
          <option value="EUR">EUR</option>
        </select>
        <input
          type="file"
          accept=".csv,.txt,text/csv"
          disabled={csvBusy}
          onChange={e => { const f = e.target.files?.[0]; if (f) importCsv(f); e.currentTarget.value = ''; }}
          style={{ fontSize: 12 }}
        />
        {csvBusy && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Обробка…</span>}
        {csvMsg && <span style={{ fontSize: 12 }}>{csvMsg}</span>}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Період:</label>
        <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} style={input} />
        <span style={{ color: 'var(--text-secondary)' }}>—</span>
        <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} style={input} />
        <button
          onClick={runSync}
          disabled={running}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6,
            cursor: running ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13,
            opacity: running ? 0.7 : 1, marginLeft: 'auto',
          }}
        >
          <RefreshCw size={14} style={running ? { animation: 'spin 1s linear infinite' } : undefined} />
          {running ? 'Синхронізація…' : 'Запустити sync'}
        </button>
      </div>

      {/* Last sync status */}
      {status && !status.never_run && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, padding: '8px 12px', borderLeft: '3px solid var(--border-primary)' }}>
          Останній запуск: <b>{status.updated_at}</b> · період <b>{status.from} → {status.to}</b><br />
          Знайдено <b>{status.fetched}</b> · вже у PMS <b>{status.matched}</b> · нових (звірка) <b>{status.created}</b> · пропущено <b>{status.skipped}</b>
          {(status.errors ?? 0) > 0 && <span style={{ color: '#ef4444' }}> · errors <b>{status.errors}</b></span>}
        </div>
      )}

      {error && (
        <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
          <b>Помилка:</b> {error}
        </div>
      )}

      {result && (
        <div style={{ padding: 16, border: '1px solid var(--border-primary)', borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            Результат sync: {result.from} → {result.to}
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13, flexWrap: 'wrap' }}>
            <span>Знайдено в Teya: <b>{result.fetched}</b></span>
            <span style={{ color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={14} /> Matched (вже у PMS): <b>{result.matched}</b>
            </span>
            <span style={{ color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={14} /> Нових (ще не в банку): <b>{result.created}</b>
            </span>
            {result.skipped > 0 && (
              <span style={{ color: 'var(--text-secondary)' }}>Skipped: <b>{result.skipped}</b></span>
            )}
            {result.errors > 0 && (
              <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={14} /> Errors: <b>{result.errors}</b>
              </span>
            )}
          </div>

          {result.created > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>
                Показати нові ({result.created}) — є в Teya, ще немає в банк-виписці (не записано)
              </summary>
              <table style={{ width: '100%', marginTop: 8, fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr><th style={th}>Txn ID</th><th style={th}>Дата</th><th style={th}>Сума</th><th style={th}>Status</th></tr>
                </thead>
                <tbody>
                  {result.outcomes.filter((o) => o.outcome === 'created').map((o, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-primary)' }}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{o.txn_id.substring(0, 16)}…</td>
                      <td style={td}>{o.created_at?.substring(0, 19).replace('T', ' ')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{o.amount.toFixed(2)} {o.currency}</td>
                      <td style={td}>{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {result.errors > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                Помилки ({result.errors})
              </summary>
              <ul style={{ margin: '8px 0', paddingLeft: 20, fontSize: 12 }}>
                {result.outcomes.filter((o) => o.outcome === 'error').map((o, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <b>{o.txn_id || '(no id)'}</b>: {o.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <b>Налаштування:</b> Teya OAuth credentials мають містити scope <code style={{ padding: '1px 4px', background: 'var(--bg-primary)', borderRadius: 3 }}>transactions/list</code>.
        Якщо отримуєш 401/403 — зайди в Teya developer портал і додай цей scope до твого app, потім запусти sync знову.
        <br /><br />
        <b>Це лише звірка — в операції нічого не пишеться.</b> Гроші в операції приходять <u>тільки</u> з банк-виписки та ручної готівки.
        Teya виплачує на банк денним батчем, тож запис платежів тут дублював би ті самі гроші. «Нові» = є в Teya, але ще не впали в банк-виписку (зʼявляться пізніше самі).
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid var(--border-primary)',
  borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)',
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '6px 8px', fontWeight: 600, fontSize: 11,
  color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)',
};
const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'middle' };
