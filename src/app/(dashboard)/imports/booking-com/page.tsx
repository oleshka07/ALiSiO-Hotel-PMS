'use client';

import { useState, useRef, useCallback } from 'react';
import type { PreviewResponse, PreviewRow, ConfirmResponse } from '@bookings';

const ACTION_LABELS: Record<PreviewRow['action'], { label: string; color: string }> = {
  'create': { label: 'Створити', color: '#22c55e' },
  'cancel': { label: 'Скасувати', color: '#f59e0b' },
  'skip-already': { label: 'Вже існує', color: '#6b7280' },
  'skip-cancelled-not-found': { label: 'Скасоване, нема в БД', color: '#6b7280' },
  'skip-no-unit-type': { label: 'Тип не знайдено', color: '#ef4444' },
  'skip-no-free-unit': { label: 'Немає вільного юніту', color: '#ef4444' },
};

export default function BookingComImportPage() {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'draft' | 'auto'>('draft');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setConfirmResult(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', importMode);

    try {
      const res = await fetch('/api/imports/booking-com/preview', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Помилка завантаження');
        return;
      }
      setPreview(data as PreviewResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, [importMode]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, [upload]);

  const onConfirm = useCallback(async () => {
    if (!preview) return;
    const toProcess = preview.rows.filter((r) => r.action === 'create' || r.action === 'cancel');
    if (toProcess.length === 0) {
      setError('Нема рядків для імпорту');
      return;
    }
    if (!confirm(`Імпортувати ${toProcess.length} бронювань (${preview.summary.create} створити, ${preview.summary.cancel} скасувати)?`)) return;

    setConfirming(true);
    setError(null);
    try {
      const res = await fetch('/api/imports/booking-com/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview.rows, mode: importMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Помилка імпорту');
        return;
      }
      setConfirmResult(data as ConfirmResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка імпорту');
    } finally {
      setConfirming(false);
    }
  }, [preview]);

  const reset = () => {
    setPreview(null);
    setConfirmResult(null);
    setError(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Імпорт бронювань з Booking.com</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        Завантаж Excel-експорт з Booking Extranet (Reservations → Export → XLS).
        Усі бронювання потраплять у Resort, з дедуплікацією за Book number.
      </p>

      {/* Mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '10px 16px', background: 'var(--surface-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Режим:</span>
        <button
          onClick={() => setImportMode('draft')}
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: importMode === 'draft' ? '2px solid #ef4444' : '1px solid var(--border)',
            background: importMode === 'draft' ? 'rgba(239,68,68,0.1)' : 'transparent',
            color: importMode === 'draft' ? '#ef4444' : 'var(--text-secondary)',
          }}
        >
          📋 В чорновик
        </button>
        <button
          onClick={() => setImportMode('auto')}
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: importMode === 'auto' ? '2px solid #22c55e' : '1px solid var(--border)',
            background: importMode === 'auto' ? 'rgba(34,197,94,0.1)' : 'transparent',
            color: importMode === 'auto' ? '#22c55e' : 'var(--text-secondary)',
          }}
        >
          ⚡ Авто-розподіл
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>
          {importMode === 'draft'
            ? 'Всі бронювання потраплять у Чорновик F — потім розкладете вручну'
            : 'Автоматичний розподіл по кімнатах Building F'}
        </span>
      </div>

      {!preview && !confirmResult && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#4f6ef7' : 'var(--border)'}`,
            background: dragOver ? 'rgba(79,110,247,0.05)' : 'var(--surface-elevated)',
            borderRadius: 12,
            padding: '64px 32px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📥</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            {loading ? 'Завантаження...' : 'Перетягни XLS-файл сюди або клікни щоб обрати'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Підтримуються формати .xls та .xlsx з Booking Extranet
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
        </div>
      )}

      {error && (
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444' }}>
          ❌ {error}
        </div>
      )}

      {preview && !confirmResult && (
        <>
          <div style={{ marginTop: 24, padding: 16, background: 'var(--surface-elevated)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              📄 <b>{fileName}</b> · Знайдено рядків: <b>{preview.totalRowsInFile}</b>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 13 }}>
              <span style={{ color: '#22c55e', fontWeight: 600 }}>+{preview.summary.create}</span> створити ·{' '}
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>{preview.summary.cancel}</span> скасувати ·{' '}
              <span style={{ color: '#6b7280' }}>{preview.summary.skipAlready}</span> вже є ·{' '}
              <span style={{ color: '#ef4444' }}>{preview.summary.skipNoUnitType + preview.summary.skipNoFreeUnit}</span> проблеми
            </div>
            <button
              onClick={onConfirm}
              disabled={confirming || (preview.summary.create === 0 && preview.summary.cancel === 0)}
              style={{
                padding: '8px 16px',
                background: '#22c55e',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: confirming ? 'wait' : 'pointer',
                opacity: confirming || (preview.summary.create === 0 && preview.summary.cancel === 0) ? 0.5 : 1,
              }}
            >
              {confirming ? 'Імпорт...' : '✓ Імпортувати'}
            </button>
            <button
              onClick={reset}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              ✕ Скасувати
            </button>
          </div>

          {!preview.resortPropertyResolved && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 13 }}>
              ⚠️ Не знайдено Resort property у БД. Імпорт неможливий.
            </div>
          )}

          {preview.parseErrors.length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13 }}>
              <b>Помилки парсингу:</b>
              <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                {preview.parseErrors.slice(0, 10).map((e, i) => (
                  <li key={i}>Рядок {e.rowIndex + 1}, поле "{e.field}": {e.reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 16, overflowX: 'auto', background: 'var(--surface-elevated)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  <th style={th}>Дія</th>
                  <th style={th}>Book #</th>
                  <th style={th}>Гість</th>
                  <th style={th}>Дати</th>
                  <th style={th}>Тип кімнати</th>
                  <th style={th}>Юніт</th>
                  <th style={th}>Дорослі/Діти</th>
                  <th style={th}>Сума</th>
                  <th style={th}>Попередження</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => {
                  const meta = ACTION_LABELS[row.action];
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={td}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: meta.color, color: '#fff', fontSize: 10, fontWeight: 600 }}>
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace' }}>{row.bookNumber}</td>
                      <td style={td}>{row.guestName}</td>
                      <td style={td}>{row.checkIn} → {row.checkOut} ({row.duration}н)</td>
                      <td style={td}>{row.unitTypeRaw}{row.rooms > 1 ? ` ×${row.rooms}` : ''}</td>
                      <td style={td}>
                        {row.plannedUnits && row.plannedUnits.length > 0
                          ? row.plannedUnits.map((u) => u.unitName).join(', ')
                          : (row.freeUnitName || '—')}
                      </td>
                      <td style={td}>{row.adults}/{row.children}</td>
                      <td style={td}>{row.priceMajor.toFixed(2)} {row.currency}</td>
                      <td style={{ ...td, color: row.warnings.length > 0 ? '#f59e0b' : 'var(--text-tertiary)' }}>
                        {row.warnings.length > 0 ? row.warnings.join('; ') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmResult && (
        <div style={{ marginTop: 24, padding: 24, background: 'var(--surface-elevated)', borderRadius: 8 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Імпорт завершено</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
            <Stat label="Створено" value={confirmResult.created} color="#22c55e" />
            <Stat label="Скасовано" value={confirmResult.cancelled} color="#f59e0b" />
            <Stat label="Пропущено" value={confirmResult.skipped} color="#6b7280" />
            <Stat label="Помилок" value={confirmResult.failed} color="#ef4444" />
          </div>
          {confirmResult.failed > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: '#ef4444' }}>Деталі помилок</summary>
              <ul style={{ marginTop: 8, fontSize: 12, paddingLeft: 20 }}>
                {confirmResult.details.filter((d) => d.action === 'failed').map((d, i) => (
                  <li key={i}>Book #{d.bookNumber}: {d.error}</li>
                ))}
              </ul>
            </details>
          )}
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: '8px 16px', background: '#4f6ef7', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Імпортувати ще
          </button>
          {importMode === 'draft' && confirmResult.created > 0 && (
            <div style={{ marginTop: 16, padding: '14px 18px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>📋</span>
              <div style={{ flex: 1, fontSize: 13 }}>
                <b>{confirmResult.created} бронювань</b> додано в Чорновик F. Розподіліть їх по кімнатах через календар.
              </div>
              <a
                href="/calendar"
                style={{ padding: '6px 14px', background: '#ef4444', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                → Розподілити
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)' };
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' };

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}
