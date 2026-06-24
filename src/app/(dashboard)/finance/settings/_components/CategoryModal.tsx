'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Category, CategoryNode, Classifier, OpType } from './CategoriesTab';

export interface CategoryFormValues {
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  op_type?: OpType;
  classifier?: Classifier;
  parent_id?: string | null;
}

interface Props {
  initial?: Category;
  parent: CategoryNode | Category | null;
  defaultOpType?: OpType;
  onClose: () => void;
  onSave: (values: CategoryFormValues) => Promise<void>;
}

const OP_TYPE_OPTIONS: { value: OpType; label: string }[] = [
  { value: 'income', label: 'Дохід' },
  { value: 'expense', label: 'Витрата' },
  { value: 'transfer', label: 'Переказ' },
];

const EXPENSE_CLASSIFIERS: { value: Classifier; label: string; hint: string }[] = [
  { value: 'cogs',        label: 'Собівартість (COGS)', hint: 'Прямі витрати на виробництво доходу' },
  { value: 'variable',    label: 'Змінні витрати',              hint: 'Коливаються з об’ємом діяльності' },
  { value: 'operational', label: 'Операційні витрати',          hint: 'Постійні витрати на ведення бізнесу' },
  { value: 'capex',       label: 'Капітальні (CapEx)',  hint: 'Основні засоби, амортизовані' },
  { value: 'tax',         label: 'Податки',             hint: 'ПДВ, податок на прибуток тощо' },
  { value: 'financing',   label: 'Фінансові витрати',           hint: 'Кредити, інвестиції, відсотки' },
  { value: 'other',       label: 'Інші витрати',                hint: 'Жодне з вище перерахованих' },
];

const INCOME_CLASSIFIERS: { value: Classifier; label: string; hint: string }[] = [
  { value: 'accommodation_revenue',   label: 'Дохід від проживання',  hint: 'Надходження від здачі номерів' },
  { value: 'service_revenue',         label: 'Дохід від послуг',      hint: 'Додаткові послуги (їжа, спа, тощо)' },
  { value: 'other_operating_revenue', label: 'Інший опер. дохід',     hint: 'Штрафи, скасування, інша діяльність' },
  { value: 'financial_revenue',       label: 'Фінансовий дохід',      hint: 'Курсові різниці, відсотки на залишок' },
  { value: 'non_operating_revenue',   label: 'Позаопераційний дохід', hint: 'Продаж активів, інші непрямі доходи' },
  { value: 'other',                   label: 'Інше',                  hint: 'Інші види доходу' },
];

const DEFAULT_CLASSIFIERS: { value: Classifier; label: string; hint: string }[] = [
  { value: 'other', label: 'Інше', hint: 'Інше' }
];

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#0ea5e9', '#64748b', '#dc2626', '#059669', '#94a3b8'];
const ICONS = ['📋', '🏠', '🍽️', '🧖', '🍳', '💰', '🥘', '🛒', '📦', '🏢', '🔌', '👥', '📢', '💼', '🧹', '🏛️', '🏗️', '🏦', '↔️', '⚖️', '💳', '🎯', '📊', '✨'];

export default function CategoryModal({ initial, parent, defaultOpType, onClose, onSave }: Props) {
  const isSubcategory = !!parent;
  const inheritedOpType = parent?.op_type;
  const inheritedClassifier = parent?.classifier;

  const [name, setName] = useState(initial?.name || '');
  const [icon, setIcon] = useState(initial?.icon || (isSubcategory ? parent?.icon || '📋' : '📋'));
  const [color, setColor] = useState(initial?.color || (isSubcategory ? parent?.color || '#6366f1' : '#6366f1'));
  const [opType, setOpType] = useState<OpType>(
    initial?.op_type || (inheritedOpType as OpType) || defaultOpType || 'expense'
  );
  const [classifier, setClassifier] = useState<Classifier>(
    initial?.classifier || (inheritedClassifier as Classifier) || 'operational'
  );
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditingSubcategory = initial && initial.parent_id !== null;

  const currentClassifiers = opType === 'income' ? INCOME_CLASSIFIERS : opType === 'expense' ? EXPENSE_CLASSIFIERS : DEFAULT_CLASSIFIERS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Введіть назву'); return; }

    setSaving(true);
    try {
      const values: CategoryFormValues = {
        name: name.trim(),
        icon,
        color,
        sort_order: Number(sortOrder) || 0,
      };
      if (!initial) {
        // Creating
        values.parent_id = parent ? parent.id : null;
        if (!parent) {
          values.op_type = opType;
          values.classifier = classifier;
        }
      } else if (!isEditingSubcategory) {
        // Editing root → allow changing op_type / classifier
        values.op_type = opType;
        values.classifier = classifier;
      }
      await onSave(values);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, flex: 1 }}>
            {initial
              ? (isEditingSubcategory ? 'Редагувати підкатегорію' : 'Редагувати категорію')
              : (parent ? `Нова підкатегорія в «${parent.name}»` : 'Нова категорія')}
          </h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}><X size={18} /></button>
        </div>

        <Field label="Назва">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            autoFocus
          />
        </Field>

        <Field label="Іконка">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: icon === i ? 'var(--accent, #6366f1)' : 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  cursor: 'pointer', fontSize: 18,
                }}
              >
                {i}
              </button>
            ))}
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="або emoji"
              style={{ ...inputStyle, width: 100, fontSize: 16 }}
              maxLength={4}
            />
          </div>
        </Field>

        <Field label="Колір">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: c,
                  border: color === c ? '3px solid var(--text-primary)' : '1px solid var(--border-primary)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Тип операції">
            <select
              value={opType}
              onChange={(e) => {
                const newType = e.target.value as OpType;
                setOpType(newType);
                if (newType === 'income') setClassifier('accommodation_revenue');
                else if (newType === 'expense') setClassifier('operational');
                else setClassifier('other');
              }}
              style={inputStyle}
              disabled={isSubcategory || isEditingSubcategory}
            >
              {OP_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {(isSubcategory || isEditingSubcategory) && (
              <div style={hintStyle}>Успадковано від батька</div>
            )}
          </Field>
          <Field label="Класифікатор">
            <select
              value={classifier}
              onChange={(e) => setClassifier(e.target.value as Classifier)}
              style={inputStyle}
              disabled={isSubcategory || isEditingSubcategory}
            >
              {currentClassifiers.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {!(isSubcategory || isEditingSubcategory) && (
              <div style={hintStyle}>{currentClassifiers.find((o) => o.value === classifier)?.hint}</div>
            )}
            {(isSubcategory || isEditingSubcategory) && (
              <div style={hintStyle}>Успадковано від батька</div>
            )}
          </Field>
        </div>

        <Field label="Порядок сортування">
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            style={inputStyle}
          />
        </Field>

        {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={onClose} style={btnSecondaryStyle}>Відміна</button>
          <button type="submit" disabled={saving} style={btnPrimaryStyle}>
            {saving ? 'Збереження…' : (initial ? 'Зберегти' : 'Створити')}
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

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const modalStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto',
  border: '1px solid var(--border-primary)',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border-primary)',
  borderRadius: 8, fontSize: 14, background: 'var(--bg-primary)', color: 'var(--text-primary)',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4,
};
const btnPrimaryStyle: React.CSSProperties = {
  padding: '9px 18px', background: 'var(--accent, #6366f1)', color: '#fff',
  border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
};
const btnSecondaryStyle: React.CSSProperties = {
  padding: '9px 18px', background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border-primary)', borderRadius: 8, cursor: 'pointer',
};
const hintStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-secondary)', marginTop: 4,
};
