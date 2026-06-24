'use client';

import { useState } from 'react';
import { GripVertical, Pencil, Archive, RotateCcw, Trash2, Plus } from 'lucide-react';
import type { Category, Classifier, OpType } from './CategoriesTab';

interface Props {
  category: Category;
  isRoot: boolean;
  depth: number;
  expandedIcon?: React.ReactNode;
  parentId?: string;
  onEdit: () => void;
  onAddChild?: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  onMove: (draggedId: string, targetParentId: string | null, targetSortOrder?: number) => void;
}

const CLASSIFIER_LABELS: Record<Classifier, string> = {
  cogs: 'Собівартість',
  variable: 'Змінні',
  operational: 'Операційні',
  capex: 'Капекс',
  tax: 'Податки',
  financing: 'Фінансові',
  accommodation_revenue: 'Дохід від проживання',
  service_revenue: 'Дохід від послуг',
  other_operating_revenue: 'Інший опер. дохід',
  financial_revenue: 'Фінансовий дохід',
  non_operating_revenue: 'Позаопераційний дохід',
  other: 'Інше',
};

const OP_TYPE_LABELS: Record<OpType, string> = {
  income: 'Дохід',
  expense: 'Витрата',
  transfer: 'Переказ',
  other: 'Інше',
};

export default function CategoryTreeRow({
  category,
  isRoot,
  depth,
  expandedIcon,
  parentId,
  onEdit,
  onAddChild,
  onArchiveToggle,
  onDelete,
  onMove,
}: Props) {
  const [dragOver, setDragOver] = useState<'above' | 'below' | 'onto' | null>(null);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: category.id,
      isRoot,
      parentId: parentId || null,
      op_type: category.op_type,
    }));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = y / rect.height;
    if (isRoot && ratio > 0.25 && ratio < 0.75) {
      setDragOver('onto');
    } else if (ratio < 0.5) {
      setDragOver('above');
    } else {
      setDragOver('below');
    }
  }

  function handleDragLeave() {
    setDragOver(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const payload = e.dataTransfer.getData('text/plain');
    if (!payload) { setDragOver(null); return; }
    let data: { id: string; isRoot: boolean; parentId: string | null; op_type: OpType };
    try { data = JSON.parse(payload); } catch { setDragOver(null); return; }
    if (data.id === category.id) { setDragOver(null); return; }
    if (data.op_type !== category.op_type) {
      alert('Не можна переміщувати між різними типами (Дохід/Витрата/Переказ).');
      setDragOver(null);
      return;
    }

    if (dragOver === 'onto' && isRoot) {
      // Drop onto a root → becomes a child of this root
      onMove(data.id, category.id);
    } else if (dragOver === 'above') {
      // Drop above this row → becomes sibling of this row before it
      onMove(data.id, isRoot ? null : (parentId || null), Math.max(0, category.sort_order - 1));
    } else if (dragOver === 'below') {
      onMove(data.id, isRoot ? null : (parentId || null), category.sort_order + 1);
    }
    setDragOver(null);
  }

  const dragOverStyle: React.CSSProperties =
    dragOver === 'above' ? { borderTop: '2px solid var(--accent, #6366f1)' } :
    dragOver === 'below' ? { borderBottom: '2px solid var(--accent, #6366f1)' } :
    dragOver === 'onto' ? { background: 'rgba(99,102,241,0.12)' } : {};

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        paddingLeft: 12 + depth * 28,
        borderTop: depth === 0 ? 'none' : '1px solid var(--border-primary)',
        background: depth === 0 ? 'var(--bg-secondary)' : 'transparent',
        opacity: category.is_active ? 1 : 0.5,
        transition: 'background 0.1s',
        ...dragOverStyle,
      }}
    >
      <GripVertical size={14} style={{ color: 'var(--text-secondary)', cursor: 'grab', flexShrink: 0 }} />
      {expandedIcon !== undefined ? expandedIcon : <span style={{ width: 20 }} />}

      <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{category.icon || '📋'}</span>

      <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: 2,
        background: category.color || '#6b7280', flexShrink: 0,
      }} />

      <span style={{ fontWeight: isRoot ? 600 : 400, flex: 1, minWidth: 0 }}>
        {category.name}
        {!category.is_active && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 6 }}>(архів)</span>
        )}
      </span>

      {isRoot && (
        <>
          <Badge>{OP_TYPE_LABELS[category.op_type]}</Badge>
          <Badge>{CLASSIFIER_LABELS[category.classifier]}</Badge>
        </>
      )}

      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {isRoot && onAddChild && (
          <button
            onClick={onAddChild}
            style={{ ...iconBtnStyle, color: 'var(--accent, #6366f1)' }}
            title="Додати підкатегорію"
          >
            <Plus size={15} />
          </button>
        )}
        <button onClick={onEdit} style={iconBtnStyle} title="Редагувати"><Pencil size={14} /></button>
        <button onClick={onArchiveToggle} style={iconBtnStyle} title={category.is_active ? 'Архівувати' : 'Відновити'}>
          {category.is_active ? <Archive size={14} /> : <RotateCcw size={14} />}
        </button>
        <button onClick={onDelete} style={{ ...iconBtnStyle, color: '#dc2626' }} title="Видалити"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 4,
        background: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', padding: 6, cursor: 'pointer',
  color: 'var(--text-secondary)', borderRadius: 6,
};
