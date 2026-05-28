'use client';

import { useState } from 'react';
import { Loader2, Check, Save, Mail, Info, ChevronDown, ChevronUp } from 'lucide-react';
import type { Site, WidgetConfig } from '../_types';

export function NotificationsTab({ site, onUpdate }: { site: Site; onUpdate: (cfg: WidgetConfig) => void }) {
  const [cfg, setCfg] = useState<WidgetConfig>(site.widget_config || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

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

  const placeholders = [
    { key: '{guestName}', label: 'Повне ім\'я гостя', example: 'Serhii Sardo' },
    { key: '{firstName}', label: 'Ім\'я гостя', example: 'Serhii' },
    { key: '{lastName}', label: 'Прізвище гостя', example: 'Sardo' },
    { key: '{propertyName}', label: 'Назва сайту/об\'єкту', example: site.name || 'ALiSiO' },
    { key: '{bookingId}', label: 'Номер (ID) бронювання', example: 'r_1779958...' },
    { key: '{checkIn}', label: 'Дата заїзду', example: '28.05.2026' },
    { key: '{checkOut}', label: 'Дата виїзду', example: '30.05.2026' },
    { key: '{nights}', label: 'Кількість ночей', example: '2' },
    { key: '{totalPrice}', label: 'Сума до сплати', example: `5 000 CZK` },
    { key: '{unitName}', label: 'Назва будиночка / кімнати', example: 'Luxury Cabin' },
  ];

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(59,130,246,0.12)', color: 'var(--accent-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Mail size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Налаштування email-сповіщень</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Кастомізація шаблонів листів, що надсилаються гостям на кожному етапі бронювання
          </div>
        </div>
      </div>

      {/* Variables Splash */}
      <div style={{
        background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)',
        borderRadius: 12, padding: '12px 16px', marginBottom: 28, fontSize: 13,
        display: 'flex', flexDirection: 'column', gap: showSplash ? 12 : 0, transition: 'all 0.2s ease-in-out'
      }}>
        <div 
          onClick={() => setShowSplash(!showSplash)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', cursor: 'pointer', userSelect: 'none' }}
        >
          <Info size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, flex: 1, color: 'var(--text-primary)' }}>Доступні змінні для шаблонів</span>
          <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
            {showSplash ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>
        
        {showSplash && (
          <>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Ви можете використовувати ці змінні в темі або тексті листа. Вони будуть автоматично замінені на реальні дані гостя:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 4 }}>
              {placeholders.map(p => (
                <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 10px', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-primary)' }}>
                  <code style={{ color: 'var(--accent-primary)', fontWeight: 700, fontSize: 12 }}>{p.key}</code>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.label} <span style={{ color: 'var(--text-tertiary)' }}>({p.example})</span></span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* SECTION 1: Booking Received */}
      <div style={{ border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20, marginBottom: 24, background: 'var(--bg-primary)' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
          1. Лист про отримання запиту (Нове бронювання)
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Надсилається клієнту одразу після заповнення контактних даних у віджеті (очікує оплати або підтвердження).
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ fontSize: 13, fontWeight: 500 }}>Тема листа</label>
          <input
            className="form-input"
            style={{ width: '100%', marginTop: 6 }}
            placeholder="Booking received — {propertyName}"
            value={cfg.email_received_subject || ''}
            onChange={e => setCfg(c => ({ ...c, email_received_subject: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label" style={{ fontSize: 13, fontWeight: 500 }}>Текст повідомлення</label>
          <textarea
            className="form-input"
            style={{ width: '100%', minHeight: 80, marginTop: 6, padding: '8px 12px', fontSize: 13, resize: 'vertical' }}
            placeholder="Your booking has been registered. You will receive a payment confirmation once your payment is processed."
            value={cfg.email_received_body || ''}
            onChange={e => setCfg(c => ({ ...c, email_received_body: e.target.value }))}
          />
        </div>
      </div>

      {/* SECTION 2: Booking Confirmed (Paid) */}
      <div style={{ border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20, marginBottom: 24, background: 'var(--bg-primary)' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
          2. Лист про успішну оплату та підтвердження
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Надсилається після успішної оплати через платіжний шлюз Teya або коли адміністратор вручну позначає замовлення сплаченим.
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ fontSize: 13, fontWeight: 500 }}>Тема листа</label>
          <input
            className="form-input"
            style={{ width: '100%', marginTop: 6 }}
            placeholder="Booking confirmed — {propertyName} #{bookingId}"
            value={cfg.email_confirmed_subject || ''}
            onChange={e => setCfg(c => ({ ...c, email_confirmed_subject: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label" style={{ fontSize: 13, fontWeight: 500 }}>Текст повідомлення</label>
          <textarea
            className="form-input"
            style={{ width: '100%', minHeight: 80, marginTop: 6, padding: '8px 12px', fontSize: 13, resize: 'vertical' }}
            placeholder="Thank you for your reservation. Your payment has been received and your booking is confirmed."
            value={cfg.email_confirmed_body || ''}
            onChange={e => setCfg(c => ({ ...c, email_confirmed_body: e.target.value }))}
          />
        </div>
      </div>

      {/* SECTION 3: Booking Confirmed (Unpaid) */}
      <div style={{ border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20, marginBottom: 28, background: 'var(--bg-primary)' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
          3. Лист про підтвердження без оплати (Для несплачених бронювань)
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Надсилається, коли бронювання переведено в статус підтвердженого, але повна оплата ще не була зафіксована.
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ fontSize: 13, fontWeight: 500 }}>Тема листа</label>
          <input
            className="form-input"
            style={{ width: '100%', marginTop: 6 }}
            placeholder="Booking confirmed — {propertyName} #{bookingId}"
            value={cfg.email_unpaid_subject || ''}
            onChange={e => setCfg(c => ({ ...c, email_unpaid_subject: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label" style={{ fontSize: 13, fontWeight: 500 }}>Текст повідомлення</label>
          <textarea
            className="form-input"
            style={{ width: '100%', minHeight: 80, marginTop: 6, padding: '8px 12px', fontSize: 13, resize: 'vertical' }}
            placeholder="Thank you for your reservation. Your booking is confirmed."
            value={cfg.email_unpaid_body || ''}
            onChange={e => setCfg(c => ({ ...c, email_unpaid_body: e.target.value }))}
          />
        </div>
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? <Loader2 size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
        {saved ? 'Збережено!' : 'Зберегти зміни'}
      </button>
    </div>
  );
}
