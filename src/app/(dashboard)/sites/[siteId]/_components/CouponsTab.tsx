'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, Percent, Copy, Check, Edit3, CopyPlus, Info } from 'lucide-react';
import { Modal } from './SiteHelpers';

const DAYS = [
  { key: 1, label: 'Пн' }, { key: 2, label: 'Вт' }, { key: 3, label: 'Ср' },
  { key: 4, label: 'Чт' }, { key: 5, label: 'Пт' }, { key: 6, label: 'Сб' },
  { key: 7, label: 'Нд' },
];

const DAY_LABELS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

const emptyForm = () => ({
  code: '', discount_type: 'percent', offer_amount: '',
  valid_from: '', valid_until: '',
  min_nights: 1, max_nights: '', redemption_limit: '',
  allowed_days: [] as number[],
  applies_to: 'services' as 'services' | 'listings' | 'both',
  applied_listings: [] as string[],
  applicable_services: [] as string[],
});

export function CouponsTab({ siteId, siteCurrency = 'CZK', onCountChange }: { siteId: string; siteCurrency?: string; onCountChange?: (n: number) => void }) {
  const [codes, setCodes] = useState<Record<string, unknown>[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(false);

  const onCountRef = useRef(onCountChange);
  useEffect(() => { onCountRef.current = onCountChange; }, [onCountChange]);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    try {
      const [resCodes, resServices, resListings] = await Promise.all([
        fetch(`/api/coupons?site_id=${siteId}`).then(r => r.json()),
        fetch(`/api/booking-sites/${siteId}/services`).then(r => r.json()),
        fetch(`/api/booking-sites/${siteId}/listings`).then(r => r.json()),
      ]);

      const list = Array.isArray(resCodes) ? resCodes : Array.isArray(resCodes.codes) ? resCodes.codes : [];
      setCodes(list);
      onCountRef.current?.(list.length);

      if (Array.isArray(resServices.services)) {
        setServices(resServices.services.filter((s: any) => s.is_enabled));
      }
      if (Array.isArray(resListings.listings)) {
        setListings(resListings.listings);
      }
    } catch {
      setCodes([]);
      onCountRef.current?.(0);
    }
    setLoading(false);
  }, [siteId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  const toggleDay = (day: number) => {
    setForm(f => {
      const days = f.allowed_days.includes(day)
        ? f.allowed_days.filter(d => d !== day)
        : [...f.allowed_days, day].sort();
      return { ...f, allowed_days: days };
    });
  };

  const handleCreate = async () => {
    if (!form.code.trim() || !form.offer_amount) { alert('Введіть код та знижку'); return; }
    setCreating(true);
    try {
      const isEdit = !!editId;
      const res = await fetch(isEdit ? `/api/coupons/${editId}` : '/api/coupons', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          discount_type: form.discount_type === 'percent' ? 'percentage' : 'fixed_amount',
          offer_amount: +form.offer_amount,
          valid_from: form.valid_from || null,
          valid_until: form.valid_until || null,
          min_nights: form.min_nights || null,
          max_nights: form.max_nights ? +form.max_nights : null,
          redemption_limit: form.redemption_limit ? +form.redemption_limit : null,
          site_id: siteId,
          allowed_days: form.allowed_days.length > 0 ? form.allowed_days : null,
          applies_to: form.applies_to,
          applied_listings: (form.applies_to === 'listings' || form.applies_to === 'both') && form.applied_listings.length > 0
            ? form.applied_listings
            : null,
          applicable_services: (form.applies_to === 'services' || form.applies_to === 'both') && form.applicable_services.length > 0
            ? form.applicable_services
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Помилка'); setCreating(false); return; }
      setShowCreate(false);
      setForm(emptyForm());
      setEditId(null);
      fetchCodes();
    } catch { alert('Помилка мережі'); }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити промокод?')) return;
    await fetch(`/api/coupons/${id}`, { method: 'DELETE' });
    fetchCodes();
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>;

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setEditId(null); setShowCreate(true); }}>
          <Plus size={16} /> Новий промокод
        </button>
      </div>

      {!showSplash ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, padding: '10px 14px', background: 'rgba(34,197,94,0.06)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 400 }}>
          <Percent size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, flex: 1 }}>Промокоди</span>
          <button onClick={() => setShowSplash(true)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }} title="Детальніше">
            <Info size={16} />
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, padding: '10px 14px', background: 'rgba(34,197,94,0.06)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.15)', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <Percent size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, flex: 1 }}>Промокоди</span>
            <button onClick={() => setShowSplash(false)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#22c55e', display: 'flex', alignItems: 'center' }} title="Приховати">
              <Info size={16} />
            </button>
          </div>
          <span>Промокод — це код на знижку для бронювання. Ви можете створювати їх вручну для акцій, або вони можуть генеруватись автоматично при купівлі ваучерів (див. вкладку Автоматизація).</span>
        </div>
      )}

      {codes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <Percent size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div>Промо-кодів ще немає</div>
        </div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Код</th><th>Знижка</th><th>Застосовується</th><th>Діє до</th><th>Ночей</th><th>Використано</th><th></th></tr></thead>
          <tbody>
            {codes.map(c => (
              <tr key={c.id as string}>
                <td style={{ fontFamily: 'monospace', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.code as string}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(c.code as string);
                      setCopiedId(c.id as string);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}
                    title="Копіювати код"
                  >
                    {copiedId === c.id ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
                  </button>
                </td>
                <td>{c.offer_amount as number}{(c.discount_type as string) === 'percentage' ? '%' : ` ${siteCurrency}`}</td>
                <td style={{ fontSize: 12 }}>
                  {(c.applies_to as string) === 'listings' ? '🏠 Оголошення'
                    : (c.applies_to as string) === 'both' ? '🏠+🛎 Обидва'
                      : '🛎 Сервіси'}
                </td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{(c.valid_until as string) || '—'}</td>
                <td style={{ fontSize: 13 }}>
                  {(c.min_nights as number) || 1}–{(c.max_nights as number) || '∞'}
                  {typeof c.allowed_days === 'string' && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {String((() => { try { return (JSON.parse(c.allowed_days) as number[]).map(d => DAY_LABELS[d]).join(','); } catch { return ''; } })())}
                  </span>}
                </td>
                <td style={{ fontSize: 13 }}>{(c.current_uses as number) || 0}{c.redemption_limit ? ` / ${c.redemption_limit}` : ''}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', color: 'var(--text-secondary)' }} onClick={() => {
                      setForm({
                        code: String(c.code),
                        discount_type: c.discount_type === 'fixed_amount' ? 'fixed' : 'percent',
                        offer_amount: String(c.offer_amount),
                        valid_from: c.valid_from ? String(c.valid_from) : '',
                        valid_until: c.valid_until ? String(c.valid_until) : '',
                        min_nights: c.min_nights ? Number(c.min_nights) : 1,
                        max_nights: c.max_nights ? String(c.max_nights) : '',
                        redemption_limit: c.redemption_limit ? String(c.redemption_limit) : '',
                        allowed_days: c.allowed_days ? JSON.parse(String(c.allowed_days)) : [],
                        applies_to: String(c.applies_to || 'services') as 'services' | 'listings' | 'both',
                        applied_listings: (() => { try { return c.applied_listings ? JSON.parse(String(c.applied_listings)) : []; } catch { return []; } })(),
                        applicable_services: (() => { try { return c.applicable_services ? JSON.parse(String(c.applicable_services)) : []; } catch { return []; } })(),
                      });
                      setEditId(String(c.id));
                      setShowCreate(true);
                    }} title="Редагувати">
                      <Edit3 size={14} />
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', color: 'var(--text-secondary)' }} onClick={() => {
                      setForm({
                        code: String(c.code) + '_COPY',
                        discount_type: c.discount_type === 'fixed_amount' ? 'fixed' : 'percent',
                        offer_amount: String(c.offer_amount),
                        valid_from: c.valid_from ? String(c.valid_from) : '',
                        valid_until: c.valid_until ? String(c.valid_until) : '',
                        min_nights: c.min_nights ? Number(c.min_nights) : 1,
                        max_nights: c.max_nights ? String(c.max_nights) : '',
                        redemption_limit: c.redemption_limit ? String(c.redemption_limit) : '',
                        allowed_days: c.allowed_days ? JSON.parse(String(c.allowed_days)) : [],
                        applies_to: String(c.applies_to || 'services') as 'services' | 'listings' | 'both',
                        applied_listings: (() => { try { return c.applied_listings ? JSON.parse(String(c.applied_listings)) : []; } catch { return []; } })(),
                        applicable_services: (() => { try { return c.applicable_services ? JSON.parse(String(c.applicable_services)) : []; } catch { return []; } })(),
                      });
                      setEditId(null);
                      setShowCreate(true);
                    }} title="Дублювати">
                      <CopyPlus size={14} />
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', color: '#ef4444' }} onClick={() => handleDelete(c.id as string)} title="Видалити">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={editId ? "Редагувати промокод" : "Новий промокод"}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={14} className="spin" /> : (editId ? <Check size={14} /> : <Plus size={14} />)} {editId ? "Зберегти" : "Створити"}
          </button>
        </>}>

        <div className="form-group">
          <label className="form-label">Застосовується до</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['services', '🛎 Сервіси'], ['listings', '🏠 Оголошення'], ['both', '🏠+🛎 Обидва']] as const).map(([val, label]) => (
              <button key={val} type="button" onClick={() => setForm(f => ({ ...f, applies_to: val }))}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `2px solid ${form.applies_to === val ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  background: form.applies_to === val ? 'var(--accent-primary)' : 'var(--surface-secondary)',
                  color: form.applies_to === val ? '#fff' : 'var(--text-secondary)', transition: 'all .15s',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Код *</label>
          <input className="form-input" placeholder="SUMMER20" value={form.code}
            style={{ textTransform: 'uppercase' }}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} autoFocus />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Тип знижки</label>
            <select className="form-select" value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}>
              <option value="percent">Відсоток (%)</option>
              <option value="fixed">Фіксована сума</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Значення *</label>
            <input className="form-input" type="number" min={0}
              placeholder={form.discount_type === 'percent' ? '20' : '500'}
              value={form.offer_amount} onChange={e => setForm(f => ({ ...f, offer_amount: e.target.value }))} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Діє від</label>
            <input className="form-input" type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Діє до</label>
            <input className="form-input" type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Мін. ночей</label>
            <input className="form-input" type="number" min={1} value={form.min_nights}
              onChange={e => setForm(f => ({ ...f, min_nights: +e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Макс. ночей</label>
            <input className="form-input" type="number" min={1} placeholder="Без ліміту"
              value={form.max_nights} onChange={e => setForm(f => ({ ...f, max_nights: e.target.value }))} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Ліміт використань</label>
          <input className="form-input" type="number" min={0} placeholder="Без ліміту"
            value={form.redemption_limit} onChange={e => setForm(f => ({ ...f, redemption_limit: e.target.value }))} />
        </div>

        <div className="form-group">
          <label className="form-label">
            Діє лише в ці дні тижня
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 6 }}>
              {form.allowed_days.length === 0 ? '(всі дні)' : ''}
            </span>
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAYS.map(d => {
              const on = form.allowed_days.includes(d.key);
              return (
                <button key={d.key} type="button" onClick={() => toggleDay(d.key)}
                  style={{
                    width: 38, height: 38, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `2px solid ${on ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                    background: on ? 'var(--accent-primary)' : 'var(--surface-secondary)',
                    color: on ? '#fff' : 'var(--text-secondary)', transition: 'all .15s',
                  }}>
                  {d.label}
                </button>
              );
            })}
            {form.allowed_days.length > 0 && (
              <button type="button" onClick={() => setForm(f => ({ ...f, allowed_days: [] }))}
                style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>
                скинути
              </button>
            )}
          </div>
          {form.allowed_days.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Не вибрано — промокод діє в будь-який день
            </div>
          )}
        </div>

        {(form.applies_to === 'listings' || form.applies_to === 'both') && (
          <div className="form-group" style={{ marginTop: 14 }}>
            <label className="form-label">
              Застосовується до будиночків 
              <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 6 }}>
                {form.applied_listings.length === 0 ? '(всі будиночки)' : `(${form.applied_listings.length} вибрано)`}
              </span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 8, background: 'var(--surface-primary)' }}>
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
                  <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 13, padding: '6px 8px', borderRadius: 8, background: on ? 'rgba(34,197,94,0.06)' : 'transparent', border: `1px solid ${on ? '#22c55e' : 'transparent'}` }}>
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
        )}

        {(form.applies_to === 'services' || form.applies_to === 'both') && (
          <div className="form-group" style={{ marginTop: 14 }}>
            <label className="form-label">
              Застосовується до сервісів 
              <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 6 }}>
                {form.applicable_services.length === 0 ? '(всі сервіси)' : `(${form.applicable_services.length} вибрано)`}
              </span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 8, background: 'var(--surface-primary)' }}>
              {services.map(svc => {
                const on = form.applicable_services.includes(svc.id);
                return (
                  <label key={svc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 13, padding: '6px 8px', borderRadius: 8, background: on ? 'rgba(34,197,94,0.06)' : 'transparent', border: `1px solid ${on ? '#22c55e' : 'transparent'}` }}>
                    <input type="checkbox" checked={on} onChange={e => setForm(f => ({ ...f, applicable_services: e.target.checked ? [...f.applicable_services, svc.id] : f.applicable_services.filter(x => x !== svc.id) }))} />
                    <span style={{ fontSize: 16 }}>{svc.icon}</span>
                    <span style={{ fontWeight: on ? 600 : 400 }}>{svc.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
