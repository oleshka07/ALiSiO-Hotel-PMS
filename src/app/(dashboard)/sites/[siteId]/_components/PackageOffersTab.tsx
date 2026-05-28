'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, Package, ChevronDown, ChevronUp, Edit3, CopyPlus, Copy, Check, Code, Info } from 'lucide-react';
import { Modal } from './SiteHelpers';
import type { SiteService, Listing } from '../_types';

const DAY_LABELS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

interface Bundle {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  nights_included: number;
  listing_type: string | null;
  included_services: string; // JSON
  validity_months: number;
  is_active: number;
  issued_count: number;
  activated_count: number;
  allowed_days: string | null;
  coupon_code: string | null;
  redemption_limit: number;
  current_uses: number;
  applied_listings: string | null;
  allowed_promo_codes: string | null;
}

interface IncludedService {
  service_id: string;
  qty: number;
  free: boolean; // included in price (free for guest)
}

const emptyBundle = () => ({
  name: '',
  description: '',
  price: '',
  nights_included: 1,
  listing_type: '',
  validity_months: 12,
  included_services: [] as IncludedService[],
  allowed_days: [] as number[],
  coupon_code: '',
  redemption_limit: 100,
  applied_listings: [] as string[],
  allowed_promo_codes: [] as string[],
});



export function PackageOffersTab({ siteId, siteCurrency = 'CZK', onCountChange }: { siteId: string; siteCurrency?: string; onCountChange?: (n: number) => void }) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [services, setServices] = useState<SiteService[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [siteCoupons, setSiteCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyBundle(), currency: siteCurrency });
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState<Bundle | null>(null);
  const [widgetLang, setWidgetLang] = useState<string>('');
  const [toast, setToast] = useState('');
  const [showSplash, setShowSplash] = useState(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bd, sd, ld, cd] = await Promise.all([
        fetch(`/api/package-offers?site_id=${siteId}`).then(r => r.json()),
        fetch(`/api/booking-sites/${siteId}/services`).then(r => r.json()),
        fetch(`/api/booking-sites/${siteId}/listings`).then(r => r.json()),
        fetch(`/api/coupons?site_id=${siteId}`).then(r => r.json()),
      ]);
      if (bd.bundles) {
        setBundles(bd.bundles);
        onCountChange?.(bd.bundles.length);
      }
      if (Array.isArray(sd.services)) setServices(sd.services.filter((s: SiteService) => s.is_enabled));
      if (Array.isArray(ld.listings)) setListings(ld.listings);
      if (Array.isArray(cd)) setSiteCoupons(cd);
    } finally { setLoading(false); }
  }, [siteId, onCountChange]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const toggleService = (svcId: string) => {
    setForm(f => {
      const exists = f.included_services.find(s => s.service_id === svcId);
      if (exists) return { ...f, included_services: f.included_services.filter(s => s.service_id !== svcId) };
      return { ...f, included_services: [...f.included_services, { service_id: svcId, qty: 1, free: true }] };
    });
  };

  const updateIncluded = (svcId: string, key: 'qty' | 'free', val: number | boolean) => {
    setForm(f => ({
      ...f,
      included_services: f.included_services.map(s => s.service_id === svcId ? { ...s, [key]: val } : s),
    }));
  };

  const handleCreate = async () => {
    if (!form.name || !form.price || !form.coupon_code) { alert('Вкажіть назву, ціну та промокод'); return; }
    setCreating(true);
    try {
      const isEdit = !!editId;
      const body = {
        site_id: siteId,
        ...form,
        price: +form.price,
        redemption_limit: +form.redemption_limit,
        allowed_days: form.allowed_days.length > 0 ? form.allowed_days : null,
        applied_listings: form.applied_listings.length > 0 ? form.applied_listings : null,
        allowed_promo_codes: form.allowed_promo_codes.length > 0 ? form.allowed_promo_codes : null,
      };
      const res = await fetch(isEdit ? `/api/package-offers/${editId}` : '/api/package-offers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok) { showToast(isEdit ? 'Оновлено ✓' : 'Пакет створено ✓'); setShowCreate(false); setForm({ ...emptyBundle(), currency: siteCurrency }); setEditId(null); load(); }
      else alert(d.error);
    } finally { setCreating(false); }
  };

  const handleDelete = async (b: Bundle) => {
    if (!confirm(`Архівувати пакет «${b.name}»?`)) return;
    await fetch(`/api/package-offers/${b.id}`, { method: 'DELETE' });
    showToast('Архівовано'); load();
  };

  const getServiceName = (id: string) => services.find(s => s.id === id)?.name || id;
  const getServiceIcon = (id: string) => services.find(s => s.id === id)?.icon || '🛎';

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={() => { setForm({ ...emptyBundle(), currency: siteCurrency }); setEditId(null); setShowCreate(true); }}>
          <Plus size={16} /> Новий пакет
        </button>
      </div>

      {!showSplash ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, padding: '10px 14px', background: 'rgba(59,130,246,0.06)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 400 }}>
          <Package size={16} style={{ color: '#3b82f6', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, flex: 1 }}>Акційні пакети</span>
          <button onClick={() => setShowSplash(true)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }} title="Детальніше">
            <Info size={16} />
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, padding: '10px 14px', background: 'rgba(59,130,246,0.06)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.15)', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <Package size={16} style={{ color: '#3b82f6', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, flex: 1 }}>Акційні пакети</span>
            <button onClick={() => setShowSplash(false)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#3b82f6', display: 'flex', alignItems: 'center' }} title="Приховати">
              <Info size={16} />
            </button>
          </div>
          <span>
            <strong>Пакет (Акційний тариф)</strong> — це пропозиція, яка включає ночі та сервіси за фіксованою ціною. 
            Ви задаєте пакету <strong>Промокод</strong> (напр., <code>SUMMER26</code>) та ліміт використань. 
            Коли гість вводить цей код у віджеті — вказані послуги додаються безкоштовно, а загальна ціна бронювання стає рівною ціні пакету (гість оплачує пакет під час бронювання).
          </span>
        </div>
      )}

      {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>
        : bundles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
            <Package size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <div style={{ fontWeight: 600 }}>Пакетів ще немає</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bundles.map(b => {
              const services_list: IncludedService[] = (() => { try { const p = JSON.parse(b.included_services); return Array.isArray(p) ? p : []; } catch { return []; } })();
              const isExpanded = expanded === b.id;
              return (
                <div key={b.id} style={{ border: '1px solid var(--border-primary)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', background: 'var(--surface-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => setExpanded(isExpanded ? null : b.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-primary)' }}>
                          {b.price.toLocaleString('cs-CZ')} {b.currency}
                        </span>
                        {!b.is_active && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#ef444422', color: '#ef4444', fontWeight: 600 }}>Архів</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {b.coupon_code && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            🏷 Код: <strong>{b.coupon_code}</strong>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(b.coupon_code || '');
                                showToast('Код скопійовано!');
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 2px', display: 'inline-flex', alignItems: 'center' }}
                              title="Скопіювати код"
                            >
                              <Copy size={13} />
                            </button>
                            <span style={{ marginLeft: 2 }}>({b.current_uses}/{b.redemption_limit})</span>
                          </span>
                        )}
                        {b.applied_listings && <span>🏡 Обмежено будиночками</span>}
                        {b.allowed_promo_codes && <span>🎟 Дозволені дод. промокоди</span>}
                        {b.nights_included > 0 && <span>🌙 {b.nights_included} н.</span>}

                        <span>⏳ {b.validity_months} міс.</span>
                        {(() => {
                          let parsedDays = [];
                          try { if (b.allowed_days) { const p = JSON.parse(b.allowed_days); if (Array.isArray(p)) parsedDays = p; } } catch {}
                          if (parsedDays.length === 0) return null;
                          return <span>📅 {parsedDays.map((d: number) => DAY_LABELS[d]).join(', ')}</span>;
                        })()}
                        {services_list.length > 0 && (
                          <span>{services_list.map(s => getServiceIcon(s.service_id)).join(' ')} {services_list.length} сервісів</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {b.coupon_code && (
                        <button className="btn btn-ghost" style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCodeModal(b);
                          }} title="Отримати код віджета">
                          <Code size={14} />
                        </button>
                      )}
                      <button className="btn btn-ghost" style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}
                        onClick={() => {
                          setForm({
                            name: b.name,
                            description: b.description || '',
                            price: String(b.price),
                            currency: b.currency,
                            nights_included: b.nights_included,
                            listing_type: b.listing_type || '',
                            validity_months: b.validity_months,
                            included_services: (() => { try { const p = JSON.parse(b.included_services); return Array.isArray(p) ? p : []; } catch { return []; } })(),
                            allowed_days: (() => { try { const p = JSON.parse(b.allowed_days || '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })(),
                            applied_listings: (() => { try { const p = JSON.parse(b.applied_listings || '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })(),
                            allowed_promo_codes: (() => { try { const p = JSON.parse(b.allowed_promo_codes || '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })(),
                            coupon_code: b.coupon_code || '',
                            redemption_limit: b.redemption_limit || 100,
                          });
                          setEditId(b.id);
                          setShowCreate(true);
                        }} title="Редагувати">
                        <Edit3 size={14} />
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}
                        onClick={() => {
                          setForm({
                            name: b.name + ' (Копія)',
                            description: b.description || '',
                            price: String(b.price),
                            currency: b.currency,
                            nights_included: b.nights_included,
                            listing_type: b.listing_type || '',
                            validity_months: b.validity_months,
                            included_services: (() => { try { const p = JSON.parse(b.included_services); return Array.isArray(p) ? p : []; } catch { return []; } })(),
                            allowed_days: (() => { try { const p = JSON.parse(b.allowed_days || '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })(),
                            applied_listings: (() => { try { const p = JSON.parse(b.applied_listings || '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })(),
                            allowed_promo_codes: (() => { try { const p = JSON.parse(b.allowed_promo_codes || '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })(),
                            coupon_code: b.coupon_code ? b.coupon_code + 'COPY' : '',
                            redemption_limit: b.redemption_limit || 100,
                          });
                          setEditId(null);
                          setShowCreate(true);
                        }} title="Дублювати">
                        <CopyPlus size={14} />
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '5px 8px', color: '#ef4444' }}
                        onClick={() => handleDelete(b)} title="В архів">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {b.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{b.description}</div>}
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>Включені сервіси:</div>
                      {services_list.length === 0
                        ? <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Без додаткових сервісів</div>
                        : services_list.map((s: IncludedService) => (
                          <div key={s.service_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span>{getServiceIcon(s.service_id)}</span>
                            <span>{getServiceName(s.service_id)}</span>
                            <span style={{ color: 'var(--text-tertiary)' }}>× {s.qty}</span>
                            {s.free && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600 }}>Безкоштовно</span>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={editId ? "Редагувати пакет" : "Новий пакет"} size="lg"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={14} className="spin" /> : (editId ? <Check size={14} /> : <Package size={14} />)} {editId ? "Зберегти" : "Створити"}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Назва пакету *</label>
            <input className="form-input" placeholder="Романтичний вікенд" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Опис</label>
            <textarea className="form-input" rows={2} placeholder="2 ночі + сауна + сніданок..."
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ціна пакету *</label>
              <input className="form-input" type="number" min={0} placeholder="8500"
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Валюта</label>
              <select className="form-select" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                <option>CZK</option><option>EUR</option><option>USD</option><option>UAH</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ночей включено</label>
              <input className="form-input" type="number" min={0}
                value={form.nights_included} onChange={e => setForm(f => ({ ...f, nights_included: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Дійсний (міс.)</label>
              <input className="form-input" type="number" min={1}
                value={form.validity_months} onChange={e => setForm(f => ({ ...f, validity_months: +e.target.value }))} />
            </div>
          </div>

          <div className="form-row" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '12px', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.15)' }}>
            <div className="form-group">
              <label className="form-label">Промокод пакету *</label>
              <input className="form-input" placeholder="Напр., WEEKEND26" value={form.coupon_code}
                onChange={e => setForm(f => ({ ...f, coupon_code: e.target.value.toUpperCase() }))} />
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Гості зможуть застосувати цей пакет за кодом</div>
              {editId && form.coupon_code && (
                <button type="button" className="btn btn-ghost" style={{ marginTop: 8, padding: '4px 8px', fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={() => {
                  const b = bundles.find(x => x.id === editId);
                  if (b) setShowCodeModal(b);
                }}>
                  <Code size={14} /> Отримати код віджета для сайту
                </button>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Ліміт використань</label>
              <input className="form-input" type="number" min={1} disabled={!form.coupon_code}
                value={form.redemption_limit} onChange={e => setForm(f => ({ ...f, redemption_limit: +e.target.value }))} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Дозволені дні тижня <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 11 }}>{form.allowed_days.length === 0 ? '(всі дні)' : ''}</span></label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DAYS.map(d => {
                const on = form.allowed_days.includes(d);
                return (
                  <button key={d} type="button" onClick={() => setForm(f => ({ ...f, allowed_days: f.allowed_days.includes(d) ? f.allowed_days.filter(x => x !== d) : [...f.allowed_days, d].sort() }))}
                    style={{ width: 38, height: 38, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `2px solid ${on ? 'var(--accent-primary)' : 'var(--border-primary)'}`, background: on ? 'var(--accent-primary)' : 'var(--surface-secondary)', color: on ? '#fff' : 'var(--text-secondary)' }}>
                    {DAY_LABELS[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Застосовується до будиночків <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 11 }}>{form.applied_listings.length === 0 ? '(всі будиночки)' : ''}</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
              {listings.map(l => {
                const targetId = l.unit_id || l.unit_type_id;
                const targetName = l.unit_name || l.unit_type_name || 'Без назви';
                if (!targetId) return null;
                const on = form.applied_listings.includes(targetId);
                
                let photoUrl = '';
                try {
                  const photoStr = l.photos || l.unit_type_photos || '';
                  if (photoStr) photoUrl = photoStr.split(',')[0].trim();
                } catch {}

                return (
                  <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 13, padding: '6px 8px', borderRadius: 8, background: on ? 'rgba(99,102,241,0.06)' : 'transparent', border: `1px solid ${on ? 'var(--accent-primary)' : 'transparent'}` }}>
                    <input type="checkbox" checked={on} onChange={e => setForm(f => ({ ...f, applied_listings: e.target.checked ? [...f.applied_listings, targetId] : f.applied_listings.filter(x => x !== targetId) }))} />
                    {photoUrl ? (
                      <div style={{ width: 32, height: 32, borderRadius: 6, backgroundImage: `url(${photoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 14 }}>🏠</span>
                      </div>
                    )}
                    <span style={{ fontWeight: on ? 600 : 400 }}>{targetName}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Додаткові промокоди до пакету <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 11 }}>{form.allowed_promo_codes.length === 0 ? '(жодного)' : ''}</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
              {siteCoupons.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Немає промокодів для цього сайту</div>}
              {siteCoupons.map(c => {
                const on = form.allowed_promo_codes.includes(c.code);
                return (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 13, padding: '6px 8px', borderRadius: 8, background: on ? 'rgba(99,102,241,0.06)' : 'transparent', border: `1px solid ${on ? 'var(--accent-primary)' : 'transparent'}` }}>
                    <input type="checkbox" checked={on} onChange={e => setForm(f => ({ ...f, allowed_promo_codes: e.target.checked ? [...f.allowed_promo_codes, c.code] : f.allowed_promo_codes.filter(x => x !== c.code) }))} />
                    <span style={{ fontWeight: on ? 600 : 400, fontFamily: 'monospace' }}>{c.code}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>{c.offer_amount}{c.discount_type === 'percentage' ? '%' : ''}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Services picker */}
          <div className="form-group">
            <label className="form-label">Включені сервіси</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', padding: '2px 0' }}>
              {services.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Немає сервісів — додайте у вкладці «Сервіси»</div>
                : services.map(svc => {
                  const inc = form.included_services.find(s => s.service_id === svc.id);
                  return (
                    <div key={svc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${inc ? 'var(--accent-primary)' : 'var(--border-primary)'}`, background: inc ? 'rgba(99,102,241,0.06)' : 'var(--surface-secondary)', cursor: 'pointer' }}
                      onClick={() => toggleService(svc.id)}>
                      <input type="checkbox" checked={!!inc} readOnly style={{ cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{svc.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: inc ? 600 : 400 }}>{svc.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{svc.price_override ?? svc.price} {form.currency}</span>
                      {inc && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={inc.free}
                              onChange={e => updateIncluded(svc.id, 'free', e.target.checked)} />
                            безкоштовно
                          </label>
                          <input type="number" min={1} value={inc.qty}
                            onChange={e => updateIncluded(svc.id, 'qty', +e.target.value)}
                            style={{ width: 48, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 12 }} />
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>шт.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </Modal>

      {/* Code Modal */}
      {showCodeModal && (
        <Modal open={!!showCodeModal} onClose={() => setShowCodeModal(null)} title="Код віджета для пакету">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Скопіюйте цей HTML-код та вставте його на сторінку вашого сайту (в блок HTML / Embed).
              Цей віджет автоматично застосує пакет <strong>{showCodeModal.name}</strong>, сховає поле для промокодів та обнулить вартість включених сервісів.
            </div>
            <div className="form-group" style={{ marginBottom: 4 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Мова віджета</label>
              <select className="form-select" value={widgetLang} onChange={e => setWidgetLang(e.target.value)}>
                <option value="">За замовчуванням (Мова сайту / браузера)</option>
                <option value="uk">Українська (UK)</option>
                <option value="en">Англійська (EN)</option>
                <option value="cs">Чеська (CS)</option>
                <option value="de">Німецька (DE)</option>
              </select>
            </div>
            
            <div style={{ background: 'var(--surface-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--border-primary)', position: 'relative' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {(() => {
                  let specificUnitId = '';
                  try {
                    const parsed = JSON.parse(showCodeModal.applied_listings || '[]');
                    if (Array.isArray(parsed) && parsed.length === 1) {
                      specificUnitId = `&unitId=${parsed[0]}`;
                    }
                  } catch {}
                  const langParam = widgetLang ? `&lang=${widgetLang}` : '';
                  return `<iframe\n  src="${typeof window !== 'undefined' ? window.location.origin : ''}/w/${siteId}?bundle=${showCodeModal.coupon_code}${specificUnitId}${langParam}"\n  width="100%"\n  height="700px"\n  frameborder="0"\n  style="border: none; border-radius: 12px; overflow: hidden; min-height: 700px;"\n></iframe>`;
                })()}
              </pre>
            </div>
            
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
              let specificUnitId = '';
              try {
                const parsed = JSON.parse(showCodeModal.applied_listings || '[]');
                if (Array.isArray(parsed) && parsed.length === 1) {
                  specificUnitId = `&unitId=${parsed[0]}`;
                }
              } catch {}
              
              const langParam = widgetLang ? `&lang=${widgetLang}` : '';
              const widgetUrl = `${window.location.origin}/w/${siteId}?bundle=${showCodeModal.coupon_code}${specificUnitId}${langParam}`;
              const iframeCode = `<iframe src="${widgetUrl}" width="100%" height="700px" frameborder="0" style="border: none; border-radius: 12px; overflow: hidden; min-height: 700px;"></iframe>`;
              if (navigator.clipboard) {
                navigator.clipboard.writeText(iframeCode).then(() => { setShowCodeModal(null); showToast('Код віджета скопійовано!'); }).catch(() => alert('Не вдалося скопіювати.'));
              } else {
                const ta = document.createElement('textarea');
                ta.value = iframeCode;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                setShowCodeModal(null);
                showToast('Код віджета скопійовано!');
              }
            }}>
              Копіювати код
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          background: 'var(--surface-secondary)',
          border: '1px solid var(--border-primary)',
          padding: '10px 16px',
          borderRadius: 8,
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          fontSize: 13,
        }}>
          {toast}
        </div>
      )}

    </div>
  );
}
