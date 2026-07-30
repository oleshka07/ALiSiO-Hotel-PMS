'use client';

import { useState } from 'react';
import { X, Check, Edit3, Folder, User, Tag, Layers, Clock } from 'lucide-react';

interface OptionItem {
  id: string;
  name: string;
  icon?: string | null;
}

interface TagItem {
  id: string;
  name: string;
  color?: string;
}

interface Props {
  selectedCount: number;
  categories: OptionItem[];
  projects: OptionItem[];
  counterparties: OptionItem[];
  tags: TagItem[];
  onClose: () => void;
  onApply: (payload: {
    category_id?: string | null;
    project_id?: string | null;
    counterparty_id?: string | null;
    status?: string;
    tag_ids?: string[];
  }) => Promise<void>;
}

export default function BulkEditModal({
  selectedCount,
  categories,
  projects,
  counterparties,
  tags,
  onClose,
  onApply,
}: Props) {
  const [changeCategory, setChangeCategory] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [changeProject, setChangeProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [changeCounterparty, setChangeCounterparty] = useState(false);
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState<string | null>(null);

  const [changeStatus, setChangeStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('completed');

  const [changeTags, setChangeTags] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (!changeCategory && !changeProject && !changeCounterparty && !changeStatus && !changeTags) {
      alert('Будь ласка, виберіть хоча б один параметр для зміни');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: {
        category_id?: string | null;
        project_id?: string | null;
        counterparty_id?: string | null;
        status?: string;
        tag_ids?: string[];
      } = {};

      if (changeCategory) payload.category_id = selectedCategoryId;
      if (changeProject) payload.project_id = selectedProjectId;
      if (changeCounterparty) payload.counterparty_id = selectedCounterpartyId;
      if (changeStatus) payload.status = selectedStatus;
      if (changeTags) payload.tag_ids = selectedTagIds;

      await onApply(payload);
      onClose();
    } catch (err: any) {
      alert('Помилка оновлення: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 520,
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(99,102,241,0.15)',
                color: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Edit3 size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Групове редагування</h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                Зміна параметрів для {selectedCount} вибраних операцій
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Category */}
          <div
            style={{
              border: changeCategory ? '1px solid #6366f1' : '1px solid var(--border-primary)',
              borderRadius: 8,
              padding: 12,
              background: changeCategory ? 'rgba(99,102,241,0.03)' : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 13,
                marginBottom: changeCategory ? 10 : 0,
              }}
            >
              <input
                type="checkbox"
                checked={changeCategory}
                onChange={(e) => setChangeCategory(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <Folder size={15} color="#6366f1" />
              <span>Змінити категорію</span>
            </label>
            {changeCategory && (
              <select
                value={selectedCategoryId || ''}
                onChange={(e) => setSelectedCategoryId(e.target.value ? e.target.value : null)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-primary)',
                  fontSize: 13,
                }}
              >
                <option value="">— Очистити категорію (без категорії) —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon ? `${c.icon} ` : ''}{c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Counterparty */}
          <div
            style={{
              border: changeCounterparty ? '1px solid #6366f1' : '1px solid var(--border-primary)',
              borderRadius: 8,
              padding: 12,
              background: changeCounterparty ? 'rgba(99,102,241,0.03)' : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 13,
                marginBottom: changeCounterparty ? 10 : 0,
              }}
            >
              <input
                type="checkbox"
                checked={changeCounterparty}
                onChange={(e) => setChangeCounterparty(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <User size={15} color="#3b82f6" />
              <span>Змінити контрагента</span>
            </label>
            {changeCounterparty && (
              <select
                value={selectedCounterpartyId || ''}
                onChange={(e) => setSelectedCounterpartyId(e.target.value ? e.target.value : null)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-primary)',
                  fontSize: 13,
                }}
              >
                <option value="">— Очистити контрагента (без контрагента) —</option>
                {counterparties.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Project */}
          <div
            style={{
              border: changeProject ? '1px solid #6366f1' : '1px solid var(--border-primary)',
              borderRadius: 8,
              padding: 12,
              background: changeProject ? 'rgba(99,102,241,0.03)' : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 13,
                marginBottom: changeProject ? 10 : 0,
              }}
            >
              <input
                type="checkbox"
                checked={changeProject}
                onChange={(e) => setChangeProject(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <Layers size={15} color="#ec4899" />
              <span>Змінити проєкт</span>
            </label>
            {changeProject && (
              <select
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(e.target.value ? e.target.value : null)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-primary)',
                  fontSize: 13,
                }}
              >
                <option value="">— Очистити проєкт (без проєкту) —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Status */}
          <div
            style={{
              border: changeStatus ? '1px solid #6366f1' : '1px solid var(--border-primary)',
              borderRadius: 8,
              padding: 12,
              background: changeStatus ? 'rgba(99,102,241,0.03)' : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 13,
                marginBottom: changeStatus ? 10 : 0,
              }}
            >
              <input
                type="checkbox"
                checked={changeStatus}
                onChange={(e) => setChangeStatus(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <Clock size={15} color="#f59e0b" />
              <span>Змінити статус</span>
            </label>
            {changeStatus && (
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-primary)',
                  fontSize: 13,
                }}
              >
                <option value="completed">Виконано (completed)</option>
                <option value="pending">Очікується (pending)</option>
              </select>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div
              style={{
                border: changeTags ? '1px solid #6366f1' : '1px solid var(--border-primary)',
                borderRadius: 8,
                padding: 12,
                background: changeTags ? 'rgba(99,102,241,0.03)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: 13,
                  marginBottom: changeTags ? 10 : 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={changeTags}
                  onChange={(e) => setChangeTags(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <Tag size={15} color="#10b981" />
                <span>Задати теги</span>
              </label>
              {changeTags && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {tags.map((t) => {
                    const active = selectedTagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          border: active ? '1px solid #10b981' : '1px solid var(--border-primary)',
                          background: active ? 'rgba(16,185,129,0.15)' : 'var(--bg-secondary)',
                          color: active ? '#10b981' : 'var(--text-primary)',
                        }}
                      >
                        {active ? '✓ ' : ''}{t.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-primary)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid var(--border-primary)',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              border: 'none',
              background: '#6366f1',
              color: '#fff',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              opacity: isSubmitting ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Check size={16} />
            {isSubmitting ? 'Застосування…' : `Застосувати до ${selectedCount} операцій`}
          </button>
        </div>
      </div>
    </div>
  );
}
