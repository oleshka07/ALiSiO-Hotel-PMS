'use client';

import { useState } from 'react';
import { Loader2, Check, Save, Eye } from 'lucide-react';
import { THEME_CONFIGS, THEMES, BUTTON_STYLES } from './SiteHelpers';
import type { Site, DesignConfig } from '../_types';
import dynamic from 'next/dynamic';

const BookingV2 = dynamic(() => import('@/modules/bookings/ui/BookingV2'), {
  ssr: false,
  loading: () => <div style={{ height: 680, background: '#FAFAF7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 13 }}>Завантаження...</div>,
});

export function DesignTab({ site, onUpdate }: { site: Site; onUpdate: (cfg: DesignConfig) => void }) {
  const [cfg, setCfg] = useState<DesignConfig>(site.design_config || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/booking-sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ design_config: cfg }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onUpdate(cfg);
  };

  const themeCfg = THEME_CONFIGS[cfg.theme || 'Classical'] || THEME_CONFIGS['Classical'];
  const color = cfg.primary_color || themeCfg.color;

  const btnRadius = cfg.button_style?.includes('pill') ? 99 : cfg.button_style?.includes('rounded') ? 10 : 2;
  const btnBg = cfg.button_style?.includes('outline') ? 'transparent' : color;
  const btnColor = cfg.button_style?.includes('outline') ? color : '#fff';
  const btnBorder = cfg.button_style?.includes('outline') ? `2px solid ${color}` : 'none';

  void btnRadius; void btnBg; void btnColor; void btnBorder;

  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
      <div style={{ flex: '0 0 400px', minWidth: 0 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Тема</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>
            {THEMES.map(t => (
              <button key={t} onClick={() => setCfg(c => ({ ...c, theme: t, primary_color: THEME_CONFIGS[t].color }))}
                style={{
                  padding: '10px 8px', borderRadius: 8, fontSize: 12, fontWeight: cfg.theme === t ? 700 : 400,
                  borderTop: `2px solid ${cfg.theme === t ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  borderRight: `2px solid ${cfg.theme === t ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  borderBottom: `2px solid ${cfg.theme === t ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  borderLeft: `4px solid ${THEME_CONFIGS[t].color}`,
                  background: cfg.theme === t ? 'var(--accent-primary-dim)' : 'var(--surface-secondary)',
                  cursor: 'pointer', color: 'var(--text-primary)', transition: 'all .15s',
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Основний колір</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={cfg.primary_color || '#A2845E'} onChange={e => setCfg(c => ({ ...c, primary_color: e.target.value }))}
                style={{ width: 44, height: 44, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
              <input className="form-input" value={cfg.primary_color || '#A2845E'}
                onChange={e => setCfg(c => ({ ...c, primary_color: e.target.value }))}
                style={{ width: 120, fontFamily: 'monospace', fontSize: 13 }} />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Стиль кнопок та елементів</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {BUTTON_STYLES.map(bs => {
              const isPill = bs.value.includes('pill');
              const isSharp = bs.value.includes('sharp');
              const isOutline = bs.value.includes('outline');
              return (
                <button key={bs.value} onClick={() => setCfg(c => ({ ...c, button_style: bs.value }))}
                  style={{
                    padding: '12px', borderRadius: 12, textAlign: 'left',
                    fontSize: 12, border: `2px solid ${cfg.button_style === bs.value ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                    background: cfg.button_style === bs.value ? 'var(--accent-primary-dim)' : 'var(--surface-secondary)',
                    cursor: 'pointer', color: 'var(--text-primary)', transition: 'all .15s',
                  }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: cfg.button_style === bs.value ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>{bs.label}</div>
                  <div style={{
                    height: 32, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: isPill ? 16 : isSharp ? 0 : 6,
                    background: isOutline ? 'transparent' : (cfg.primary_color || '#A2845E'),
                    color: isOutline ? (cfg.primary_color || '#A2845E') : '#fff',
                    border: isOutline ? `1.5px solid ${cfg.primary_color || '#A2845E'}` : 'none',
                    fontSize: 11, fontWeight: 700,
                  }}>
                    Кнопка
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!cfg.show_shadow} onChange={e => setCfg(c => ({ ...c, show_shadow: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>Показувати тінь (shadow)</span>
          </label>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
          {saved ? 'Збережено!' : 'Зберегти дизайн'}
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 0, position: 'sticky', top: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Мобільний вигляд (Smartphone)
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Eye size={12} /> Попередній перегляд
          </div>
        </div>

        <div style={{
          width: 340, margin: '0 auto',
          border: '14px solid #1a1a1a', borderRadius: 50,
          boxShadow: '0 30px 60px rgba(0,0,0,0.3)',
          background: '#000', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 140, height: 28, background: '#1a1a1a', borderBottomLeftRadius: 18, borderBottomRightRadius: 18, zIndex: 10 }} />
          <div style={{ height: 680, background: 'var(--bg-primary)', overflow: 'hidden', position: 'relative' }}>
            <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none' }}>
              <BookingV2
                siteSlug={site.slug}
                isPreview={true}
                design={{ theme: cfg.theme, primary_color: cfg.primary_color, button_style: cfg.button_style, show_shadow: cfg.show_shadow }}
              />
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', width: 100, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }} />
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 20, textAlign: 'center', background: 'var(--surface-secondary)', padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border-primary)' }}>
          💡 Ваш віджет повністю адаптований під мобільні пристрої. Ви можете протестувати всі кроки прямо в цьому вікні.
        </div>
      </div>
    </div>
  );
}
