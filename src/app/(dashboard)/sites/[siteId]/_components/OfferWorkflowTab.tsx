'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, Zap, Copy, Check, CopyPlus } from 'lucide-react';
import { Modal } from './SiteHelpers';
import { GIFT_CARD_TEMPLATES } from '@/lib/gift-card-builder';

const DAY_LABELS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

interface AutoRule {
  id: string;
  name: string;
  template_id: string | null;
  discount_type: string;
  offer_amount: number;
  valid_from: string | null;
  valid_until: string | null;
  min_nights: number | null;
  max_nights: number | null;
  allowed_days: string | null;
  applies_to: string;
  redemption_limit: number;
  generated_count: number;
  total_codes: number;
  used_codes: number;
  created_at: string;
}

const emptyForm = () => ({
  template_id: '',
  rule_name: '',
  count: 20,
  discount_type: 'percentage' as 'percentage' | 'fixed_amount',
  offer_amount: 15,
  valid_from: '',
  valid_until: '',
  min_nights: 1,
  max_nights: '',
  allowed_days: [] as number[],
  applies_to: 'listings' as 'listings' | 'services' | 'both',
  redemption_limit: 1,
});

function CodesModal({ ruleId, siteId, open, onClose }: {
  ruleId: string; siteId: string; open: boolean; onClose: () => void;
}) {
  const [codes, setCodes] = useState<{ code: string; current_uses: number; is_active: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/coupons?site_id=${siteId}&rule_id=${ruleId}`)
      .then(r => r.json())
      .then(d => setCodes(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [open, ruleId, siteId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const copyAll = () => {
    const text = codes.filter(c => c.is_active && !c.current_uses).map(c => c.code).join('\n');
    navigator.clipboard.writeText(text);
    setCopied('all');
    setTimeout(() => setCopied(''), 2000);
  };

  const unused = codes.filter(c => c.is_active && !c.current_uses);
  const used = codes.filter(c => c.current_uses > 0);

  return (
    <Modal open={open} onClose={onClose} title="Промокоди правила" size="lg">
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 13 }}>
            <span style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', padding: '4px 12px', borderRadius: 99, fontWeight: 600 }}>
              ✓ Вільних: {unused.length}
            </span>
            <span style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 12px', borderRadius: 99, fontWeight: 600 }}>
              ✗ Використано: {used.length}
            </span>
            {unused.length > 0 && (
              <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={copyAll}>
                {copied === 'all' ? <Check size={13} /> : <Copy size={13} />}
                Копіювати всі вільні
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
            {codes.map(c => (
              <div key={c.code} style={{
                fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
                padding: '8px 10px', borderRadius: 8, textAlign: 'center',
                border: `1px solid ${c.current_uses ? '#ef444433' : 'var(--border-primary)'}`,
                background: c.current_uses ? 'rgba(239,68,68,0.05)' : 'var(--surface-secondary)',
                color: c.current_uses ? '#ef4444' : 'var(--text-primary)',
                textDecoration: c.current_uses ? 'line-through' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
              }}>
                {c.code}
                {!c.current_uses && (
                  <button onClick={() => { navigator.clipboard.writeText(c.code); setCopied(c.code); setTimeout(() => setCopied(''), 1500); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-tertiary)' }}>
                    {copied === c.code ? <Check size={11} style={{ color: '#22c55e' }} /> : <Copy size={11} />}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

export function OfferWorkflowTab({ siteId }: { siteId: string }) {
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [viewCodesRule, setViewCodesRule] = useState<string | null>(null);
  const [lastCodes, setLastCodes] = useState<string[]>([]);
  const [showLastCodes, setShowLastCodes] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch(`/api/gift-cards/workflow?site_id=${siteId}`).then(r => r.json());
      if (d.rules) setRules(d.rules);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.offer_amount) { alert('Вкажіть знижку'); return; }
    setCreating(true);
    try {
      const body = {
        site_id: siteId,
        template_id: form.template_id || null,
        rule_name: form.rule_name || undefined,
        count: form.count,
        discount_type: form.discount_type,
        offer_amount: form.offer_amount,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        min_nights: form.min_nights || null,
        max_nights: form.max_nights ? +form.max_nights : null,
        allowed_days: form.allowed_days.length > 0 ? form.allowed_days : null,
        applies_to: form.applies_to,
        redemption_limit: form.redemption_limit,
      };
      const res = await fetch('/api/gift-cards/workflow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); return; }
      setLastCodes(d.codes || []);
      setShowLastCodes(true);
      setShowCreate(false);
      setForm(emptyForm());
      showToast(`✓ Згенеровано ${d.generated} промокодів`);
      load();
    } catch { alert('Помилка'); }
    finally { setCreating(false); }
  };

  const handleDelete = async (ruleId: string, name: string) => {
    if (!confirm(`Деактивувати правило «${name}» та невикористані промокоди?`)) return;
    const res = await fetch(`/api/gift-cards/workflow?rule_id=${ruleId}`, { method: 'DELETE' });
    if (res.ok) { showToast('Правило видалено'); load(); }
  };

  const toggleDay = (d: number) => setForm(f => ({
    ...f,
    allowed_days: f.allowed_days.includes(d)
      ? f.allowed_days.filter(x => x !== d)
      : [...f.allowed_days, d].sort(),
  }));

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Згенерувати промокоди
        </button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(139,92,246,0.06)', borderRadius: 10, border: '1px solid rgba(139,92,246,0.15)' }}>
        <Zap size={16} style={{ color: '#8b5cf6', flexShrink: 0 }} />
        <span><strong>Масові промокоди:</strong> Створіть кампанію, і система автоматично згенерує вказану кількість унікальних промокодів (напр., 50 кодів зі знижкою 10%). Ви зможете роздати їх блогерам, партнерам або використати в email-розсилках. Кожен такий код може бути використаний лише вказану кількість разів.</span>
      </div>

      {/* Rules list */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>
      ) : rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <Zap size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
          <div style={{ fontWeight: 600 }}>Кампаній ще немає</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Створіть першу кампанію, щоб згенерувати унікальні промокоди</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map(rule => {
            const tpl = GIFT_CARD_TEMPLATES.find(t => t.id === rule.template_id);
            const daysLabel = rule.allowed_days
              ? (JSON.parse(rule.allowed_days) as number[]).map(d => DAY_LABELS[d]).join(', ')
              : 'Будь-який день';
            const usedPct = rule.total_codes > 0 ? Math.round(rule.used_codes / rule.total_codes * 100) : 0;

            return (
              <div key={rule.id} style={{ border: '1px solid var(--border-primary)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', background: 'var(--surface-secondary)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      {tpl && <span style={{ fontSize: 18 }}>{tpl.emoji}</span>}
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{rule.name}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', fontWeight: 600 }}>
                        {rule.offer_amount}{rule.discount_type === 'percentage' ? '%' : ` ${rule.applies_to === 'listings' ? 'CZK' : 'CZK'}`} знижка
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '4px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {tpl && <span>📦 Шаблон: {tpl.name}</span>}
                      <span>🎟 Кодів: {rule.total_codes} ({rule.used_codes} використано)</span>
                      {rule.valid_until && <span>⏳ До: {rule.valid_until}</span>}
                      <span>📅 {daysLabel}</span>
                      {rule.min_nights && <span>🌙 Від {rule.min_nights} ночей</span>}
                      <span>🔄 Ліміт: {rule.redemption_limit}x</span>
                    </div>

                    {/* Progress bar */}
                    {rule.total_codes > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ height: 4, borderRadius: 99, background: 'var(--border-primary)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, width: `${usedPct}%`, background: usedPct > 80 ? '#ef4444' : usedPct > 50 ? '#f59e0b' : '#22c55e', transition: 'width .3s' }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                          {rule.total_codes - rule.used_codes} вільних з {rule.total_codes}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                      onClick={() => setViewCodesRule(rule.id)}>
                      <Copy size={13} /> Коди
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '5px 8px', color: 'var(--text-secondary)' }} onClick={() => {
                      setForm({
                        template_id: rule.template_id || '',
                        rule_name: rule.name + ' (Копія)',
                        count: 10,
                        discount_type: rule.discount_type as 'percentage' | 'fixed_amount',
                        offer_amount: Number(rule.offer_amount),
                        valid_from: rule.valid_from || '',
                        valid_until: rule.valid_until || '',
                        min_nights: rule.min_nights || 1,
                        max_nights: rule.max_nights ? String(rule.max_nights) : '',
                        allowed_days: rule.allowed_days ? JSON.parse(rule.allowed_days) : [],
                        applies_to: rule.applies_to as 'listings' | 'services' | 'both',
                        redemption_limit: rule.redemption_limit || 1,
                      });
                      setShowCreate(true);
                    }} title="Дублювати правило (генерує нову партію)">
                      <CopyPlus size={14} />
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '5px 8px', color: '#ef4444' }}
                      onClick={() => handleDelete(rule.id, rule.name)} title="Деактивувати та в архів">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Згенерувати масові промокоди" size="lg"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={14} className="spin" /> : <Zap size={14} />} Згенерувати
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Template picker */}
          <div className="form-group">
            <label className="form-label">Прив&apos;язати до існуючої пропозиції (необов&apos;язково)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" onClick={() => setForm(f => ({ ...f, template_id: '' }))}
                style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', textAlign: 'left', border: `2px solid ${!form.template_id ? 'var(--accent-primary)' : 'var(--border-primary)'}`, background: !form.template_id ? 'var(--accent-primary-dim)' : 'var(--surface-secondary)' }}>
                <div style={{ fontWeight: 600 }}>Без шаблону</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Власні параметри</div>
              </button>
              {GIFT_CARD_TEMPLATES.map(t => (
                <button key={t.id} type="button" onClick={() => setForm(f => ({ ...f, template_id: t.id, rule_name: f.rule_name || t.name }))}
                  style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', textAlign: 'left', border: `2px solid ${form.template_id === t.id ? 'var(--accent-primary)' : 'var(--border-primary)'}`, background: form.template_id === t.id ? 'var(--accent-primary-dim)' : 'var(--surface-secondary)' }}>
                  <div style={{ fontWeight: 600 }}>{t.emoji} {t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t.badge}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Rule name */}
          <div className="form-group">
            <label className="form-label">Назва правила</label>
            <input className="form-input" placeholder="Наприклад: Літня знижка 15%" value={form.rule_name}
              onChange={e => setForm(f => ({ ...f, rule_name: e.target.value }))} />
          </div>

          {/* Count + discount */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Кількість кодів (1–500)</label>
              <input className="form-input" type="number" min={1} max={500} value={form.count}
                onChange={e => setForm(f => ({ ...f, count: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Тип знижки</label>
              <select className="form-select" value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as 'percentage' | 'fixed_amount' }))}>
                <option value="percentage">Відсоток (%)</option>
                <option value="fixed_amount">Фіксована сума (CZK)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Розмір знижки</label>
              <input className="form-input" type="number" min={0} value={form.offer_amount}
                onChange={e => setForm(f => ({ ...f, offer_amount: +e.target.value }))}
                placeholder={form.discount_type === 'percentage' ? '15' : '500'} />
            </div>
          </div>

          {/* Dates */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Коди діють від</label>
              <input className="form-input" type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Коди діють до</label>
              <input className="form-input" type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
            </div>
          </div>

          {/* Nights */}
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
            <div className="form-group">
              <label className="form-label">Ліміт / код</label>
              <input className="form-input" type="number" min={1} value={form.redemption_limit}
                onChange={e => setForm(f => ({ ...f, redemption_limit: +e.target.value }))} />
            </div>
          </div>

          {/* Applies to */}
          <div className="form-group">
            <label className="form-label">Застосовується до</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['listings', '🏠 Оголошення'], ['services', '🛎 Сервіси'], ['both', '🏠+🛎 Обидва']] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setForm(f => ({ ...f, applies_to: val }))}
                  style={{ flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `2px solid ${form.applies_to === val ? 'var(--accent-primary)' : 'var(--border-primary)'}`, background: form.applies_to === val ? 'var(--accent-primary)' : 'var(--surface-secondary)', color: form.applies_to === val ? '#fff' : 'var(--text-secondary)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Days */}
          <div className="form-group">
            <label className="form-label">Дні тижня <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 11 }}>{form.allowed_days.length === 0 ? '(всі дні)' : ''}</span></label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DAYS.map(d => {
                const on = form.allowed_days.includes(d);
                return (
                  <button key={d} type="button" onClick={() => toggleDay(d)}
                    style={{ width: 38, height: 38, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `2px solid ${on ? 'var(--accent-primary)' : 'var(--border-primary)'}`, background: on ? 'var(--accent-primary)' : 'var(--surface-secondary)', color: on ? '#fff' : 'var(--text-secondary)' }}>
                    {DAY_LABELS[d]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* Codes viewer modal */}
      <CodesModal
        open={!!viewCodesRule}
        ruleId={viewCodesRule || ''}
        siteId={siteId}
        onClose={() => setViewCodesRule(null)}
      />

      {/* Last generated codes modal */}
      <Modal open={showLastCodes} onClose={() => setShowLastCodes(false)} title="Згенеровані промокоди" size="lg"
        footer={<button className="btn btn-primary" onClick={() => setShowLastCodes(false)}>Закрити</button>}
      >
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Ці коди вже збережено в системі. Їх можна роздати клієнтам, які придбали ваучер.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {lastCodes.map(code => (
            <div key={code} style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', textAlign: 'center' }}>
              {code}
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 12, fontSize: 12 }} onClick={() => {
          navigator.clipboard.writeText(lastCodes.join('\n'));
          showToast('Скопійовано!');
        }}>
          <Copy size={13} /> Копіювати всі
        </button>
      </Modal>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: '#22c55e', color: '#fff', padding: '12px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
