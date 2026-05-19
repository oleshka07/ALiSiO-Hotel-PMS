'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, X, Check, Code2, Image as ImageIcon, Upload } from 'lucide-react';
import { Modal, CopyBtn, Chk } from './SiteHelpers';
import type { Listing } from '../_types';

function ListingRow({ listing, siteId, siteSlug, onDelete, onEdit, siteCurrency }: {
  listing: Listing;
  siteId: string;
  siteSlug: string;
  onDelete: (id: string) => void;
  onEdit: (l: Listing) => void;
  siteCurrency: string;
}) {
  const unitName = listing.unit_name || listing.unit_type_name || listing.id;
  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => onEdit(listing)}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
            background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {listing.photos || listing.unit_type_photos ? (
              <img
                src={(listing.photos || listing.unit_type_photos || '').split(',')[0]}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <ImageIcon size={18} style={{ color: 'var(--text-tertiary)', opacity: 0.5 }} />
            )}
          </div>
          <div style={{ fontWeight: 600 }}>{unitName}</div>
        </div>
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{listing.unit_id ? 'Юніт' : 'Тип юніту'}</td>
      <td style={{ fontSize: 13 }}>{listing.price_override ? `${listing.price_override} ${siteCurrency}` : 'За прайсом'}</td>
      <td style={{ textAlign: 'center' }}><Chk val={listing.external_url} /></td>
      <td style={{ textAlign: 'center' }}><Chk val={listing.thank_you_url} /></td>
      <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
          <button className="btn btn-ghost" style={{ padding: '4px 8px', color: '#ef4444' }}
            onClick={() => onDelete(listing.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ListingEditModal({ listing, siteId, siteSlug, open, onClose, onRefresh, siteCurrency }: {
  listing: Listing | null;
  siteId: string;
  siteSlug: string;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
  siteCurrency: string;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ external_url: '', default_lang: '', price_override: '', thank_you_url: '' });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [embedLang, setEmbedLang] = useState('uk');
  const [origin] = useState(() => typeof window !== 'undefined' ? window.location.origin : '');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (listing) {
      setForm({
        external_url: listing.external_url || '',
        default_lang: listing.default_lang || '',
        price_override: listing.price_override ? String(listing.price_override) : '',
        thank_you_url: listing.thank_you_url || '',
      });
      const photoStr = listing.photos || listing.unit_type_photos || '';
      setPhotoUrls(photoStr ? photoStr.split(',').map(s => s.trim()).filter(Boolean) : []);
    }
  }, [listing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!listing) return null;

  const save = async () => {
    setSaving(true);
    await fetch(`/api/booking-sites/${siteId}/listings/${listing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        external_url: form.external_url.trim() || null,
        default_lang: form.default_lang || null,
        price_override: form.price_override ? Number(form.price_override) : null,
        thank_you_url: form.thank_you_url.trim() || null,
        photos: photoUrls.length > 0 ? photoUrls.join(',') : null,
      }),
    });
    if (listing.actual_unit_type_id) {
      await fetch(`/api/unit-types/${listing.actual_unit_type_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: photoUrls.join(',') }),
      });
    }
    setSaving(false);
    onClose();
    onRefresh();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('unit_type_id', listing.actual_unit_type_id!);
      const res = await fetch('/api/photos/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.url) {
        setPhotoUrls(prev => [...prev, data.url]);
      } else {
        throw new Error(data.error || `Помилка завантаження (${res.status})`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка завантаження. Спробуйте інше фото.';
      alert(msg);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (idx: number) => setPhotoUrls(prev => prev.filter((_, i) => i !== idx));

  const LANGS = ['uk', 'cs', 'en', 'de'];
  const unitName = listing.unit_name || listing.unit_type_name || listing.id;

  return (
    <Modal open={open} onClose={onClose} title={unitName} size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Зберегти
          </button>
        </>
      }>
      <div className="form-group">
        <label className="form-label">URL сторінки об&apos;єкта</label>
        <input className="form-input" placeholder="https://yoursite.com/cabin-b3"
          value={form.external_url} onChange={e => setForm(f => ({ ...f, external_url: e.target.value }))} />
      </div>

      <div className="form-row" style={{ marginTop: 16 }}>
        <div className="form-group">
          <label className="form-label">Кастомна ціна ({siteCurrency})</label>
          <input className="form-input" type="number" min="0" placeholder="Залишити пустим для ціни за прайсом"
            value={form.price_override} onChange={e => setForm(f => ({ ...f, price_override: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">URL сторінки подяки (Thank You)</label>
          <input className="form-input" placeholder="https://yoursite.com/thanks-b3"
            value={form.thank_you_url} onChange={e => setForm(f => ({ ...f, thank_you_url: e.target.value }))} />
        </div>
      </div>

      <div className="form-group" style={{ marginTop: 24 }}>
        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ImageIcon size={16} /> Фотографії об&apos;єкта
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12, marginTop: 12 }}>
          {photoUrls.map((url, idx) => (
            <div key={idx} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => removePhoto(idx)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={12} />
              </button>
            </div>
          ))}
          <label style={{ aspectRatio: '4/3', border: '2px dashed var(--border-primary)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 4, color: 'var(--text-secondary)' }}>
            {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
            <span style={{ fontSize: 11 }}>{uploading ? '...' : 'Завантажити'}</span>
            <input type="file" accept="image/*" hidden onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div style={{ marginTop: 32, borderTop: '1px solid var(--border-primary)', paddingTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Code2 size={18} style={{ color: 'var(--accent-primary)' }} />
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Код для вставки (Embed)</h4>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Використовуйте цей код, щоб додати віджет бронювання саме для цього об&apos;єкта на ваш сайт.
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {LANGS.map(l => (
              <button key={l} type="button" onClick={() => setEmbedLang(l)}
                style={{
                  padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `2px solid ${embedLang === l ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  background: embedLang === l ? 'var(--accent-primary)' : 'var(--surface-secondary)',
                  color: embedLang === l ? '#fff' : 'var(--text-secondary)',
                }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <pre style={{
            background: 'var(--surface-secondary)', borderRadius: 8, padding: 16,
            fontSize: 12, overflowX: 'auto', fontFamily: 'monospace', lineHeight: 1.5,
            border: '1px solid var(--border-primary)',
          }}>
            {`<script \n  src="${origin || 'http://localhost:3000'}/widget/embed.v2.js" \n  data-site="${siteSlug}" \n  data-unit="${listing.unit_id || listing.unit_type_id}" \n  data-lang="${embedLang}">\n</script>`}
          </pre>
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <CopyBtn text={`<script src="${origin || 'http://localhost:3000'}/widget/embed.v2.js" data-site="${siteSlug}" data-unit="${listing.unit_id || listing.unit_type_id}" data-lang="${embedLang}"></script>`} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ListingsTab({ siteId, siteSlug, siteCurrency = 'CZK' }: { siteId: string; siteSlug: string; siteCurrency?: string }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [unitTypes, setUnitTypes] = useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string; code: string; unit_type_id: string }[]>([]);
  const [activeUt, setActiveUt] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addMode, setAddMode] = useState<'unit' | 'unit_type'>('unit');
  const [adding, setAdding] = useState(false);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/booking-sites/${siteId}/listings`);
    const d = await res.json();
    if (Array.isArray(d.listings)) setListings(d.listings);
    setLoading(false);
  }, [siteId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchListings(); }, [fetchListings]);
  useEffect(() => {
    if (!showAdd) return;
    Promise.all([
      fetch('/api/unit-types').then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
    ]).then(([uts, us]) => {
      if (Array.isArray(uts)) { setUnitTypes(uts); setActiveUt(uts[0]?.id || ''); }
      if (Array.isArray(us)) setUnits(us);
    });
  }, [showAdd]);

  const unitsByType = units.filter(u => u.unit_type_id === activeUt);

  const handleAdd = async () => {
    if (!selected.size) return;
    setAdding(true);
    const batch = Array.from(selected).map(id =>
      addMode === 'unit' ? { unit_id: id } : { unit_type_id: id }
    );
    await fetch(`/api/booking-sites/${siteId}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    setAdding(false);
    setShowAdd(false);
    setSelected(new Set());
    fetchListings();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити оголошення?')) return;
    await fetch(`/api/booking-sites/${siteId}/listings/${id}`, { method: 'DELETE' });
    fetchListings();
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>;

  return (
    <div>
      <div className="table-toolbar" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{listings.length} оголошень</div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Додати оголошення</button>
      </div>

      {listings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <div>Додайте юніти або типи, які будуть доступні на цьому сайті</div>
        </div>
      ) : (
        <table className="data-table">
          <thead><tr>
            <th>Назва</th>
            <th>Тип</th>
            <th>Ціна</th>
            <th style={{ textAlign: 'center' }}>URL сторінки</th>
            <th style={{ textAlign: 'center' }}>URL подяки</th>
            <th></th>
          </tr></thead>
          <tbody>
            {listings.map(l => (
              <ListingRow key={l.id} listing={l} siteId={siteId} siteSlug={siteSlug} siteCurrency={siteCurrency} onDelete={handleDelete} onEdit={setEditingListing} />
            ))}
          </tbody>
        </table>
      )}

      <ListingEditModal
        listing={editingListing}
        siteId={siteId} siteSlug={siteSlug}
        siteCurrency={siteCurrency}
        open={!!editingListing} onClose={() => setEditingListing(null)} onRefresh={fetchListings}
      />

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Додати оголошення" size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Скасувати</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !selected.size}>
              {adding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
              Додати вибране ({selected.size})
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['unit', 'unit_type'] as const).map(m => (
            <button key={m} className={`btn ${addMode === m ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setAddMode(m); setSelected(new Set()); }}>
              {m === 'unit' ? '🏠 Конкретні юніти' : '📦 Типи юнітів'}
            </button>
          ))}
        </div>

        {addMode === 'unit' && (
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, minHeight: 300 }}>
            <div style={{ borderRight: '1px solid var(--border-primary)', paddingRight: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>ТИП ЮНІТУ</div>
              {unitTypes.map(ut => (
                <div key={ut.id} onClick={() => setActiveUt(ut.id)}
                  style={{
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: activeUt === ut.id ? 600 : 400,
                    background: activeUt === ut.id ? 'var(--accent-primary-dim)' : 'transparent',
                    color: activeUt === ut.id ? 'var(--accent-primary)' : 'var(--text-primary)', fontSize: 13,
                  }}>
                  {ut.name}
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>ЮНІТИ</div>
              {unitsByType.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Немає юнітів</div>}
              {unitsByType.map(u => {
                const chk = selected.has(u.id);
                const alreadyAdded = listings.some(l => l.unit_id === u.id);
                return (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: alreadyAdded ? 'not-allowed' : 'pointer', opacity: alreadyAdded ? 0.5 : 1 }}>
                    <input type="checkbox" checked={chk} disabled={alreadyAdded}
                      onChange={() => { const s = new Set(selected); chk ? s.delete(u.id) : s.add(u.id); setSelected(s); }} />
                    <span style={{ fontSize: 13 }}>{u.name} <span style={{ color: 'var(--text-tertiary)' }}>({u.code})</span></span>
                    {alreadyAdded && <span style={{ fontSize: 11, color: 'var(--accent-primary)' }}>вже додано</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {addMode === 'unit_type' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>ТИПИ ЮНІТІВ</div>
            {unitTypes.map(ut => {
              const chk = selected.has(ut.id);
              const alreadyAdded = listings.some(l => l.unit_type_id === ut.id);
              return (
                <label key={ut.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', cursor: alreadyAdded ? 'not-allowed' : 'pointer', opacity: alreadyAdded ? 0.5 : 1 }}>
                  <input type="checkbox" checked={chk} disabled={alreadyAdded}
                    onChange={() => { const s = new Set(selected); chk ? s.delete(ut.id) : s.add(ut.id); setSelected(s); }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{ut.name}</span>
                  {alreadyAdded && <span style={{ fontSize: 11, color: 'var(--accent-primary)' }}>вже додано</span>}
                </label>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
