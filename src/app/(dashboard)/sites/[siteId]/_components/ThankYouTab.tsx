'use client';

import { useState } from 'react';
import { Loader2, Check, Save, PartyPopper, ExternalLink, Info } from 'lucide-react';
import type { Site, WidgetConfig } from '../_types';

export function ThankYouTab({ site, onUpdate }: { site: Site; onUpdate: (cfg: WidgetConfig) => void }) {
  const [cfg, setCfg] = useState<WidgetConfig>(site.widget_config || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

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

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(34,197,94,0.12)', color: '#22c55e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <PartyPopper size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Сторінка подяки</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Після успішної оплати гість буде перенаправлений на цю сторінку
          </div>
        </div>
      </div>

      {/* How it works */}
      {!showSplash ? (
        <div style={{
          fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28,
          padding: '10px 14px', background: 'rgba(59,130,246,0.06)',
          borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)',
          display: 'flex', alignItems: 'center', gap: 8, maxWidth: 640
        }}>
          <Info size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, flex: 1 }}>Як це працює</span>
          <button onClick={() => setShowSplash(true)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }} title="Детальніше">
            <Info size={16} />
          </button>
        </div>
      ) : (
        <div style={{
          background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 12, padding: '14px 16px', marginBottom: 28, fontSize: 13,
          display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 640
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <Info size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, flex: 1, color: 'var(--accent-primary)' }}>Як це працює</span>
            <button onClick={() => setShowSplash(false)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center' }} title="Приховати">
              <Info size={16} />
            </button>
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
            <li>Гість завершує бронювання і оплачує через Teya</li>
            <li>Система підтверджує оплату і надсилає email-підтвердження</li>
            <li>Гість автоматично переходить на URL нижче</li>
          </ol>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Застосовується до всіх об&apos;єктів сайту <strong>{site.name}</strong>. Якщо порожньо — гість залишається на сторінці підтвердження.
          </div>
        </div>
      )}

      {/* URL field */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label" style={{ fontSize: 14, fontWeight: 600 }}>
          URL сторінки подяки
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input
            className="form-input"
            placeholder="https://yoursite.com/thank-you"
            value={cfg.thank_you_url || ''}
            onChange={e => setCfg(c => ({ ...c, thank_you_url: e.target.value }))}
            style={{ flex: 1 }}
          />
          {cfg.thank_you_url && (
            <a
              href={cfg.thank_you_url}
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
          Має бути повний URL з https://
        </div>
      </div>

      {/* Preview */}
      {cfg.thank_you_url && (
        <div style={{
          background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 24, fontSize: 13,
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Після оплати → </span>
          <span style={{ color: '#22c55e', fontWeight: 600, wordBreak: 'break-all' }}>
            {cfg.thank_you_url}
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
