'use client';

import { useEffect, useState, useCallback } from 'react';

interface DayPrice {
  date: string;
  price_eur: number | null;
  price_czk: number;
  user_override_eur: number | null;
  algo_eur: number;
  booking_status: string | null;
  unbookable: boolean;
  min_stay: number | null;
  demand: string | null;
}

interface ListingPreview {
  listing_id: string;
  listing_name: string;
  pms: string;
  currency: string;
  last_refreshed_at: string;
  days: DayPrice[];
}

interface ListingSummary {
  id: string;
  name: string;
  pms: string;
  min: number | null;
  base: number | null;
  max: number | null;
  push_enabled: boolean;
  last_refreshed_at: string;
}

interface PreviewResponse {
  from: string;
  to: string;
  daysAhead: number;
  eurToCzk: number;
  listings: ListingPreview[];
  listingsSummary: ListingSummary[];
}

interface SyncListingResult {
  pl_id: string;
  listing_name: string;
  unit_id: string;
  unit_type_id: string;
  unit_name: string;
  days_written: number;
}
interface SyncResult {
  ok: boolean;
  daysAhead: number;
  dateFrom: string;
  dateTo: string;
  eurToCzk: number;
  listingsResolved: number;
  listingsSkipped: number;
  daysWrittenTotal: number;
  perListing: SyncListingResult[];
  conflicts: Array<{ unit_type_id: string; listing_names: string[] }>;
  errors: string[];
}

export default function PriceLabsPreviewPage() {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [filterId, setFilterId] = useState<string>('');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('days', String(days));
      if (filterId) params.set('listing_id', filterId);
      const res = await fetch(`/api/pricing/pricelabs-preview?${params}`);
      const j = await res.json();
      if (!res.ok) {
        // Surface both fields — `detail` is what carries the real cause
        // (missing PRICELABS_API_KEY, 401 from PriceLabs, etc).
        const msg = [j.error, j.detail].filter(Boolean).join(' — ');
        setError(msg || 'Помилка');
        return;
      }
      setData(j as PreviewResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }, [days, filterId]);

  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>PriceLabs — Preview</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
        Read-only: показує, що PriceLabs віддає по 6 будинках. В БД нічого не пишеться. Конвертація EUR→CZK за щоденним курсом ČNB.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>
          Днів вперед:{' '}
          <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(parseInt(e.target.value, 10) || 30)}
                 style={{ padding: '4px 8px', width: 80, fontSize: 13 }} />
        </label>
        {data && (
          <select value={filterId} onChange={(e) => setFilterId(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: 13 }}>
            <option value="">Усі будинки</option>
            {data.listingsSummary.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
        <button onClick={fetchPreview} disabled={loading}
                style={{ padding: '6px 14px', fontSize: 13, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {loading ? 'Завантаження…' : 'Оновити'}
        </button>
        <button
          onClick={async () => {
            if (!confirm(`Записати ціни PriceLabs у price_calendar на ${days} днів вперед? Перепише існуючі значення для тих самих unit_type + date.`)) return;
            setSyncing(true);
            setSyncResult(null);
            try {
              const r = await fetch(`/api/pricing/pricelabs-sync-manual?days=${days}`, { method: 'POST' });
              const j = await r.json();
              setSyncResult(j);
            } catch (e) {
              setSyncResult({ ok: false, daysAhead: days, dateFrom: '', dateTo: '', eurToCzk: 0, listingsResolved: 0, listingsSkipped: 0, daysWrittenTotal: 0, perListing: [], conflicts: [], errors: [e instanceof Error ? e.message : 'failed'] });
            } finally { setSyncing(false); }
          }}
          disabled={syncing}
          style={{ padding: '6px 14px', fontSize: 13, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {syncing ? 'Sync…' : '⤓ Записати в price_calendar'}
        </button>
        {data && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
            Курс EUR→CZK: <b>{data.eurToCzk.toFixed(3)}</b> · {data.from} — {data.to}
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', marginBottom: 16 }}>
          ❌ {error}
        </div>
      )}

      {syncResult && (
        <div style={{ padding: 16, background: syncResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${syncResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {syncResult.ok ? '✅ Sync завершено' : '⚠️ Sync завершено з помилками'}
          </div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            Записано <b>{syncResult.daysWrittenTotal}</b> днів у price_calendar ({syncResult.dateFrom} → {syncResult.dateTo}).
            Будинків: <b>{syncResult.listingsResolved}</b>
            {syncResult.listingsSkipped > 0 && <> · пропущено: <b>{syncResult.listingsSkipped}</b></>}
          </div>
          {syncResult.perListing.length > 0 && (
            <ul style={{ fontSize: 12, margin: '8px 0', paddingLeft: 20 }}>
              {syncResult.perListing.map((p) => (
                <li key={p.pl_id}>
                  <b>{p.unit_name}</b> · unit_type=<code>{p.unit_type_id.slice(0, 12)}…</code> · {p.days_written} днів
                </li>
              ))}
            </ul>
          )}
          {syncResult.conflicts.length > 0 && (
            <div style={{ marginTop: 8, padding: 8, background: 'rgba(245,158,11,0.1)', borderRadius: 4, fontSize: 12, color: '#92400e' }}>
              ⚠️ <b>Конфлікти unit_type</b> — кілька будинків ділять один тип, останній перезаписав попередні:
              <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                {syncResult.conflicts.map((c, i) => (
                  <li key={i}>{c.listing_names.join(' / ')}</li>
                ))}
              </ul>
            </div>
          )}
          {syncResult.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>
              {syncResult.errors.map((e, i) => <div key={i}>❌ {e}</div>)}
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
            Перевір на сторінці <a href="/pricing" style={{ textDecoration: 'underline' }}>/pricing</a> чи з'явились ціни в календарі для кожного будинку.
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Listings summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 24 }}>
            {data.listingsSummary.map((l) => (
              <div key={l.id} style={{ padding: 12, border: '1px solid var(--border-primary)', borderRadius: 8, background: 'var(--bg-secondary)' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{l.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>{l.id} · {l.pms}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                  <span>Min: <b>{l.min ?? '—'}</b></span>
                  <span>Base: <b>{l.base ?? '—'}</b></span>
                  <span>Max: <b>{l.max ?? '—'}</b></span>
                </div>
                <div style={{ fontSize: 10, color: l.push_enabled ? '#22c55e' : '#f59e0b', marginTop: 4 }}>
                  {l.push_enabled ? '✓ push enabled' : '⚠ push disabled'}
                </div>
              </div>
            ))}
          </div>

          {/* Daily prices per listing */}
          {data.listings.map((l) => (
            <div key={l.listing_id} style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, marginBottom: 8 }}>
                {l.listing_name}{' '}
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>
                  · оновлено {new Date(l.last_refreshed_at).toLocaleString('uk-UA')}
                </span>
              </h2>
              <div style={{ overflowX: 'auto', background: 'var(--surface-elevated)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)' }}>
                      <th style={th}>Дата</th>
                      <th style={th}>Ціна EUR</th>
                      <th style={th}>Ціна CZK</th>
                      <th style={th}>Override</th>
                      <th style={th}>Алгоритм EUR</th>
                      <th style={th}>Min stay</th>
                      <th style={th}>Бронь?</th>
                      <th style={th}>Demand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.days.map((d) => (
                      <tr key={d.date} style={{ borderTop: '1px solid var(--border-light)', background: d.booking_status ? 'rgba(59,130,246,0.04)' : 'transparent' }}>
                        <td style={td}>{d.date}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{d.price_eur ?? '—'}</td>
                        <td style={td}>{d.price_czk.toLocaleString('cs-CZ')}</td>
                        <td style={td}>{d.user_override_eur != null ? <span style={{ color: '#f59e0b' }}>{d.user_override_eur}</span> : '—'}</td>
                        <td style={{ ...td, color: 'var(--text-tertiary)' }}>{d.algo_eur}</td>
                        <td style={td}>{d.min_stay ?? '—'}</td>
                        <td style={td}>{d.booking_status ? <span style={{ color: '#3b82f6' }}>{d.booking_status}</span> : '—'}</td>
                        <td style={{ ...td, color: 'var(--text-tertiary)' }}>{d.demand || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)' };
const td: React.CSSProperties = { padding: '6px 10px' };
