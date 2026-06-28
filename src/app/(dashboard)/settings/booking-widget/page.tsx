'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';

type WidgetType = 'booking' | 'sauna' | 'tub' | 'breakfast';

const WIDGET_OPTIONS: { value: WidgetType; label: string; icon: string; desc: string }[] = [
  { value: 'booking', label: 'Повне бронювання', icon: '🏠', desc: 'Календар → вибір будинку → гостьова → сервіси → підтвердження' },
  { value: 'sauna', label: 'Бронювання сауни', icon: '🔥', desc: 'Вибір дати, часу, тривалості + вінік' },
  { value: 'tub', label: 'Бронювання купелі', icon: '🛁', desc: 'Вибір дати, часу, тривалості' },
  { value: 'breakfast', label: 'Замовлення сніданку', icon: '🍳', desc: 'Меню з лічильниками + замовлення' },
];

export default function BookingWidgetSettingsPage() {
  const onMenuClick = useMobileMenu();
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [listings, setListings] = useState<any[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [widgetType, setWidgetType] = useState<WidgetType>('booking');
  const [lang, setLang] = useState('uk');
  const [color, setColor] = useState('#1a1a2e');
  const [copied, setCopied] = useState(false);
  const [embedMode, setEmbedMode] = useState<'native' | 'iframe'>('native');

  useEffect(() => {
    fetch('/api/booking-sites')
      .then(r => r.json())
      .then(data => {
        const list = data.sites || [];
        setSites(list);
        if (list.length > 0 && !selectedSite) setSelectedSite(list[0].id);
      })
      .catch(() => {});
  }, []);

  // Load listings (models) for the selected site
  useEffect(() => {
    if (!selectedSite) return;
    setLoadingListings(true);
    setSelectedUnit('');
    fetch(`/api/booking-sites/${selectedSite}/listings`)
      .then(r => r.json())
      .then(data => {
        setListings(data.listings || []);
      })
      .catch(() => setListings([]))
      .finally(() => setLoadingListings(false));
  }, [selectedSite]);

  const domain = typeof window !== 'undefined' ? window.location.origin : 'https://your-pms-domain.com';

  const isService = widgetType !== 'booking';
  const scriptFile = isService ? 'service-embed.js' : 'embed.v2.js';
  const containerId = isService ? 'alisio-service-widget' : 'alisio-booking-widget';

  const currentSite = sites.find(s => s.id === selectedSite);
  const siteSlug = currentSite?.slug || '';

  const embedCode = isService
    ? `<div id="${containerId}"></div>
<script
  src="${domain}/widget/${scriptFile}"
  data-service="${widgetType}"
  data-lang="${lang}"
  data-color="${color}"
></script>`
    : embedMode === 'native'
    ? `<div id="${containerId}" 
     data-site="${siteSlug}" 
     data-lang="${lang}"
     ${selectedUnit ? `data-unit="${selectedUnit}"` : ''}>
</div>
<script src="${domain}/widget/native-embed.js"></script>`
    : `<iframe 
  src="${domain}/w/${siteSlug}?lang=${lang}${selectedUnit ? `&unit=${selectedUnit}` : ''}" 
  style="width: 100%; min-height: 650px; border: none; border-radius: 12px; overflow: hidden;"
  allow="payment"
></iframe>`;

  function copyCode() {
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Live preview via iframe (dynamic scripts can't use document.currentScript)
  const previewSrc = isService
    ? `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5}</style>
</head><body>
<div id="alisio-service-widget" data-site="${siteSlug}" ${selectedUnit ? `data-unit="${selectedUnit}"` : ''}></div>
<script src="${domain}/widget/service-embed.js"></script>
</body></html>`
    : embedMode === 'native'
    ? `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5}</style>
</head><body>
<div id="alisio-booking-widget" data-site="${siteSlug}" data-lang="${lang}" ${selectedUnit ? `data-unit="${selectedUnit}"` : ''}></div>
<script src="${domain}/widget/native-embed.js"></script>
</body></html>`
    : `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:0;background:#f5f5f5;height:100vh;overflow:hidden;}</style>
</head><body>
<iframe src="${domain}/w/${siteSlug}?lang=${lang}${selectedUnit ? `&unit=${selectedUnit}` : ''}" style="width:100%;height:100%;border:none;" allow="payment"></iframe>
</body></html>`;

  return (
    <>
      <Header title="Віджети бронювання" onMenuClick={onMenuClick} />
      <div className="app-content">
        <div className="page-header">
          <div>
            <h2 className="page-title">Віджети бронювання</h2>
            <div className="page-subtitle">
              Згенеруйте код для вставки на будь-який зовнішній сайт
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* Left: Configuration */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
              ⚙️ Налаштування
            </h3>

            {/* Widget Type Switcher */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Тип віджета
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {WIDGET_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setWidgetType(opt.value)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: widgetType === opt.value ? `2px solid ${color}` : '2px solid var(--border-primary)',
                      background: widgetType === opt.value ? `${color}10` : 'var(--bg-primary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all .15s',
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Site selector (only for booking widget) */}
            {!isService && (
              <>
                {/* Embed Mode Toggle */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Метод інтеграції
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setEmbedMode('native')}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: embedMode === 'native' ? `2px solid ${color}` : '2px solid var(--border-primary)',
                        background: embedMode === 'native' ? `${color}15` : 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all .15s',
                      }}
                    >
                      🚀 JS Embed (Новий)
                      <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        Для Clarity, Pixels, GTM
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmbedMode('iframe')}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: embedMode === 'iframe' ? `2px solid ${color}` : '2px solid var(--border-primary)',
                        background: embedMode === 'iframe' ? `${color}15` : 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all .15s',
                      }}
                    >
                      🔲 Iframe (Класичний)
                      <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        Без скриптів на сайті
                      </div>
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Сайт бронювання
                  </label>
                  <select
                    value={selectedSite}
                    onChange={e => setSelectedSite(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      border: '1px solid var(--border-primary)', fontSize: 14,
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                    }}
                  >
                    {sites.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Модель розміщення (опціонально)
                  </label>
                  <select
                    value={selectedUnit}
                    onChange={e => setSelectedUnit(e.target.value)}
                    disabled={loadingListings}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      border: '1px solid var(--border-primary)', fontSize: 14,
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      opacity: loadingListings ? 0.6 : 1,
                    }}
                  >
                    <option value="">Всі моделі</option>
                    {listings.map((l: any) => (
                      <option key={l.unit_id || l.id} value={l.unit_id || ''}>
                        {l.unit_name || l.unit_type_name || l.unit_id}
                        {l.unit_type_code ? ` (${l.unit_type_code})` : ''}
                      </option>
                    ))}
                  </select>
                  {loadingListings && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>⏳ Завантаження моделей...</div>
                  )}
                  {!loadingListings && listings.length === 0 && selectedSite && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>ℹ️ До цього сайту не прив&apos;язано жодної моделі</div>
                  )}
                </div>
              </>
            )}

            {/* Language */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Мова за замовчуванням
              </label>
              <select
                value={lang}
                onChange={e => setLang(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border-primary)', fontSize: 14,
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                }}
              >
                <option value="uk">🇺🇦 Українська</option>
                <option value="en">🇬🇧 English</option>
                <option value="cs">🇨🇿 Čeština</option>
                <option value="de">🇩🇪 Deutsch</option>
              </select>
            </div>

            {/* Color */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Колір акценту
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  style={{ width: 40, height: 40, border: 'none', cursor: 'pointer', borderRadius: 8 }}
                />
                <input
                  type="text"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border-primary)', fontSize: 14,
                    background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>

            {/* Embed Code */}
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
              📋 Код для вставки
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Скопіюйте цей код та вставте його на ваш сайт у потрібне місце
            </p>
            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  background: '#1e1e2e', color: '#cdd6f4', padding: 16, borderRadius: 8,
                  fontSize: 12, lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre-wrap',
                  fontFamily: "'Fira Code', 'Consolas', monospace",
                }}
              >
                {embedCode}
              </pre>
              <button
                onClick={copyCode}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: copied ? '#22c55e' : '#45475a', color: '#fff',
                  border: 'none', borderRadius: 6, padding: '6px 12px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'background .2s',
                }}
              >
                {copied ? '✓ Скопійовано!' : '📋 Копіювати'}
              </button>
            </div>

            {/* Multi-instance tip */}
            {isService && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8,
                background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af',
              }}>
                💡 <strong>Кілька віджетів на одній сторінці:</strong> додайте <code>data-container=&quot;my-custom-id&quot;</code> та замініть <code>id</code> контейнера на відповідний.
              </div>
            )}
          </div>

          {/* Right: Preview */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
              👁️ Попередній перегляд
            </h3>
            <iframe
              key={`${widgetType}-${selectedSite}-${lang}-${color}`}
              srcDoc={previewSrc}
              style={{
                width: '100%', minHeight: 500, border: 'none', borderRadius: 12,
                background: '#f5f5f5',
              }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      </div>
    </>
  );
}
