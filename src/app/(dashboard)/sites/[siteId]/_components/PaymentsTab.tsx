'use client';

import { useState } from 'react';
import { Loader2, Check, Save, ToggleRight, ToggleLeft } from 'lucide-react';
import type { Site, PaymentConfig } from '../_types';

export function PaymentsTab({ site, onUpdate }: { site: Site; onUpdate: (cfg: PaymentConfig) => void }) {
  const [cfg, setCfg] = useState<PaymentConfig>(site.payment_config || { provider: 'teya', enabled: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasCustomCreds = !!(cfg.teya?.client_id && cfg.teya?.client_secret && cfg.teya?.store_id);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/booking-sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_config: cfg }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onUpdate(cfg);
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, padding: 16, background: 'var(--surface-secondary)', borderRadius: 12, border: '1px solid var(--border-primary)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Прийом платежів</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Дозволити гостям оплачувати бронювання онлайн</div>
        </div>
        <button className="btn btn-ghost" onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}>
          {cfg.enabled ? <ToggleRight size={32} style={{ color: '#22c55e' }} /> : <ToggleLeft size={32} style={{ color: 'var(--text-tertiary)' }} />}
        </button>
      </div>

      {cfg.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="form-group">
            <label className="form-label">Платіжний провайдер</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`btn ${cfg.provider === 'teya' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCfg(c => ({ ...c, provider: 'teya' }))} style={{ flex: 1 }}>
                Teya Online
              </button>
              <button className="btn btn-ghost" disabled style={{ flex: 1, opacity: 0.5, cursor: 'not-allowed' }}>
                Stripe (скоро)
              </button>
            </div>
          </div>

          {cfg.provider === 'teya' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {hasCustomCreds ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 16, borderRadius: 12, border: '2px solid #f59e0b', background: 'color-mix(in srgb, #f59e0b 8%, var(--surface-primary))' }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>⚙️</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Окремий акаунт Teya для цього сайту</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Налаштований власний Store ID. Щоб повернутись до стандартного акаунту — очистіть поля нижче.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 16, borderRadius: 12, border: '2px solid #22c55e', background: 'color-mix(in srgb, #22c55e 8%, var(--surface-primary))' }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>✅</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Використовуються стандартні налаштування оплати</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Цей сайт використовує той самий платіжний акаунт Teya, що й основна форма бронювання{' '}
                      <code style={{ background: 'var(--surface-secondary)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>/book</code>.
                      Налаштовувати щось окремо не потрібно.
                    </div>
                  </div>
                </div>
              )}

              <details style={{ borderRadius: 10, border: '1px solid var(--border-primary)', overflow: 'hidden' }}>
                <summary style={{ padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: 'var(--surface-secondary)', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚙️</span>
                  <span>Розширені налаштування (окремий акаунт Teya для цього сайту)</span>
                  {hasCustomCreds && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>
                      налаштовано
                    </span>
                  )}
                </summary>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ fontSize: 12, color: '#f59e0b', padding: '8px 12px', background: '#fef3c722', borderRadius: 8, border: '1px solid #f59e0b44' }}>
                    ⚠️ Заповніть лише якщо для цього сайту є <strong>окремий магазин Teya</strong>. Якщо поля порожні — використовується стандартний акаунт.
                  </div>
                  <div className="form-group">
                    <label className="form-label">Client ID</label>
                    <input className="form-input" type="password" value={cfg.teya?.client_id || ''} onChange={e => setCfg(c => ({ ...c, teya: { ...c.teya, client_id: e.target.value } }))} placeholder="Введіть Client ID" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Client Secret</label>
                    <input className="form-input" type="password" value={cfg.teya?.client_secret || ''} onChange={e => setCfg(c => ({ ...c, teya: { ...c.teya, client_secret: e.target.value } }))} placeholder="Введіть Client Secret" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Store ID</label>
                    <input className="form-input" value={cfg.teya?.store_id || ''} onChange={e => setCfg(c => ({ ...c, teya: { ...c.teya, store_id: e.target.value } }))} placeholder="Введіть Store ID" />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--surface-secondary)', padding: 12, borderRadius: 8, border: '1px solid var(--border-primary)' }}>
                    💡 Ви можете знайти ці дані в особистому кабінеті Teya (Developer Portal).
                  </div>
                </div>
              </details>
            </div>
          )}

          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <Loader2 size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? 'Збережено!' : 'Зберегти налаштування платежів'}
          </button>
        </div>
      )}
    </div>
  );
}
