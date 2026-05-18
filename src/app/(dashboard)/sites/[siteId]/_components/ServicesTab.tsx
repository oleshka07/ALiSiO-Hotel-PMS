'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ToggleRight, ToggleLeft, Upload, Code2 } from 'lucide-react';
import { Modal, CopyBtn } from './SiteHelpers';
import type { SiteService } from '../_types';

export function ServicesTab({ siteId, siteCurrency }: { siteId: string, siteCurrency: string }) {
  const [services, setServices] = useState<SiteService[]>([]);
  const [loading, setLoading] = useState(true);
  const [embedSvc, setEmbedSvc] = useState<SiteService | null>(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/booking-sites/${siteId}/services`);
    const d = await res.json();
    if (Array.isArray(d.services)) {
      const sorted = [...d.services].sort((a, b) => {
        if (a.is_enabled === b.is_enabled) return 0;
        return a.is_enabled ? -1 : 1;
      });
      setServices(sorted);
    }
    setLoading(false);
  }, [siteId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchServices(); }, [fetchServices]);

  const toggle = async (svc: SiteService) => {
    await fetch(`/api/booking-sites/${siteId}/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: svc.id, is_enabled: !svc.is_enabled, price_override: svc.price_override ?? null }),
    });
    fetchServices();
  };

  const embedCode = (svcId: string) =>
    `<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget/service-embed.js"\n  data-service="${svcId}"\n  data-site="${siteId}">\n</script>`;

  const updatePrice = async (svc: SiteService, newPrice: number | null) => {
    await fetch(`/api/booking-sites/${siteId}/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: svc.id, is_enabled: svc.is_enabled, price_override: newPrice }),
    });
    fetchServices();
  };

  const uploadPhoto = async (svc: SiteService, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const uRes = await fetch('/api/photos/upload', { method: 'POST', body: formData });
      const { url } = await uRes.json();
      if (url) {
        await fetch(`/api/booking-sites/${siteId}/services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service_id: svc.id, photo_override: url, is_enabled: svc.is_enabled, price_override: svc.price_override ?? null }),
        });
        fetchServices();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>;

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
        Оберіть сервіси, що доступні для замовлення на цьому сайті.
      </div>
      <table className="data-table">
        <thead><tr><th>Сервіс</th><th>Фото</th><th>Ціна</th><th>Активний</th><th>Embed-код</th></tr></thead>
        <tbody>
          {services.map(svc => (
            <tr key={svc.id}>
              <td>
                <span style={{ fontSize: 18, marginRight: 8 }}>{svc.icon}</span>
                <span style={{ fontWeight: 500 }}>{svc.name}</span>
              </td>
              <td>
                {svc.photo_override ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={svc.photo_override} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                    <label style={{ cursor: 'pointer', fontSize: 12, color: 'var(--brand-blue)' }}>
                      Змінити
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhoto(svc, e)} />
                    </label>
                  </div>
                ) : (
                  <label className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <Upload size={13} /> Додати фото
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhoto(svc, e)} />
                  </label>
                )}
              </td>
              <td style={{ fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    className="form-input"
                    style={{ width: 70, padding: '4px 8px', fontSize: 13, height: 28 }}
                    placeholder={String(svc.price)}
                    defaultValue={svc.price_override ?? ''}
                    onBlur={(e) => {
                      const val = e.target.value;
                      const num = val === '' ? null : Number(val);
                      if (num !== (svc.price_override ?? null)) {
                        updatePrice(svc, num);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{siteCurrency}</span>
                </div>
              </td>
              <td>
                <button className="btn btn-ghost" style={{ padding: '4px 6px' }} onClick={() => toggle(svc)}>
                  {svc.is_enabled
                    ? <ToggleRight size={22} style={{ color: '#22c55e' }} />
                    : <ToggleLeft size={22} style={{ color: 'var(--text-tertiary)' }} />}
                </button>
              </td>
              <td>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEmbedSvc(svc)}>
                  <Code2 size={13} /> Код
                </button>
              </td>
            </tr>
          ))}
          {services.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Немає сервісів. Додайте їх у Налаштування → Послуги.</td></tr>}
        </tbody>
      </table>

      <Modal open={!!embedSvc} onClose={() => setEmbedSvc(null)} title={`Embed-код: ${embedSvc?.name}`} size="lg">
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Вставте цей код на ваш сайт для відображення кнопки замовлення сервісу.
        </div>
        <div style={{ position: 'relative' }}>
          <pre style={{ background: 'var(--surface-secondary)', borderRadius: 8, padding: 16, fontSize: 12, overflowX: 'auto', margin: 0 }}>
            {embedSvc ? embedCode(embedSvc.id) : ''}
          </pre>
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <CopyBtn text={embedSvc ? embedCode(embedSvc.id) : ''} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
