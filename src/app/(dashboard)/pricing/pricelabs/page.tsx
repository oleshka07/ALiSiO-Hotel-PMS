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

export default function PriceLabsPreviewPage() {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [filterId, setFilterId] = useState<string>('');

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
        setError(j.error || j.detail || 'Помилка');
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
