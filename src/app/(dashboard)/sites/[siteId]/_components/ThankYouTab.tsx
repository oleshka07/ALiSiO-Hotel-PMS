'use client';

import { useState } from 'react';
import { Loader2, Check, Save, BarChart2, ExternalLink, Info } from 'lucide-react';
import type { Site, WidgetConfig } from '../_types';

export function ThankYouTab({ site, onUpdate }: { site: Site; onUpdate: (cfg: WidgetConfig) => void }) {
  const [cfg, setCfg] = useState<WidgetConfig>(site.widget_config || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // return_url і thank_you_url — одне і те саме поле, синхронізуємо
  const returnUrl = cfg.return_url || cfg.thank_you_url || '';

  const setReturnUrl = (val: string) =>
    setCfg(c => ({ ...c, return_url: val || undefined, thank_you_url: val || undefined }));

  const save = async () => {
    setSaving(true);
    await fetch(`/api/booking-sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widget_config: cfg }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onUpdate(cfg);
  };

  const bookingUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://alisio.swipescape.eu'}/book?site_id=${site.slug}`;

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(79,110,247,0.12)', color: 'var(--accent-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <BarChart2 size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Конверсії та аналітика</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Pixel і редирект після успішної оплати
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{
        background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 12, padding: '14px 16px', marginBottom: 28, fontSize: 13,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Info size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>Як це працює</span>
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, color: 'var(--text-secondary)' }}>
          <li>Гість відкриває <code>/book?site_id={site.slug}</code> і Pixel ініціалізується</li>
          <li>Оплачує через Teya → система підтверджує і надсилає email</li>
          <li>Pixel стріляє <code>Purchase</code> і гість переходить на ваш сайт</li>
          <li>На вашій сторінці підтвердження Pixel стріляє ще раз — Meta дедуплікує</li>
        </ol>
      </div>

      {/* ─── Return URL ─────────────────────────── */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label" style={{ fontSize: 14, fontWeight: 600 }}>
          Сторінка підтвердження (Return URL)
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input
            className="form-input"
            placeholder="https://yoursite.com/booking-success"
            value={returnUrl}
            onChange={e => setReturnUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          {returnUrl && (
            <a
              href={returnUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-icon"
              title="Відкрити в новій вкладці"
            >
              <ExternalLink size={16} />
            </a>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          Повний URL з https:// — гість потрапить сюди після оплати. На цій сторінці спрацює ваш Pixel з правильного домену.
        </div>
      </div>

      {/* ─── Meta Pixel ─────────────────────────── */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label" style={{ fontSize: 14, fontWeight: 600 }}>
          Meta Pixel ID
        </label>
        <input
          className="form-input"
          placeholder="993619213466456"
          value={cfg.fb_pixel_id || ''}
          onChange={e => setCfg(c => ({ ...c, fb_pixel_id: e.target.value.trim() || undefined }))}
        />
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          Meta Business Manager → Events Manager → Pixel → Налаштування
        </div>
      </div>

      {/* ─── GA4 ────────────────────────────────── */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label" style={{ fontSize: 14, fontWeight: 600 }}>
          GA4 Measurement ID
        </label>
        <input
          className="form-input"
          placeholder="G-XXXXXXXXXX"
          value={cfg.ga4_id || ''}
          onChange={e => setCfg(c => ({ ...c, ga4_id: e.target.value.trim() || undefined }))}
        />
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          Google Analytics → Admin → Data Streams → Measurement ID
        </div>
      </div>

      {/* ─── TikTok Pixel ───────────────────────── */}
      <div className="form-group" style={{ marginBottom: 24 }}>
        <label className="form-label" style={{ fontSize: 14, fontWeight: 600 }}>
          TikTok Pixel ID
        </label>
        <input
          className="form-input"
          placeholder="CXXXXXXXXXXXXXXXXX"
          value={cfg.tiktok_pixel_id || ''}
          onChange={e => setCfg(c => ({ ...c, tiktok_pixel_id: e.target.value.trim() || undefined }))}
        />
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          TikTok Ads Manager → Assets → Events → Web Events → Pixel ID
        </div>
      </div>


      {/* Preview */}
      {(cfg.fb_pixel_id || cfg.ga4_id) && returnUrl && (
        <div style={{
          background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 24, fontSize: 12,
          color: 'var(--text-secondary)', lineHeight: 1.8,
        }}>
          ✅ <strong>URL кнопки для вашого сайту:</strong>
          <br />
          <code style={{ wordBreak: 'break-all', color: 'var(--accent-primary)', fontSize: 12 }}>
            {bookingUrl}
          </code>
          <br />
          <span style={{ marginTop: 4, display: 'block' }}>
            Після оплати → <strong style={{ color: '#22c55e' }}>{returnUrl}</strong>
          </span>
        </div>
      )}

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? <Loader2 size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
        {saved ? 'Збережено!' : 'Зберегти'}
      </button>
    </div>
  );
}
