'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { RatePlan, Listing } from '../_types';

export function RatePlansTab({ siteId, onCountChange }: { siteId: string; onCountChange?: (n: number) => void }) {
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | 'new' | null>(null);

  const onCountRef = useRef(onCountChange);
  useEffect(() => { onCountRef.current = onCountChange; }, [onCountChange]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resPlans, resList] = await Promise.all([
        fetch(`/api/booking-sites/${siteId}/rate-plans`),
        fetch(`/api/booking-sites/${siteId}/listings`)
      ]);
      const dPlans = await resPlans.json();
      const dList = await resList.json();
      if (Array.isArray(dPlans.plans)) { 
        setPlans(dPlans.plans); 
        onCountRef.current?.(dPlans.plans.length);
      }
      if (Array.isArray(dList.listings)) { setListings(dList.listings); }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [siteId]);

  const didAutoSelect = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchData().then(() => {
      // auto-select is handled inside fetchData via ref
    });
  }, [fetchData]);

  useEffect(() => {
    if (!loading && plans.length > 0 && !selectedPlanId && !didAutoSelect.current) {
      didAutoSelect.current = true;
      setSelectedPlanId(plans[0].id);
    }
  }, [loading, plans, selectedPlanId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>;

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 200px)' }}>
      {/* Sidebar */}
      <div style={{ width: 250, flexShrink: 0, borderRight: '1px solid var(--border-primary)', paddingRight: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plans.map(plan => (
            <div 
              key={plan.id}
              onClick={() => setSelectedPlanId(plan.id)}
              style={{ 
                padding: '12px 16px', 
                cursor: 'pointer', 
                borderRadius: 8,
                background: selectedPlanId === plan.id ? 'var(--surface-secondary)' : 'transparent',
                borderLeft: selectedPlanId === plan.id ? '3px solid var(--accent-primary)' : '3px solid transparent'
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 14 }}>{plan.name || 'Без назви'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {plan.applied_listings ? plan.applied_listings.length : 0} оголошень
              </div>
            </div>
          ))}
          <button 
            className="btn btn-ghost" 
            style={{ marginTop: 8, justifyContent: 'flex-start', color: 'var(--accent-primary)' }}
            onClick={() => setSelectedPlanId('new')}
          >
            <Plus size={16} /> Новий тарифний план
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, paddingLeft: 32, paddingBottom: 64 }}>
        {!selectedPlanId ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 600 }}>
            <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginBottom: 12 }}>Установіть декілька цін для ваших оголошень</h3>
            <p style={{ marginBottom: 16 }}>У деяких випадках ви можете захотіти встановити кілька різних цін для вашого оголошення:</p>
            <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <li>Дозволити різним правилам скасування відповідати різним цінам.</li>
              <li>Пропонувати додаткові знижки за раннє бронювання або для довгострокових гостей.</li>
              <li>Встановити різні ціни для гостей, які включають сніданок у своє бронювання.</li>
            </ul>
            <p>Ви можете досягти цього, створивши декілька тарифних планів і застосовуючи їх до різних оголошень. Гості зможуть вибрати бажану ціну при бронюванні.</p>
          </div>
        ) : (
          <RatePlanForm 
            siteId={siteId}
            plan={selectedPlanId === 'new' ? null : selectedPlan}
            allPlans={plans}
            listings={listings}
            onSaved={async () => {
              await fetchData();
              if (selectedPlanId === 'new') setSelectedPlanId(null);
            }}
            onDeleted={() => {
              setSelectedPlanId(null);
              fetchData();
            }}
          />
        )}
      </div>
    </div>
  );
}

function RatePlanForm({ siteId, plan, listings, allPlans, onSaved, onDeleted }: { siteId: string; plan?: RatePlan | null; listings: Listing[]; allPlans: RatePlan[]; onSaved: () => void; onDeleted: () => void }) {
  const isNew = !plan;

  // The standard/default plan — used as the base for all Derived plans
  const defaultPlan = allPlans.find(p => p.is_default === 1) ?? allPlans[0];
  const defaultDerivedId = plan?.derived_from_plan_id ?? defaultPlan?.id ?? '';

  const [form, setForm] = useState({
    name: plan?.name || '',
    cancellation_policy: plan?.cancellation_policy || 'non_refundable',
    payment_schedule: plan?.payment_schedule || [{ percent: 100, trigger: 'at_booking' }],
    meals_included: plan?.meals_included || [],
    min_stay: plan?.min_stay || 1,
    max_stay: plan?.max_stay || 999,
    min_days_before_checkin: plan?.min_days_before_checkin || 0,
    pricing_mode: plan?.pricing_mode || 'independent',
    applied_listings: plan?.applied_listings || [],
    is_default: plan?.is_default === 1,
    same_day_cutoff_hour: plan?.same_day_cutoff_hour ?? null,
    pricing_modifier_percent: plan?.pricing_modifier_percent ?? 0,
    pricing_modifier_type: plan?.pricing_modifier_type ?? 'less',
    derived_from_plan_id: defaultDerivedId,
    valid_weekdays: plan?.valid_weekdays || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  });
  const [saving, setSaving] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (plan) {
      setForm({
        name: plan.name || '',
        cancellation_policy: plan.cancellation_policy || 'non_refundable',
        payment_schedule: plan.payment_schedule || [{ percent: 100, trigger: 'at_booking' }],
        meals_included: plan.meals_included || [],
        min_stay: plan.min_stay || 1,
        max_stay: plan.max_stay || 999,
        min_days_before_checkin: plan.min_days_before_checkin || 0,
        pricing_mode: plan.pricing_mode || 'independent',
        applied_listings: plan.applied_listings || [],
        is_default: plan.is_default === 1,
        same_day_cutoff_hour: plan.same_day_cutoff_hour ?? null,
        pricing_modifier_percent: plan.pricing_modifier_percent ?? 0,
        pricing_modifier_type: plan.pricing_modifier_type ?? 'less',
        derived_from_plan_id: plan.derived_from_plan_id ?? '',
        valid_weekdays: plan.valid_weekdays || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      });
    } else {
      // New plan: default derived_from_plan_id to the standard/default plan
      const fallbackPlan = allPlans.find(p => p.is_default === 1) ?? allPlans[0];
      setForm({
        name: '', cancellation_policy: 'non_refundable',
        payment_schedule: [{ percent: 100, trigger: 'at_booking' }],
        meals_included: [], min_stay: 1, max_stay: 999, min_days_before_checkin: 0,
        pricing_mode: 'independent', applied_listings: [], is_default: false,
        same_day_cutoff_hour: null as number | null,
        valid_weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        pricing_modifier_percent: 0,
        pricing_modifier_type: 'less',
        derived_from_plan_id: fallbackPlan?.id ?? '',
      });
    }
  }, [plan]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Введіть назву');
    setSaving(true);
    try {
      const url = `/api/booking-sites/${siteId}/rate-plans${isNew ? '' : `/${plan.id}`}`;
      await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, is_default: form.is_default ? 1 : 0 })
      });
      onSaved();
    } catch (e) {
      console.error(e);
      alert('Помилка збереження');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Видалити цей тариф?')) return;
    try {
      await fetch(`/api/booking-sites/${siteId}/rate-plans/${plan?.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 650 }}>
      {/* Cancellation */}
      <div>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Політика скасування</h4>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, display: 'block' }}>Коли гість запитує повернення, дозволена сума буде розрахована на основі цих правил.</span>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="radio" name={`cancel_${isNew ? 'new' : plan?.id}`} checked={form.cancellation_policy === 'non_refundable'} onChange={() => setForm(f => ({ ...f, cancellation_policy: 'non_refundable' }))} />
            <span style={{ fontSize: 14 }}>Без повернення (Безвозвратно)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="radio" name={`cancel_${isNew ? 'new' : plan?.id}`} checked={form.cancellation_policy === 'full_refund'} onChange={() => setForm(f => ({ ...f, cancellation_policy: 'full_refund' }))} />
            <span style={{ fontSize: 14 }}>Повний повернення в будь-який час</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="radio" name={`cancel_${isNew ? 'new' : plan?.id}`} checked={form.cancellation_policy === 'flexible'} onChange={() => setForm(f => ({ ...f, cancellation_policy: 'flexible' }))} />
            <span style={{ fontSize: 14 }}>Гнучке (Flexible)</span>
          </label>
        </div>
      </div>

      {/* Payments */}
      <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 24 }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Графік платежів</h4>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, display: 'block', lineHeight: 1.5 }}>
          Гостям дозволяється оплатити вартість номера до 3 частин. У міру наближення крайнього терміну Hostex відправить гостю повідомлення.
        </span>
        <div style={{ background: 'var(--surface-secondary)', padding: '16px', borderRadius: 8, fontSize: 14, border: '1px solid var(--border-primary)' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#e2e8f0', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-primary)' }}>
              <strong style={{ color: '#0f172a' }}>100</strong>
              <span style={{ color: '#475569' }}>%</span>
            </div>
            <span style={{ color: 'var(--text-secondary)' }}>підлягає оплаті при бронюванні</span>
          </div>
        </div>
      </div>

      

      {/* Stay restrictions */}
      <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 24 }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Час до бронювання</h4>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, display: 'block' }}>Кількість днів до дати заїзду, за які гості можуть забронювати.</span>
        <div className="form-group" style={{ maxWidth: 300 }}>
          <label className="form-label">Гості можуть бронювати за (мінімум днів)</label>
          <input className="form-input" type="number" min={0} value={form.min_days_before_checkin} onChange={e => setForm(f => ({ ...f, min_days_before_checkin: +e.target.value }))} />
        </div>
        {form.min_days_before_checkin === 0 && (
          <div className="form-group" style={{ maxWidth: 300, marginTop: 12 }}>
            <label className="form-label">Гості можуть бронювати в той же день до (година)</label>
            <select className="form-input" value={form.same_day_cutoff_hour === null ? '' : form.same_day_cutoff_hour} onChange={e => setForm(f => ({ ...f, same_day_cutoff_hour: e.target.value === '' ? null : +e.target.value }))}>
              <option value="">Не обмежено</option>
              {Array.from({ length: 24 }).map((_, i) => (
                <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
        )}

        <h4 style={{ margin: '32px 0 12px 0', fontSize: 16 }}>Тривалість поїздки</h4>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, display: 'block' }}>Максимальна та мінімальна кількість днів, які гості можуть забронювати.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14 }}>Тривалість перебування має бути між</span>
          <input className="form-input" style={{ width: 80, padding: '6px 10px' }} type="number" min={1} value={form.min_stay} onChange={e => setForm(f => ({ ...f, min_stay: +e.target.value }))} />
          <span style={{ fontSize: 14 }}>і</span>
          <input className="form-input" style={{ width: 80, padding: '6px 10px' }} type="number" min={1} value={form.max_stay} onChange={e => setForm(f => ({ ...f, max_stay: +e.target.value }))} />
          <span style={{ fontSize: 14 }}>днів</span>
        </div>
      </div>

      
      {/* Valid Weekdays */}
      <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 24 }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Діє лише в ці дні тижня</h4>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, display: 'block' }}>Якщо юзер обере інші дні, цей тариф не буде застосовано.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'mon', label: 'Пн' }, { id: 'tue', label: 'Вт' }, { id: 'wed', label: 'Ср' },
            { id: 'thu', label: 'Чт' }, { id: 'fri', label: 'Пт' }, { id: 'sat', label: 'Сб' }, { id: 'sun', label: 'Нд' }
          ].map(day => (
            <button
              key={day.id}
              onClick={() => {
                const isValid = form.valid_weekdays.includes(day.id);
                if (isValid) {
                  setForm(f => ({ ...f, valid_weekdays: f.valid_weekdays.filter(d => d !== day.id) }));
                } else {
                  setForm(f => ({ ...f, valid_weekdays: [...f.valid_weekdays, day.id] }));
                }
              }}
              style={{
                width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--border-primary)',
                background: form.valid_weekdays.includes(day.id) ? 'var(--accent-primary)' : 'transparent',
                color: form.valid_weekdays.includes(day.id) ? '#fff' : 'var(--text-primary)',
                fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              type="button"
            >
              {day.label}
            </button>
          ))}
          <button 
            type="button"
            className="btn btn-ghost" 
            style={{ marginLeft: 8, color: 'var(--text-secondary)' }}
            onClick={() => setForm(f => ({ ...f, valid_weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }))}
          >
            скинути
          </button>
        </div>
      </div>


      {/* Pricing Mode */}
      <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 24 }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Режим ціноутворення</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: 16, border: '1px solid var(--border-primary)', borderRadius: 8, background: form.pricing_mode === 'independent' ? 'var(--surface-secondary)' : 'transparent' }}>
            <input type="radio" name={`pricing_${isNew ? 'new' : plan?.id}`} value="independent" checked={form.pricing_mode === 'independent'} onChange={() => setForm(f => ({ ...f, pricing_mode: 'independent' }))} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Установіть ціни незалежно для цього тарифного плану.</div>
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: 16, border: '1px solid var(--border-primary)', borderRadius: 8, background: form.pricing_mode === 'dependent' ? 'var(--surface-secondary)' : 'transparent' }}>
            <input type="radio" name={`pricing_${isNew ? 'new' : plan?.id}`} value="dependent" checked={form.pricing_mode === 'dependent'} onChange={() => setForm(f => ({ ...f, pricing_mode: 'dependent' }))} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Ціна цього тарифного плану залежить від цін інших тарифних планів.</div>
              {form.pricing_mode === 'dependent' && (
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14 }}>Ціна становить</span>
                  <input type="number" min="0" max="100" className="form-input" style={{ width: 80, padding: '6px 10px' }} value={form.pricing_modifier_percent} onChange={e => setForm(f => ({ ...f, pricing_modifier_percent: +e.target.value }))} />
                  <span style={{ fontSize: 14 }}>%</span>
                  <select className="form-input" style={{ width: 100, padding: '6px 10px' }} value={form.pricing_modifier_type} onChange={e => setForm(f => ({ ...f, pricing_modifier_type: e.target.value }))}>
                    <option value="less">менше</option>
                    <option value="more">більше</option>
                  </select>
                  <span style={{ fontSize: 14 }}>ніж</span>
                  <select className="form-input" style={{ width: 200, padding: '6px 10px' }} value={form.derived_from_plan_id} onChange={e => setForm(f => ({ ...f, derived_from_plan_id: e.target.value }))}>
                    <option value="" disabled>Оберіть тарифний план</option>
                    {[...allPlans.filter(p => p.id !== plan?.id)]
                      .sort((a, b) => (b.is_default ?? 0) - (a.is_default ?? 0))
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.is_default ? ' (стандарт)' : ''}
                        </option>
                      ))}
                  </select>

                </div>
              )}
            </div>
          </label>
        </div>
      </div>

      {/* Applied Listings */}
      {listings.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 24 }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Застосовані оголошення</h4>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, display: 'block' }}>Після вибору гості побачать цей тарифний план при бронюванні.</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {listings.map(l => (
              <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 14, background: 'var(--surface-secondary)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-primary)' }}>
                <input type="checkbox" checked={form.applied_listings.includes(l.id)} onChange={e => {
                  if (e.target.checked) setForm(f => ({ ...f, applied_listings: [...f.applied_listings, l.id] }));
                  else setForm(f => ({ ...f, applied_listings: f.applied_listings.filter(id => id !== l.id) }));
                }} />
                {l.unit_type_name || l.unit_name || l.unit_code}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Name */}
      <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 24 }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Назва тарифного плану</h4>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, display: 'block' }}>Це ім&apos;я буде показано гостям, постарайтесь обрати привабливе.</span>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input className="form-input" style={{ fontSize: 16, padding: '12px 16px' }} placeholder="Standart price" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
      </div>

      {/* Default */}
      <div style={{ paddingTop: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
          <span style={{ fontSize: 14, fontWeight: 500 }}>Встановити як тариф за замовчуванням</span>
        </label>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16, paddingTop: 24, borderTop: '1px solid var(--border-primary)' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', fontSize: 14 }}>
          {saving ? <Loader2 size={16} className="spin" /> : 'Зберегти'}
        </button>
        {!isNew && (
          <button className="btn btn-ghost" style={{ color: '#ef4444', padding: '10px 24px', fontSize: 14 }} onClick={handleDelete}>
            Видалити
          </button>
        )}
      </div>

    </div>
  );
}
