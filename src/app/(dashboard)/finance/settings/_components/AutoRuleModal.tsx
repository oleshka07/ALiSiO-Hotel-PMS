'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { AutoRule } from './AutoRulesTab';

export interface AutoRuleFormValues {
  name: string;
  op_type: 'income' | 'expense' | 'any';
  conditions: Array<{ field: string; op: string; value: any }>;
  actions: {
    set_category_id?: string | null;
    set_project_id?: string | null;
    set_counterparty_id?: string | null;
    auto_match_counterparty?: boolean;
    add_tag_ids?: string[];
    set_comment?: string;
  };
  is_active: boolean;
  stop_on_match: boolean;
}

interface Props {
  initial?: AutoRule;
  onClose: () => void;
  onSave: (v: AutoRuleFormValues) => Promise<void>;
}

const FIELD_OPTIONS = [
  { value: 'comment', label: 'Коментар', numeric: false },
  { value: 'amount', label: 'Сума (рахунок)', numeric: true },
  { value: 'amount_company', label: 'Сума (CZK)', numeric: true },
  { value: 'account_from_id', label: 'З рахунку', numeric: false, isId: true },
  { value: 'account_to_id', label: 'На рахунок', numeric: false, isId: true },
  { value: 'currency', label: 'Валюта', numeric: false },
  { value: 'counterparty_id', label: 'Контрагент', numeric: false, isId: true },
];

const TEXT_OPS = [
  { value: 'contains', label: 'містить' },
  { value: 'not_contains', label: 'не містить' },
  { value: 'starts_with', label: 'починається з' },
  { value: 'ends_with', label: 'закінчується на' },
  { value: 'equals', label: 'дорівнює' },
  { value: 'not_equals', label: 'не дорівнює' },
];
const NUM_OPS = [
  { value: '=', label: '=' }, { value: '!=', label: '≠' },
  { value: '>', label: '>' }, { value: '>=', label: '≥' },
  { value: '<', label: '<' }, { value: '<=', label: '≤' },
  { value: 'between', label: 'між (a,b)' },
];

export default function AutoRuleModal({ initial, onClose, onSave }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [opType, setOpType] = useState<'income' | 'expense' | 'any'>(initial?.op_type || 'any');
  const [conditions, setConditions] = useState<any[]>(initial?.conditions?.length ? initial.conditions : [{ field: 'comment', op: 'contains', value: '' }]);
  const [actions, setActions] = useState<AutoRuleFormValues['actions']>(initial?.actions || {});
  const [isActive, setIsActive] = useState(initial ? !!initial.is_active : true);
  const [stopOnMatch, setStopOnMatch] = useState(initial ? !!initial.stop_on_match : false);

  const [categories, setCategories] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/finance/categories').then((r) => r.json()).catch(() => []),
      fetch('/api/finance/projects').then((r) => r.json()).catch(() => []),
      fetch('/api/finance/counterparties').then((r) => r.json()).catch(() => []),
      fetch('/api/finance/tags').then((r) => r.json()).catch(() => []),
      fetch('/api/finance/accounts').then((r) => r.json()).catch(() => []),
    ]).then(([cats, pjs, cps, tgs, accs]) => {
      setCategories(Array.isArray(cats) ? cats : []);
      setProjects(Array.isArray(pjs) ? pjs : []);
      setCounterparties(Array.isArray(cps) ? cps : []);
      setTags(Array.isArray(tgs) ? tgs : []);
      setAccounts(Array.isArray(accs) ? accs : []);
    });
  }, []);

  function updateCondition(idx: number, patch: Partial<any>) {
    setConditions((prev) => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }
  function removeCondition(idx: number) {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  }
  function addCondition() {
    setConditions((prev) => [...prev, { field: 'comment', op: 'contains', value: '' }]);
  }

  function toggleTag(tagId: string) {
    setActions((a) => {
      const cur = new Set(a.add_tag_ids || []);
      if (cur.has(tagId)) cur.delete(tagId); else cur.add(tagId);
      return { ...a, add_tag_ids: [...cur] };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Введіть назву'); return; }
    if (conditions.length === 0) { setError('Додайте хоча б одну умову'); return; }

    // Clean actions: remove empty keys
    const cleanActions: AutoRuleFormValues['actions'] = {};
    if (actions.set_category_id !== undefined && actions.set_category_id !== '') cleanActions.set_category_id = actions.set_category_id;
    if (actions.set_project_id !== undefined && actions.set_project_id !== '') cleanActions.set_project_id = actions.set_project_id;
    if (actions.auto_match_counterparty) {
      cleanActions.auto_match_counterparty = true;
    } else if (actions.set_counterparty_id) {
      cleanActions.set_counterparty_id = actions.set_counterparty_id;
    }
    if (actions.add_tag_ids && actions.add_tag_ids.length > 0) cleanActions.add_tag_ids = actions.add_tag_ids;
    if (actions.set_comment) cleanActions.set_comment = actions.set_comment;

    if (Object.keys(cleanActions).length === 0) { setError('Додайте хоча б одну дію'); return; }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        op_type: opType,
        conditions,
        actions: cleanActions,
        is_active: isActive,
        stop_on_match: stopOnMatch,
      });
    } catch (err: any) { setError(err.message); setSaving(false); }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, flex: 1 }}>{initial ? 'Редагувати правило' : 'Нове правило'}</h3>
          <button type="button" onClick={onClose} style={closeBtn}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <Field label="Назва правила">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={input} autoFocus placeholder="Напр. Facebook → Маркетинг" />
          </Field>
          <Field label="Тип операції">
            <select value={opType} onChange={(e) => setOpType(e.target.value as any)} style={input}>
              <option value="any">Будь-який</option>
              <option value="income">Дохід</option>
              <option value="expense">Витрата</option>
            </select>
          </Field>
        </div>

        {/* Conditions */}
        <div style={sectionHeader}>Умови (усі мають спрацювати)</div>
        {conditions.map((c, idx) => {
          const fieldDef = FIELD_OPTIONS.find((f) => f.value === c.field);
          const opList = fieldDef?.numeric ? NUM_OPS : TEXT_OPS;
          return (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 30px', gap: 6, marginBottom: 6 }}>
              <select value={c.field} onChange={(e) => updateCondition(idx, { field: e.target.value })} style={input}>
                {FIELD_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <select value={c.op} onChange={(e) => updateCondition(idx, { op: e.target.value })} style={input}>
                {opList.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {fieldDef?.isId && c.field === 'account_from_id' || c.field === 'account_to_id' ? (
                <select value={c.value || ''} onChange={(e) => updateCondition(idx, { value: e.target.value })} style={input}>
                  <option value="">—</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              ) : c.field === 'counterparty_id' ? (
                <select value={c.value || ''} onChange={(e) => updateCondition(idx, { value: e.target.value })} style={input}>
                  <option value="">—</option>
                  {counterparties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : c.op === 'between' ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <input type="number" placeholder="min" value={Array.isArray(c.value) ? c.value[0] ?? '' : ''}
                    onChange={(e) => updateCondition(idx, { value: [Number(e.target.value), Array.isArray(c.value) ? c.value[1] : 0] })} style={input} />
                  <input type="number" placeholder="max" value={Array.isArray(c.value) ? c.value[1] ?? '' : ''}
                    onChange={(e) => updateCondition(idx, { value: [Array.isArray(c.value) ? c.value[0] : 0, Number(e.target.value)] })} style={input} />
                </div>
              ) : (
                <input
                  type={fieldDef?.numeric ? 'number' : 'text'}
                  value={c.value ?? ''}
                  onChange={(e) => updateCondition(idx, { value: fieldDef?.numeric ? Number(e.target.value) : e.target.value })}
                  style={input} placeholder="Значення"
                />
              )}
              <button type="button" onClick={() => removeCondition(idx)} style={{ ...iconBtn, color: '#dc2626' }} title="Видалити умову">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        <button type="button" onClick={addCondition} style={{ ...btnSec, marginBottom: 12 }}>
          <Plus size={14} /> Додати умову
        </button>

        {/* Actions */}
        <div style={sectionHeader}>Дії</div>

        <CheckField label="Встановити категорію">
          <select
            value={actions.set_category_id || ''}
            onChange={(e) => setActions((a) => ({ ...a, set_category_id: e.target.value || undefined }))}
            style={input}
          >
            <option value="">— не робити —</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.icon || ''} {c.name}</option>)}
          </select>
        </CheckField>

        <CheckField label="Встановити проєкт">
          <select
            value={actions.set_project_id || ''}
            onChange={(e) => setActions((a) => ({ ...a, set_project_id: e.target.value || undefined }))}
            style={input}
          >
            <option value="">— не робити —</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </CheckField>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="radio"
                checked={!!actions.auto_match_counterparty}
                onChange={() => setActions((a) => ({ ...a, auto_match_counterparty: true, set_counterparty_id: undefined }))}
              />
              Автоматчинг контрагента (за aliases у коментарі)
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="radio"
                checked={!actions.auto_match_counterparty && !!actions.set_counterparty_id}
                onChange={() => setActions((a) => ({ ...a, auto_match_counterparty: false, set_counterparty_id: a.set_counterparty_id || counterparties[0]?.id || '' }))}
              />
              Вибрати контрагента вручну
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="radio"
                checked={!actions.auto_match_counterparty && !actions.set_counterparty_id}
                onChange={() => setActions((a) => ({ ...a, auto_match_counterparty: false, set_counterparty_id: undefined }))}
              />
              Не чіпати
            </label>
          </div>
          {!actions.auto_match_counterparty && actions.set_counterparty_id !== undefined && (
            <select
              value={actions.set_counterparty_id || ''}
              onChange={(e) => setActions((a) => ({ ...a, set_counterparty_id: e.target.value }))}
              style={input}
            >
              <option value="">—</option>
              {counterparties.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Додати теги</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((t: any) => {
              const on = (actions.add_tag_ids || []).includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  style={{
                    padding: '3px 10px', borderRadius: 12, fontSize: 12,
                    background: on ? t.color : 'var(--bg-secondary)',
                    color: on ? '#fff' : 'var(--text-primary)',
                    border: on ? `2px solid ${t.color}` : '1px solid var(--border-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {t.name}
                </button>
              );
            })}
            {tags.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Немає тегів — створіть у вкладці «Теги»</span>}
          </div>
        </div>

        <div style={{ marginBottom: 12, display: 'flex', gap: 18 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Активне
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={stopOnMatch} onChange={(e) => setStopOnMatch(e.target.checked)} />
            Зупинити наступні правила після спрацювання
          </label>
        </div>

        {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Відміна</button>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving ? 'Збереження…' : initial ? 'Зберегти' : 'Створити'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
function CheckField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
    {children}
  </div>;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const modalStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto',
  border: '1px solid var(--border-primary)',
};
const input: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border-primary)',
  borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)',
};
const closeBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 };
const btnPrimary: React.CSSProperties = { padding: '9px 18px', background: 'var(--accent, #6366f1)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const btnSecondary: React.CSSProperties = { padding: '9px 18px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, cursor: 'pointer' };
const btnSec: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
  background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-primary)',
  borderRadius: 6, cursor: 'pointer', fontSize: 12,
};
const sectionHeader: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
  marginTop: 16, marginBottom: 8,
  padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6,
};
const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', padding: 6, cursor: 'pointer',
  color: 'var(--text-secondary)', borderRadius: 6,
};
