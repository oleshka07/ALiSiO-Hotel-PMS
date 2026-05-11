'use client';

import { useState, useEffect } from 'react';
import { Loader2, Check, Save } from 'lucide-react';
import { CopyBtn } from './SiteHelpers';
import type { Site, WidgetConfig } from '../_types';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{n}</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

export function WidgetTab({ site, onUpdate }: { site: Site; onUpdate: (cfg: WidgetConfig) => void }) {
  const [cfg, setCfg] = useState<WidgetConfig>(site.widget_config || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const lang = cfg.default_lang || 'uk';
  const scriptTag = `<script \n  src="${origin || 'http://localhost:3000'}/widget/embed.v2.js" \n  data-site="${site.slug}" \n  data-lang="${lang}">\n</script>`;
  const iframeEmbed = `<iframe\n  src="${origin || 'https://YOUR_PMS_DOMAIN'}/booking?site=${site.slug}&lang=${lang}"\n  width="100%" height="600"\n  frameborder="0" allowfullscreen>\n</iframe>`;

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
    <div style={{ maxWidth: 740 }}>
      <Step n={1} title="Налаштуйте URL результатів">
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>Сторінка вашого сайту, на яку будуть потрапляти гості після вибору дат:</div>
        <input className="form-input" placeholder="https://yoursite.com/booking" value={cfg.search_result_url || ''} onChange={e => setCfg(c => ({ ...c, search_result_url: e.target.value }))} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!cfg.enable_prefill} onChange={e => setCfg(c => ({ ...c, enable_prefill: e.target.checked }))} />
          <span style={{ fontSize: 13 }}>Автоматично підставляти дати в URL (prefill)</span>
        </label>
      </Step>

      <Step n={2} title="Мова віджета за замовчуванням">
        <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)' }}>Ця мова буде використана якщо сторінка не передає локаль.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['uk', 'cs', 'en', 'de'] as const).map(l => (
            <button key={l} type="button" onClick={() => setCfg(c => ({ ...c, default_lang: l }))}
              style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: `2px solid ${lang === l ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                background: lang === l ? 'var(--accent-primary)' : 'var(--surface-secondary)',
                color: lang === l ? '#fff' : 'var(--text-secondary)', transition: 'all .15s',
              }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
          Щоб передати локаль з батьківського сайту динамічно, вставте перед тегом скрипта:
        </div>
        <div style={{ position: 'relative', marginTop: 6 }}>
          <pre style={{ background: 'var(--surface-secondary)', borderRadius: 8, padding: 12, fontSize: 11, overflowX: 'auto', margin: 0 }}>
            {`<script>\n  window.__BOOKING_LANG__ = document.documentElement.lang || '${lang}';\n</script>`}
          </pre>
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <CopyBtn text={`<script>\n  window.__BOOKING_LANG__ = document.documentElement.lang || '${lang}';\n</script>`} />
          </div>
        </div>
      </Step>

      <Step n={3} title="Вставте JS-тег на ваш сайт">
        <div style={{ position: 'relative' }}>
          <pre style={{ background: 'var(--surface-secondary)', borderRadius: 8, padding: 16, fontSize: 12, overflowX: 'auto', margin: 0 }}>{scriptTag}</pre>
          <div style={{ position: 'absolute', top: 8, right: 8 }}><CopyBtn text={scriptTag} /></div>
        </div>
      </Step>

      <Step n={4} title="Або використайте iframe (альтернатива)">
        <div style={{ position: 'relative' }}>
          <pre style={{ background: 'var(--surface-secondary)', borderRadius: 8, padding: 16, fontSize: 12, overflowX: 'auto', margin: 0 }}>{iframeEmbed}</pre>
          <div style={{ position: 'absolute', top: 8, right: 8 }}><CopyBtn text={iframeEmbed} /></div>
        </div>
      </Step>

      <Step n={5} title="Перевірте встановлення">
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Відкрийте ваш сайт і переконайтесь що кнопка/форма бронювання відображається. Бронювання буде прив&apos;язане до сайту <strong>{site.name}</strong>.
        </div>
      </Step>

      <Step n={6} title="Системні налаштування">
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Slug (ідентифікатор для вбудовування)</label>
          <input className="form-input" value={site.slug || ''} readOnly style={{ background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }} />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Використовується в data-site attribute</div>
        </div>
        <div className="form-group">
          <label className="form-label">URL вашого сайту (де вбудовано віджет)</label>
          <input className="form-input" placeholder="https://book.kemp-carlsbad.cz"
            value={site.site_url || ''}
            onChange={e => onUpdate({ ...site, site_url: e.target.value } as unknown as WidgetConfig)} />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Допомагає правильно генерувати посилання на бронювання</div>
        </div>
      </Step>

      <Step n={7} title="Контактне повідомлення після бронювання">
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          Текст, який побачить гість на екрані підтвердження бронювання. Вкажіть email та телефон для зв&apos;язку.
        </div>
        <input className="form-input" placeholder="Якщо щось — пиши на hello@yoursite.com або +420 000 000 000"
          value={cfg.supportContact || ''}
          onChange={e => setCfg(c => ({ ...c, supportContact: e.target.value }))} />
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Якщо порожньо — використовується текст за замовчуванням з налаштувань мови</div>
      </Step>

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? <Loader2 size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
        {saved ? 'Збережено!' : 'Зберегти налаштування'}
      </button>
    </div>
  );
}
