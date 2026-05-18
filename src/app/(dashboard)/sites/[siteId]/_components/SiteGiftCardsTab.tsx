'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, Gift, Ticket, Check, Copy, CopyPlus } from 'lucide-react';
import { Modal } from './SiteHelpers';

const GIFT_CARD_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Чернетка',    color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  active:    { label: 'Активний',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  paid:      { label: 'Оплачено',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  activated:  { label: 'Погашено',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
  expired:   { label: 'Прострочено', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  cancelled: { label: 'Скасовано',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
};

const FILTERS = [['all', 'Всі'], ['active', 'Активні'], ['paid', 'Оплачені'], ['activated', 'Погашені'], ['expired', 'Прострочені']];

const emptyForm = () => ({
  recipient_name: '', recipient_email: '', buyer_name: '',
  buyer_phone: '', message: '', expires_at: '', notes: '',
  // custom (no template) fields:
  custom_name: '', custom_face_value: '', custom_currency: 'CZK',
});

interface GiftCard {
  id: string;
  code: string;
  name: string;
  status: string;
  face_value?: number;
  currency?: string;
  recipient_name?: string;
  expires_at?: string;
  check_in?: string;
}

interface GiftCardTemplate {
  id: string;
  name: string;
  emoji: string;
  badge: string;
  description: string;
  validityMonths?: number;
}

export function SiteGiftCardsTab({ siteId, onCountChange }: { siteId: string; onCountChange?: (n: number) => void }) {
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [templates, setTemplates] = useState<GiftCardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [toast, setToast] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<'pick' | 'fill'>('pick');
  const [tpl, setTpl] = useState<GiftCardTemplate | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [activeCard, setActiveCard] = useState<GiftCard | null>(null);
  const [activationId, setActivationId] = useState('');
  const [activating, setActivating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const onCountRef = useRef(onCountChange);
  useEffect(() => { onCountRef.current = onCountChange; }, [onCountChange]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ site_id: siteId });
      if (filterStatus !== 'all') p.set('status', filterStatus);
      const d = await fetch(`/api/gift-cards?${p}`).then(r => r.json());
      if (d.giftCards) { setGiftCards(d.giftCards); onCountRef.current?.(d.giftCards.length); }
      if (d.templates) setTemplates(d.templates);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [siteId, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const body = tpl
        ? { site_id: siteId, template_id: tpl.id, ...form }
        : {
            site_id: siteId,
            name: form.custom_name || 'Ваучер',
            face_value: form.custom_face_value ? +form.custom_face_value : 0,
            currency: form.custom_currency || 'CZK',
            type: 'open_date',
            value_type: 'fixed_czk',
            ...form,
          };
      const res = await fetch('/api/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { showToast('Ваучер створено!'); setShowCreate(false); load(); }
      else { const d = await res.json(); alert(d.error); }
    } catch { alert('Помилка'); } finally { setCreating(false); }
  };

  const handlePatch = async (v: GiftCard, status: string) => {
    await fetch(`/api/gift-cards/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    showToast('Оновлено'); load();
  };

  const handleDelete = async (v: GiftCard) => {
    if (!confirm(`Скасувати ${v.code}?`)) return;
    await fetch(`/api/gift-cards/${v.id}`, { method: 'DELETE' });
    showToast('Скасовано'); load();
  };

  const handleActivation = async () => {
    if (!activeCard || !activationId.trim()) return;
    setActivating(true);
    try {
      const res = await fetch(`/api/gift-cards/${activeCard.id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: activationId.trim() }),
      });
      if (res.ok) { showToast('Погашено ✓'); setActiveCard(null); setActivationId(''); load(); }
      else { const d = await res.json(); alert(d.error); }
    } catch { alert('Помилка'); } finally { setActivating(false); }
  };

  return (
    <div>
      {/* Create button above filters */}
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={() => { setTpl(null); setStep('pick'); setForm(emptyForm()); setShowCreate(true); }}>
          <Plus size={16} /> Новий ваучер
        </button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, padding: '10px 14px', background: 'rgba(139,92,246,0.06)', borderRadius: 10, border: '1px solid rgba(139,92,246,0.15)', display: 'flex', gap: 8, maxWidth: 400 }}>
        <Gift size={16} style={{ color: '#8b5cf6', flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Подарунковий ваучер (Грошовий сертифікат)</strong> — це унікальний код на певну суму (напр., 2000 CZK), який ви видаєте конкретному гостю. Він працює як засіб платежу. Якщо ви хочете створити загальну акційну пропозицію для всіх (наприклад, пакет &quot;Осінній релакс&quot; або єдиний код знижки), використовуйте вкладки <strong>Пакети</strong> або <strong>Промокоди</strong>.
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setFilterStatus(k)}
            className={filterStatus === k ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ padding: '4px 14px', fontSize: 13 }}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" style={{ color: 'var(--accent-primary)' }} /></div>
      ) : giftCards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <Gift size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>Ваучерів ще немає</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
          {giftCards.map(v => {
            const st = GIFT_CARD_STATUS_CFG[v.status] || GIFT_CARD_STATUS_CFG.active;
            return (
              <div key={v.id} style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{v.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code style={{ fontSize: 13, color: 'var(--accent-primary)', fontWeight: 700, letterSpacing: 1 }}>{v.code}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(v.code as string);
                          setCopiedId(v.id as string);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}
                        title="Копіювати код"
                      >
                        {copiedId === v.id ? <Check size={13} style={{ color: '#22c55e' }} /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {v.recipient_name && <span>🎁 {v.recipient_name}</span>}
                  <span>💰 {v.face_value?.toLocaleString('cs-CZ')} {v.currency}</span>
                  {v.expires_at && <span>⏳ До: {new Date(v.expires_at).toLocaleDateString('uk-UA')}</span>}
                  {v.status === 'activated' && v.check_in && <span>✅ {new Date(v.check_in).toLocaleDateString('uk-UA')}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  {(v.status === 'active' || v.status === 'paid') && (
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => { setActiveCard(v); setActivationId(''); }}>
                      <Ticket size={12} /> Погасити
                    </button>
                  )}
                  {v.status === 'draft' && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handlePatch(v, 'active')}><Check size={12} /> Активувати</button>}
                  {v.status === 'active' && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handlePatch(v, 'paid')}>💳 Оплачено</button>}
                  
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: 'var(--text-secondary)' }} onClick={() => {
                      setForm({
                        recipient_name: v.recipient_name || '',
                        recipient_email: '',
                        buyer_name: '',
                        buyer_phone: '',
                        message: '',
                        expires_at: v.expires_at ? new Date(v.expires_at).toISOString().split('T')[0] : '',
                        notes: '',
                        custom_name: v.name + ' (Копія)',
                        custom_face_value: String(v.face_value || ''),
                        custom_currency: v.currency || 'CZK',
                      });
                      setTpl(null);
                      setStep('fill');
                      setShowCreate(true);
                    }} title="Дублювати ваучер (створить новий)">
                      <CopyPlus size={12} />
                    </button>
                    {!['activated', 'cancelled'].includes(v.status) && (
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: '#ef4444' }} onClick={() => handleDelete(v)} title="Видалити">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Новий ваучер" size="lg"
        footer={step === 'fill' ? (
          <>
            <button className="btn btn-ghost" onClick={() => setStep('pick')}>← Назад</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 size={14} className="spin" /> : <Gift size={14} />} Створити
            </button>
          </>
        ) : undefined}
      >
        {step === 'pick' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Оберіть шаблон або створіть власний ваучер:</div>

            {/* Без шаблону */}
            <div onClick={() => { setTpl(null); setStep('fill'); }}
              style={{ border: '2px dashed var(--border-primary)', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', background: 'var(--surface-secondary)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>✏️</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Без шаблону</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Вказати назву, суму та дані вручну</div>
              </div>
            </div>

            {templates.map(t => (
              <div key={t.id} onClick={() => { setTpl(t); setStep('fill'); }}
                style={{ border: '2px solid var(--border-primary)', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', background: 'var(--surface-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{t.emoji} {t.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-primary)' }}>{t.badge}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t.description}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tpl
              ? <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', fontSize: 13 }}>{tpl.emoji} <strong>{tpl.name}</strong> — {tpl.badge}</div>
              : (
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>✏️ Власний ваучер</div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label">Назва ваучера *</label>
                      <input className="form-input" placeholder="Романтичний вікенд" value={form.custom_name} onChange={e => setForm(f => ({ ...f, custom_name: e.target.value }))} autoFocus />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Сума</label>
                      <input className="form-input" type="number" min={0} placeholder="4900" value={form.custom_face_value} onChange={e => setForm(f => ({ ...f, custom_face_value: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Валюта</label>
                      <select className="form-select" value={form.custom_currency} onChange={e => setForm(f => ({ ...f, custom_currency: e.target.value }))}>
                        <option>CZK</option>
                        <option>EUR</option>
                        <option>USD</option>
                      </select>
                    </div>
                  </div>
                </div>
              )
            }
            <div className="form-row">
              <div className="form-group"><label className="form-label">Ім&apos;я отримувача</label><input className="form-input" value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Email отримувача</label><input className="form-input" type="email" value={form.recipient_email} onChange={e => setForm(f => ({ ...f, recipient_email: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Покупець</label><input className="form-input" value={form.buyer_name} onChange={e => setForm(f => ({ ...f, buyer_name: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Телефон покупця</label><input className="form-input" value={form.buyer_phone} onChange={e => setForm(f => ({ ...f, buyer_phone: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label className="form-label">Повідомлення</label><textarea className="form-input" rows={2} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} style={{ resize: 'vertical' }} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Термін дії (авто +{tpl?.validityMonths} міс.)</label><input className="form-input" type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Нотатки</label><input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!activeCard} onClose={() => setActiveCard(null)} title="Погашення ваучера"
        footer={<><button className="btn btn-ghost" onClick={() => setActiveCard(null)}>Скасувати</button><button className="btn btn-primary" onClick={handleActivation} disabled={activating || !activationId.trim()}>{activating ? <Loader2 size={14} className="spin" /> : <Ticket size={14} />} Погасити</button></>}
      >
        {activeCard && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', fontSize: 13 }}>
              🎟️ <strong>{activeCard.code}</strong> — {activeCard.name}
              {activeCard.recipient_name && <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>Для: {activeCard.recipient_name}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">ID бронювання *</label>
              <input className="form-input" placeholder="reservation_id з PMS" value={activationId} onChange={e => setActivationId(e.target.value)} autoFocus />
            </div>
          </div>
        )}
      </Modal>

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: '#22c55e', color: '#fff', padding: '12px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>✓ {toast}</div>}
    </div>
  );
}
