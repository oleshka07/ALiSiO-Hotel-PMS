'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import CategoryModal, { CategoryFormValues } from './CategoryModal';
import CategoryTreeRow from './CategoryTreeRow';

export type OpType = 'income' | 'expense' | 'transfer' | 'other';
export type Classifier = 
  | 'cogs' | 'variable' | 'operational' | 'capex' | 'tax' | 'financing'
  | 'accommodation_revenue' | 'service_revenue' | 'other_operating_revenue' | 'financial_revenue' | 'non_operating_revenue'
  | 'other';

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  op_type: OpType;
  classifier: Classifier;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: number;
}

export interface CategoryNode extends Category {
  children: Category[];
}

interface TreeResponse {
  tree: CategoryNode[];
  byOpType: Record<OpType, CategoryNode[]>;
}

const OP_TYPE_TABS: { id: OpType; label: string; emoji: string }[] = [
  { id: 'income', label: 'Доходи', emoji: '⬆️' },
  { id: 'expense', label: 'Витрати', emoji: '⬇️' },
  { id: 'transfer', label: 'Перекази', emoji: '⇄' },
];

export default function CategoriesTab() {
  const [data, setData] = useState<TreeResponse>({ tree: [], byOpType: { income: [], expense: [], transfer: [], other: [] } });
  const [loading, setLoading] = useState(true);
  const [opTypeTab, setOpTypeTab] = useState<OpType>('expense');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Category | { parent: Category | null; op_type?: OpType } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/categories/tree');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('Failed to load category tree', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const nodes = data.byOpType[opTypeTab] || [];

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return nodes;
    const needle = search.trim().toLowerCase();
    return nodes
      .map((node) => {
        const matchRoot = node.name.toLowerCase().includes(needle);
        const matchingChildren = node.children.filter((c) => c.name.toLowerCase().includes(needle));
        if (matchRoot || matchingChildren.length > 0) {
          return { ...node, children: matchRoot ? node.children : matchingChildren };
        }
        return null;
      })
      .filter((n): n is CategoryNode => n !== null);
  }, [nodes, search]);

  async function handleSave(values: CategoryFormValues, existingId?: string) {
    const method = existingId ? 'PATCH' : 'POST';
    const url = existingId ? `/api/finance/categories/${existingId}` : '/api/finance/categories';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Помилка збереження');
    }
    setEditing(null);
    fetchTree();
  }

  async function handleDelete(category: Category) {
    if (!confirm(`Видалити категорію «${category.name}»?`)) return;
    const res = await fetch(`/api/finance/categories/${category.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Не вдалося видалити');
      return;
    }
    fetchTree();
  }

  async function handleArchiveToggle(category: Category) {
    const willArchive = category.is_active === 1;
    const verb = willArchive ? 'Архівувати' : 'Відновити';
    if (!confirm(`${verb} «${category.name}»?`)) return;
    const res = await fetch(`/api/finance/categories/${category.id}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: willArchive }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Не вдалося');
      return;
    }
    fetchTree();
  }

  async function handleMove(draggedId: string, targetParentId: string | null, targetSortOrder?: number) {
    const res = await fetch(`/api/finance/categories/${draggedId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: targetParentId, sort_order: targetSortOrder }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Не вдалося перемістити');
      return;
    }
    fetchTree();
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Категорії</h2>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {nodes.length} кореневих у «{OP_TYPE_TABS.find((t) => t.id === opTypeTab)?.label}»
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setEditing({ parent: null, op_type: opTypeTab })}
          style={addBtnStyle}
        >
          <Plus size={16} /> Додати категорію
        </button>
      </div>

      <div style={tabsStripStyle}>
        {OP_TYPE_TABS.map((t) => {
          const isActive = opTypeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setOpTypeTab(t.id)}
              style={{
                ...tabBtnStyle,
                background: isActive ? 'var(--bg-primary)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <span>{t.emoji}</span>
              <span>{t.label}</span>
              <span
                style={{
                  marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                }}
              >
                {(data.byOpType[t.id] || []).length}
              </span>
            </button>
          );
        })}
      </div>

      <input
        type="text"
        placeholder="Пошук категорії..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={searchStyle}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження…</div>
      ) : filteredNodes.length === 0 ? (
        <div style={emptyStyle}>
          {search ? 'Нічого не знайдено.' : 'Категорій ще немає. Натисніть «Додати категорію».'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          {filteredNodes.map((root) => {
            const isCollapsed = collapsed.has(root.id);
            return (
              <div key={root.id}>
                <CategoryTreeRow
                  category={root}
                  isRoot
                  depth={0}
                  expandedIcon={
                    root.children.length > 0 ? (
                      <button
                        onClick={() => toggleCollapse(root.id)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-secondary)' }}
                        aria-label={isCollapsed ? 'Розгорнути' : 'Згорнути'}
                      >
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </button>
                    ) : null
                  }
                  onEdit={() => setEditing(root)}
                  onAddChild={() => setEditing({ parent: root })}
                  onArchiveToggle={() => handleArchiveToggle(root)}
                  onDelete={() => handleDelete(root)}
                  onMove={handleMove}
                />
                {!isCollapsed && root.children.map((child) => (
                  <CategoryTreeRow
                    key={child.id}
                    category={child}
                    isRoot={false}
                    depth={1}
                    onEdit={() => setEditing(child)}
                    onArchiveToggle={() => handleArchiveToggle(child)}
                    onDelete={() => handleDelete(child)}
                    onMove={handleMove}
                    parentId={root.id}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <CategoryModal
          initial={'id' in editing ? editing : undefined}
          parent={'parent' in editing ? editing.parent : ('parent_id' in editing && editing.parent_id
            ? nodes.find((n) => n.id === editing.parent_id) || null
            : null)}
          defaultOpType={'op_type' in editing ? editing.op_type as OpType : undefined}
          onClose={() => setEditing(null)}
          onSave={(vals) => handleSave(vals, 'id' in editing ? editing.id : undefined)}
        />
      )}
    </div>
  );
}

const addBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  background: 'var(--accent, #6366f1)', color: '#fff', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
};

const tabsStripStyle: React.CSSProperties = {
  display: 'flex', gap: 4, padding: 3, background: 'var(--bg-secondary)',
  borderRadius: 10, border: '1px solid var(--border-primary)',
  marginBottom: 12, width: 'fit-content',
};

const tabBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
  border: 'none', fontSize: 13, cursor: 'pointer', borderRadius: 8,
  transition: 'all 0.15s',
};

const searchStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border-primary)',
  borderRadius: 8, fontSize: 14, background: 'var(--bg-primary)',
  color: 'var(--text-primary)', marginBottom: 16,
};

const emptyStyle: React.CSSProperties = {
  padding: 40, textAlign: 'center', color: 'var(--text-secondary)',
  border: '1px dashed var(--border-primary)', borderRadius: 10,
};
