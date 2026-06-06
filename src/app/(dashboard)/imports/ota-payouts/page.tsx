'use client';

import { useState, useRef, useCallback } from 'react';
import type { OtaImportPreview, OtaPreviewRow, OtaImportResult, OtaSource } from '@/modules/finance/api/ota-import.handlers';

// ─── source badges ────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<OtaSource, { label: string; color: string; bg: string; emoji: string }> = {
  airbnb:      { label: 'Airbnb',      color: '#FF5A5F', bg: 'rgba(255,90,95,0.10)',   emoji: '🏠' },
  booking_com: { label: 'Booking.com', color: '#003580', bg: 'rgba(0,53,128,0.10)',    emoji: '🔵' },
};

const ACTION_STYLE: Record<OtaPreviewRow['action'], { label: string; color: string }> = {
  create:         { label: '+ Імпорт',  color: '#22c55e' },
  skip_duplicate: { label: '⟳ Дублікат', color: '#6b7280' },
};

// ─── component ────────────────────────────────────────────────────────────────

export default function OtaPayoutsPage() {
  const [activeTab, setActiveTab] = useState<OtaSource>('airbnb');
  const [preview, setPreview]     = useState<OtaImportPreview | null>(null);
  const [loading, setLoading]     = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult]       = useState<OtaImportResult | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [dragOver, setDragOver]   = useState(false);
  const [fileName, setFileName]   = useState<string | null>(null);
  const [fxRate, setFxRate]       = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  // ── upload + preview ────────────────────────────────────────────

  const upload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    setFileName(file.name);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('source', activeTab);

    try {
      const res  = await fetch('/api/imports/ota/preview', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Помилка парсингу'); return; }
      setPreview(data as OtaImportPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, [upload]);

  // ── confirm ─────────────────────────────────────────────────────

  const onConfirm = useCallback(async () => {
    if (!preview) return;
    const toImport = preview.rows.filter(r => r.action === 'create');
    if (toImport.length === 0) { setError('Нема нових рядків для імпорту'); return; }
    if (!confirm(`Імпортувати ${toImport.length} операцій з ${SOURCE_LABEL[preview.source].label}?`)) return;

    setConfirming(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { rows: preview.rows };
      if (fxRate && parseFloat(fxRate) > 0) body.fx_rate = parseFloat(fxRate);

      const res  = await fetch('/api/imports/ota/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Помилка імпорту'); return; }
      setResult(data as OtaImportResult);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка імпорту');
    } finally {
      setConfirming(false);
    }
  }, [preview, fxRate]);

  const reset = () => {
    setPreview(null);
    setResult(null);
    setError(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // ── tabs ─────────────────────────────────────────────────────────

  const src = SOURCE_LABEL[activeTab];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        📥 Імпорт виписок OTA
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
        Завантаж CSV-виписки з Airbnb або Booking.com — кожна бронь з'явиться як операція в
        {' '}<a href="/documents" style={{ color: '#4f6ef7' }}>Журналі звірки</a>.
        Дублікати автоматично пропускаються.
      </p>

      {/* Tabs */}
      {!preview && !result && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['airbnb', 'booking_com'] as OtaSource[]).map(s => {
            const meta = SOURCE_LABEL[s];
            const active = activeTab === s;
            return (
              <button
                key={s}
                onClick={() => { setActiveTab(s); reset(); }}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                  border: active ? `2px solid ${meta.color}` : '2px solid var(--border)',
                  background: active ? meta.bg : 'transparent',
                  color: active ? meta.color : 'var(--text-secondary)',
                }}
              >
                {meta.emoji} {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Instructions */}
      {!preview && !result && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--surface-elevated)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
          {activeTab === 'airbnb' ? (
            <>
              <b>Airbnb:</b> Зайди в <i>airbnb.com → Керування → Транзакції → Завантажити CSV</i>.
              Виписка містить рядки «Бронювання» та «Компенсація» — система їх розпізнає автоматично.
              Рядки «Payout» (виплата пакетом) не імпортуються.
            </>
          ) : (
            <>
              <b>Booking.com:</b> Зайди в <i>Extranet → Фінанси → Виплати → Завантажити CSV</i> для конкретної виплати.
              Файл містить список бронювань та суму по кожному. Назва файлу відповідає Payout ID.
            </>
          )}
        </div>
      )}

      {/* Drop zone */}
      {!preview && !result && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? src.color : 'var(--border)'}`,
              background: dragOver ? src.bg : 'var(--surface-elevated)',
              borderRadius: 12, padding: '64px 32px',
              textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 52, marginBottom: 12 }}>
              {loading ? '⏳' : src.emoji}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              {loading ? 'Аналізую файл…' : `Перетягни CSV-виписку з ${src.label} сюди або клікни`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Підтримується .csv формат
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }}
            />
          </div>

          {/* EUR rate field */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              💱 Курс EUR→CZK (опційно — якщо не налаштовано в /finance/settings):
            </span>
            <input
              type="number"
              step="0.01"
              placeholder="напр. 25.30"
              value={fxRate}
              onChange={e => setFxRate(e.target.value)}
              style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-primary)',
                fontSize: 13, width: 120,
              }}
            />
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 16, padding: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>
          ❌ {error}
        </div>
      )}

      {/* Preview */}
      {preview && !result && (
        <>
          {/* Header bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 16px', background: 'var(--surface-elevated)', borderRadius: 8, marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>📄 <b>{fileName}</b></span>
              <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 20, background: SOURCE_LABEL[preview.source].bg, color: SOURCE_LABEL[preview.source].color, fontSize: 11, fontWeight: 700 }}>
                {SOURCE_LABEL[preview.source].emoji} {SOURCE_LABEL[preview.source].label}
              </span>
            </div>

            {/* Summary chips */}
            <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
              <Chip color="#22c55e" label={`+${preview.summary.create} нових`} />
              {preview.summary.skip_duplicate > 0 && (
                <Chip color="#6b7280" label={`${preview.summary.skip_duplicate} дублікатів`} />
              )}
              <Chip color="#4f6ef7" label={`${preview.summary.income_total.toFixed(2)} ${preview.summary.currency}`} />
              {preview.summary.expense_total > 0 && (
                <Chip color="#f59e0b" label={`-${preview.summary.expense_total.toFixed(2)} ${preview.summary.currency} коригувань`} />
              )}
            </div>

            {/* EUR rate for confirm step */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Курс EUR→CZK:</span>
              <input
                type="number"
                step="0.01"
                placeholder="авто"
                value={fxRate}
                onChange={e => setFxRate(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, width: 90 }}
              />
            </div>

            <button
              onClick={onConfirm}
              disabled={confirming || preview.summary.create === 0}
              style={{ padding: '8px 18px', background: preview.summary.create > 0 ? '#22c55e' : '#6b7280', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: confirming ? 'wait' : 'pointer', opacity: preview.summary.create === 0 ? 0.5 : 1 }}
            >
              {confirming ? '⏳ Імпортую…' : `✓ Імпортувати ${preview.summary.create} операцій`}
            </button>
            <button onClick={reset} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>
              ✕
            </button>
          </div>

          {/* Preview table */}
          <div style={{ overflowX: 'auto', background: 'var(--surface-elevated)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Дія', 'Код', 'Гість', 'Оголошення', 'Заїзд', 'Виїзд', 'Ніч', 'Вал.', 'Сума (нетто)', 'Gross', 'Дата операції', 'Тип'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => {
                  const a = ACTION_STYLE[row.action];
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)', opacity: row.action === 'skip_duplicate' ? 0.5 : 1 }}>
                      <td style={TD}>
                        <span style={{ padding: '2px 7px', borderRadius: 4, background: a.color, color: '#fff', fontSize: 10, fontWeight: 700 }}>
                          {a.label}
                        </span>
                      </td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#4f6ef7' }}>{row.source_ref}</td>
                      <td style={TD}>{row.guest_name || '—'}</td>
                      <td style={{ ...TD, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.listing || '—'}
                      </td>
                      <td style={TD}>{row.check_in || '—'}</td>
                      <td style={TD}>{row.check_out || '—'}</td>
                      <td style={{ ...TD, textAlign: 'center' }}>{row.nights || '—'}</td>
                      <td style={TD}>{row.currency}</td>
                      <td style={{ ...TD, fontWeight: 600, color: row.op_type === 'expense' ? '#ef4444' : '#22c55e' }}>
                        {row.op_type === 'expense' ? '-' : ''}{row.amount.toFixed(2)}
                      </td>
                      <td style={{ ...TD, color: 'var(--text-tertiary)' }}>
                        {row.gross_amount > 0 && row.gross_amount !== row.amount ? row.gross_amount.toFixed(2) : '—'}
                      </td>
                      <td style={TD}>{row.paid_at || '—'}</td>
                      <td style={{ ...TD, color: 'var(--text-tertiary)' }}>{row.type}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: 24, padding: 24, background: 'var(--surface-elevated)', borderRadius: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
            {result.created > 0 ? '✅ Імпорт завершено' : result.errors > 0 ? '❌ Імпорт не вдався' : '⚪ Нічого нового'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard label="Додано" value={result.created} color="#22c55e" />
            <StatCard label="Дублікати" value={result.skipped} color="#6b7280" />
            <StatCard label="Помилок" value={result.errors} color="#ef4444" />
          </div>

          {/* Prominent error block when nothing was created */}
          {result.created === 0 && result.errors > 0 && (
            <div style={{ padding: '14px 18px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>
                Жодна операція не була збережена. Причина:
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#ef4444' }}>
                {result.errorDetails.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                {result.errorDetails.length > 5 && <li>…і ще {result.errorDetails.length - 5} помилок</li>}
              </ul>
            </div>
          )}

          {result.errorDetails.length > 0 && result.created > 0 && (
            <details style={{ marginBottom: 16 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: '#ef4444' }}>
                Деталі помилок ({result.errorDetails.length})
              </summary>
              <ul style={{ marginTop: 8, fontSize: 12, paddingLeft: 20 }}>
                {result.errorDetails.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}

          {result.created > 0 && (() => {
            // Find the earliest month from the imported rows to link there
            const months = preview?.rows
              ? [...new Set(preview.rows.filter(r => r.action === 'create' && r.paid_at).map(r => r.paid_at.slice(0, 7)))]
                  .sort()
              : [];
            // If operations span multiple months, default to earliest
            const journalMonth = months[0] || new Date().toISOString().slice(0, 7);
            const journalUrl = `/documents?tab=reconciliation&month=${journalMonth}`;
            return (
              <div style={{ padding: '14px 18px', background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>📊</span>
                <div>
                  <b>{result.created} операцій</b> з'явилися в Журналі звірки за <b>{journalMonth}</b>.
                  {months.length > 1 && <span style={{ color: 'var(--text-tertiary)' }}> (і ще {months.slice(1).join(', ')})</span>}
                </div>
                <a href={journalUrl} style={{ padding: '6px 14px', background: '#4f6ef7', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: 'none', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  → Відкрити Журнал
                </a>
              </div>
            );
          })()}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={reset} style={{ padding: '8px 18px', background: '#4f6ef7', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Завантажити ще один файл
            </button>
            <button
              onClick={() => { setActiveTab(activeTab === 'airbnb' ? 'booking_com' : 'airbnb'); reset(); }}
              style={{ padding: '8px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}
            >
              Перейти до {activeTab === 'airbnb' ? 'Booking.com' : 'Airbnb'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, background: `${color}22`, color, fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 8, textAlign: 'center', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 30, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = { padding: '7px 10px', verticalAlign: 'middle' };
