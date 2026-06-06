'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, RefreshCw, Plus, X, Check, Calendar, Flag, Tag,
  User, FolderOpen, Loader2, Paperclip, Image, Trash2,
  CheckSquare, Clock, AlertTriangle, Send, Building2,
} from 'lucide-react';

/* ================================================================
   Types
   ================================================================ */
interface TaskTag { id: string; name: string; color: string; }

interface Task {
  id: string;
  project_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  due_time: string | null;
  assignee_id: string | null;
  created_by: string | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee_name?: string;
  creator_name?: string;
  project_name?: string;
  project_color?: string;
  tags?: TaskTag[];
  subtask_count?: number;
  subtask_done_count?: number;
  property_id?: string | null;
  property_name?: string | null;
}

interface TaskProject {
  id: string; name: string; color: string; icon: string;
  parent_id: string | null; task_count?: number;
}

interface AppUser { id: string; full_name: string; }
interface Property { id: string; name: string; }

/* ================================================================
   Constants
   ================================================================ */
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  todo:        { label: 'Нове',       color: '#6c7086', bg: 'rgba(108,112,134,0.15)' },
  in_progress: { label: 'В роботі',  color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  done:        { label: 'Готово',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  cancelled:   { label: 'Скасовано', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Низький',     color: '#6c7086' },
  normal: { label: 'Нормальний', color: '#3b82f6' },
  high:   { label: 'Високий',    color: '#f59e0b' },
  urgent: { label: 'Терміновий', color: '#ef4444' },
};

const DATE_CHIPS = [
  { key: 'all',      label: 'Всі' },
  { key: 'today',    label: 'Сьогодні' },
  { key: 'week',     label: 'Наст. 7 днів' },
  { key: 'overdue',  label: 'Прострочені' },
];

const STATUS_CHIPS = [
  { key: '',            label: 'Всі' },
  { key: 'todo',        label: 'Нові' },
  { key: 'in_progress', label: 'В роботі' },
  { key: 'done',        label: 'Готово' },
];

/* ================================================================
   Helpers
   ================================================================ */
function getDueInfo(dueDate: string | null): { text: string; color: string; bg: string } {
  if (!dueDate) return { text: '', color: '', bg: '' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `Прострочено`, color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
  if (diff === 0) return { text: 'Сьогодні', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  if (diff === 1) return { text: 'Завтра', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' };
  return { text: dueDate, color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)' };
}

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

/* ================================================================
   Task Detail Bottom Sheet
   ================================================================ */
function TaskSheet({
  task, projects, tags, users, properties, onClose, onUpdated, onDeleted, onSaved,
}: {
  task: Task;
  projects: TaskProject[];
  tags: TaskTag[];
  users: AppUser[];
  properties: Property[];
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || '',
    status: task.status,
    priority: task.priority,
    due_date: task.due_date || '',
    due_time: task.due_time || '',
    project_id: task.project_id || '',
    assignee_id: task.assignee_id || '',
    property_id: task.property_id || '',
  });
  const [taskTags, setTaskTags] = useState<string[]>(task.tags?.map(t => t.id) || []);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attachments, setAttachments] = useState<{ id: string; filename: string; url: string; content_type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch subtasks & attachments
  useEffect(() => {
    fetch(`/api/tasks?parent_id=${task.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setSubtasks(Array.isArray(d) ? d : d.tasks || []))
      .catch(() => {});
    fetch(`/api/tasks/${task.id}/attachments`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setAttachments(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [task.id]);

  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tag_ids: taskTags }),
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 1500);
    } catch { alert('Помилка збереження'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Видалити задачу?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      onDeleted();
      onClose();
    } catch { /* */ }
    setDeleting(false);
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSubtask.trim(), parent_id: task.id, project_id: task.project_id }),
      });
      setNewSubtask('');
      const res = await fetch(`/api/tasks?parent_id=${task.id}`);
      if (res.ok) { const d = await res.json(); setSubtasks(Array.isArray(d) ? d : d.tasks || []); }
      onUpdated();
    } catch { /* */ }
  };

  const toggleSubtask = async (id: string, status: string) => {
    const ns = status === 'done' ? 'todo' : 'done';
    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ns, completed_at: ns === 'done' ? new Date().toISOString() : null }),
      });
      setSubtasks(prev => prev.map(s => s.id === id ? { ...s, status: ns } : s));
      onUpdated();
    } catch { /* */ }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const fd = new FormData(); fd.append('file', files[i]);
      try {
        const res = await fetch(`/api/tasks/${task.id}/attachments`, { method: 'POST', body: fd });
        if (res.ok) { const att = await res.json(); setAttachments(prev => [att, ...prev]); }
        else { const err = await res.json().catch(() => ({ error: 'Помилка' })); alert(err.error || 'Помилка завантаження'); }
      } catch { alert('Помилка з\'єднання'); }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDeleteAttachment = async (attId: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/attachments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachment_id: attId }),
      });
      if (res.ok) { setAttachments(prev => prev.filter(a => a.id !== attId)); }
      else { alert('Не вдалося видалити файл'); }
    } catch { alert('Помилка з\'єднання'); }
  };

  const toggleTag = (tagId: string) => {
    const newTags = taskTags.includes(tagId)
      ? taskTags.filter(t => t !== tagId)
      : [...taskTags, tagId];
    setTaskTags(newTags);
  };

  const TAG_COLORS = ['#ef4444','#f59e0b','#22c55e','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#6366f1'];

  const handleCreateTag = async () => {
    if (!newTagName.trim() || creatingTag) return;
    setCreatingTag(true);
    try {
      const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
      const res = await fetch('/api/tasks/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color }),
      });
      if (res.ok) {
        const created = await res.json();
        toggleTag(created.id);
        setNewTagName('');
        // Refresh tags list in parent
        onUpdated();
      }
    } catch { /* */ }
    setCreatingTag(false);
  };

  /* Field row helper */
  const fieldRow = (icon: React.ReactNode, label: string, children: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110, fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
        {icon} {label}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );

  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet" style={{ maxHeight: '94dvh', display: 'flex', flexDirection: 'column' }}>
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2 style={{ fontSize: 17 }}>Задача</h2>
          <button className="m-header-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', WebkitOverflowScrolling: 'touch' }}>
          {/* Title */}
          <textarea
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Назва задачі..."
            rows={1}
            style={{
              width: '100%', fontSize: 18, fontWeight: 700, border: 'none', background: 'transparent',
              color: 'var(--text-primary)', resize: 'none', padding: '8px 0', outline: 'none',
              fontFamily: 'inherit', lineHeight: 1.3,
            }}
          />

          {/* Status toggles */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {Object.entries(STATUS_CFG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setForm(f => ({ ...f, status: key }))}
                style={{
                  padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: form.status === key ? cfg.color : cfg.bg,
                  color: form.status === key ? '#fff' : cfg.color,
                  transition: 'all 0.2s ease',
                }}
              >
                {cfg.label}
              </button>
            ))}
          </div>

          {/* Fields */}
          {fieldRow(<Flag size={14} />, 'Пріоритет',
            <select
              className="form-select"
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              style={{ fontSize: 13, padding: '6px 8px' }}
            >
              {Object.entries(PRIORITY_CFG).map(([k, c]) => (
                <option key={k} value={k}>{c.label}</option>
              ))}
            </select>
          )}
          {fieldRow(<Calendar size={14} />, 'Дедлайн',
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" className="form-input" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                style={{ flex: 1, fontSize: 13, padding: '6px 8px' }} />
              <input type="time" className="form-input" value={form.due_time}
                onChange={e => setForm(f => ({ ...f, due_time: e.target.value }))}
                style={{ width: 100, fontSize: 13, padding: '6px 8px' }} />
            </div>
          )}
          {fieldRow(<User size={14} />, 'Відповідальний',
            <select
              className="form-select"
              value={form.assignee_id}
              onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
              style={{ fontSize: 13, padding: '6px 8px' }}
            >
              <option value="">Не призначено</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          )}
          {fieldRow(<FolderOpen size={14} />, 'Проєкт',
            <select
              className="form-select"
              value={form.project_id}
              onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
              style={{ fontSize: 13, padding: '6px 8px' }}
            >
              <option value="">Inbox</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
            </select>
          )}
          {fieldRow(<Building2 size={14} />, "Об'єкт",
            <select
              className="form-select"
              value={form.property_id}
              onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}
              style={{ fontSize: 13, padding: '6px 8px' }}
            >
              <option value="">Не вибрано</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* Tags */}
          <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 8 }}>
              <Tag size={14} /> Теги
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {taskTags.map(tid => {
                const t = tags.find(tg => tg.id === tid);
                if (!t) return null;
                return (
                  <span key={t.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                    background: `${t.color}20`, color: t.color,
                  }}>
                    {t.name}
                    <X size={10} style={{ cursor: 'pointer' }} onClick={() => toggleTag(t.id)} />
                  </span>
                );
              })}
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                style={{
                  padding: '3px 10px', borderRadius: 12, border: '1px dashed var(--border-primary)',
                  background: 'transparent', fontSize: 11, color: 'var(--text-tertiary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                <Plus size={10} /> Тег
              </button>
            </div>
            {showTagPicker && (
              <>
              <div style={{
                display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8,
                padding: 8, borderRadius: 10, background: 'var(--bg-tertiary)',
              }}>
                {tags.filter(t => !taskTags.includes(t.id)).map(t => (
                  <button key={t.id} onClick={() => { toggleTag(t.id); setShowTagPicker(false); }}
                    style={{
                      padding: '4px 10px', borderRadius: 10, border: 'none', fontSize: 11,
                      background: `${t.color}20`, color: t.color, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {t.name}
                  </button>
                ))}
                {tags.filter(t => !taskTags.includes(t.id)).length === 0 && !newTagName.trim() && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Введіть назву нового тегу ↓</span>
                )}
              </div>
              {/* Inline tag creation */}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  className="form-input"
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateTag(); }}
                  placeholder="Новий тег..."
                  style={{ flex: 1, fontSize: 12, padding: '6px 10px', borderRadius: 8 }}
                />
                {newTagName.trim() && (
                  <button
                    onClick={handleCreateTag}
                    disabled={creatingTag}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: 'none',
                      background: 'var(--accent-primary)', color: '#fff',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {creatingTag ? <Loader2 size={12} className="animate-pulse" /> : <Plus size={12} />}
                    Створити
                  </button>
                )}
              </div>
              </>
            )}
          </div>

          {/* Description */}
          <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-primary)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 6 }}>Опис</div>
            <textarea
              className="form-input"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Додати опис..."
              rows={3}
              style={{ fontSize: 13, resize: 'vertical' }}
            />
          </div>

          {/* Attachments */}
          <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 8 }}>
              <Paperclip size={14} /> Фото та файли
              {attachments.length > 0 && <span style={{ marginLeft: 'auto' }}>{attachments.length}</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={handleUpload} />
            {attachments.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                {attachments.map(att => {
                  const isImg = att.content_type?.startsWith('image/');
                  return (
                    <div key={att.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-tertiary)', aspectRatio: '1' }}>
                      {isImg ? (
                        <img src={att.url} alt={att.filename}
                          onClick={() => setPreviewImage(att.url)}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 8 }}>
                          <Paperclip size={18} color="var(--text-tertiary)" />
                          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 4, textAlign: 'center', wordBreak: 'break-all' }}>{att.filename}</span>
                        </div>
                      )}
                      <button onClick={() => handleDeleteAttachment(att.id)}
                        style={{
                          position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                          borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
                border: '1px dashed var(--border-primary)', background: 'transparent',
                fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', width: '100%', justifyContent: 'center',
              }}
            >
              {uploading ? <Loader2 size={14} className="animate-pulse" /> : <Image size={14} />}
              {uploading ? 'Завантаження...' : 'Додати фото / файл'}
            </button>
          </div>

          {/* Subtasks */}
          <div style={{ padding: '12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 8 }}>
              <CheckSquare size={14} /> Підзадачі
              {subtasks.length > 0 && (
                <span style={{ marginLeft: 'auto' }}>
                  {subtasks.filter(s => s.status === 'done').length}/{subtasks.length}
                </span>
              )}
            </div>
            {subtasks.length > 0 && (
              <div style={{ height: 3, borderRadius: 2, background: 'var(--bg-tertiary)', marginBottom: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: '#22c55e',
                  width: `${(subtasks.filter(s => s.status === 'done').length / subtasks.length) * 100}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            )}
            {subtasks.map(st => (
              <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <button
                  onClick={() => toggleSubtask(st.id, st.status)}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                    border: st.status === 'done' ? 'none' : '2px solid var(--border-primary)',
                    background: st.status === 'done' ? '#22c55e' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {st.status === 'done' && <Check size={10} color="#fff" />}
                </button>
                <span style={{
                  fontSize: 13, color: st.status === 'done' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  textDecoration: st.status === 'done' ? 'line-through' : 'none',
                }}>
                  {st.title}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', border: '2px dashed var(--border-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.5,
              }}>
                <Plus size={10} color="var(--text-tertiary)" />
              </div>
              <input
                className="form-input"
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSubtask(); }}
                placeholder="Додати підзадачу..."
                style={{ flex: 1, fontSize: 13, padding: '6px 8px', border: 'none', background: 'transparent' }}
              />
            </div>
          </div>

          {/* Footer info */}
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>Створено: {task.created_at?.split('T')[0] || task.created_at?.split(' ')[0]}</span>
            {task.completed_at && <span>Завершено: {task.completed_at?.split('T')[0] || task.completed_at?.split(' ')[0]}</span>}
            {task.creator_name && <span>Автор: {task.creator_name}</span>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingBottom: 16 }}>
            <button className="btn btn-primary" style={{ flex: 1, borderRadius: 12, padding: '12px 0', background: saved ? '#22c55e' : undefined, borderColor: saved ? '#22c55e' : undefined, transition: 'all 0.3s ease' }} onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : saved ? <Check size={14} /> : <Check size={14} />}
              {' '}{saving ? 'Зберігаємо...' : saved ? 'Збережено ✓' : 'Зберегти'}
            </button>
            <button className="btn btn-danger" style={{ borderRadius: 12, padding: '12px 16px' }} onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 size={14} className="animate-pulse" /> : <Trash2 size={14} />}
            </button>
          </div>
        </div>
        {/* Safe area spacer */}
        <div style={{ padding: '0 16px 8px', paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))', flexShrink: 0 }} />
      </div>

      {/* Image Preview Lightbox */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <img src={previewImage} alt="Preview" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12 }} />
          <button
            onClick={() => setPreviewImage(null)}
            style={{
              position: 'absolute', top: 16, right: 16, width: 36, height: 36,
              borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}

/* ================================================================
   Main Component
   ================================================================ */
export default function MobileTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [viewTask, setViewTask] = useState<Task | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const quickRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectFilter) params.set('project_id', projectFilter);
      if (search) params.set('search', search);
      const [tRes, pRes, tgRes, uRes] = await Promise.all([
        fetch(`/api/tasks?${params}`),
        fetch('/api/tasks/projects'),
        fetch('/api/tasks/tags'),
        fetch('/api/users'),
        fetch('/api/properties'),
      ]);
      if (tRes.ok) { const d = await tRes.json(); setTasks(Array.isArray(d) ? d : d.tasks || []); }
      if (pRes.ok) { const d = await pRes.json(); setProjects(Array.isArray(d) ? d : []); }
      if (tgRes.ok) { const d = await tgRes.json(); setTags(Array.isArray(d) ? d : []); }
      if (uRes.ok) { const d = await uRes.json(); setUsers(Array.isArray(d) ? d : d.users || []); }
      const prRes = await fetch('/api/properties'); // properties fetched separately
      if (prRes.ok) { const d = await prRes.json(); setProperties(Array.isArray(d) ? d : d.properties || []); }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [projectFilter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Quick add */
  const handleQuickAdd = async () => {
    if (!quickTitle.trim()) return;
    setQuickSaving(true);
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: quickTitle.trim(), project_id: projectFilter || undefined }),
      });
      setQuickTitle('');
      fetchData();
      quickRef.current?.focus();
    } catch { /* */ }
    setQuickSaving(false);
  };

  /* Toggle task status */
  const handleToggle = async (taskId: string, currentStatus: string) => {
    const ns = currentStatus === 'done' ? 'todo' : 'done';
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ns, completed_at: ns === 'done' ? new Date().toISOString() : null }),
      });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: ns } : t));
    } catch { /* */ }
  };

  /* Filter */
  const filtered = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(); today.setHours(0, 0, 0, 0);

    return tasks.filter(t => {
      if (t.parent_id) return false;
      // Status filter
      if (statusFilter && t.status !== statusFilter) return false;
      // Date filter
      if (dateFilter === 'today') return t.due_date === todayStr;
      if (dateFilter === 'week') {
        if (!t.due_date) return false;
        const due = new Date(t.due_date + 'T00:00:00');
        const diff = (due.getTime() - today.getTime()) / 86400000;
        return diff >= 0 && diff <= 7;
      }
      if (dateFilter === 'overdue') {
        if (!t.due_date) return false;
        return new Date(t.due_date + 'T00:00:00') < today && t.status !== 'done' && t.status !== 'cancelled';
      }
      // Search
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;
      return a.sort_order - b.sort_order;
    });
  }, [tasks, dateFilter, statusFilter, search]);

  /* Stats */
  const overdue = tasks.filter(t => {
    if (!t.due_date || t.parent_id || t.status === 'done' || t.status === 'cancelled') return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(t.due_date + 'T00:00:00') < today;
  }).length;

  return (
    <div>
      {/* Search bar */}
      {showSearch && (
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            className="form-input"
            placeholder="Назва задачі..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{ fontSize: 14, padding: '10px 12px 10px 32px', borderRadius: 12 }}
          />
        </div>
      )}

      {/* Quick add */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        background: 'var(--bg-card)', borderRadius: 14, marginBottom: 8,
        border: '1px solid var(--border-primary)',
      }}>
        <Plus size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
        <input
          ref={quickRef}
          value={quickTitle}
          onChange={e => setQuickTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); }}
          placeholder="Додати задачу..."
          disabled={quickSaving}
          style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit',
          }}
        />
        {quickTitle.trim() && (
          <button
            onClick={handleQuickAdd}
            disabled={quickSaving}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none', flexShrink: 0,
              background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {quickSaving ? <Loader2 size={14} className="animate-pulse" /> : <Plus size={16} />}
          </button>
        )}
      </div>

      {/* Project filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <button
          onClick={() => setProjectFilter(null)}
          style={{
            padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
            background: projectFilter === null ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
            color: projectFilter === null ? '#fff' : 'var(--text-secondary)',
          }}
        >
          Всі проєкти
        </button>
        {projects.map(p => (
          <button
            key={p.id}
            onClick={() => setProjectFilter(p.id)}
            style={{
              padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
              background: projectFilter === p.id ? p.color : 'var(--bg-tertiary)',
              color: projectFilter === p.id ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {p.icon} {p.name}
          </button>
        ))}
      </div>

      {/* Date filter chips */}
      <div className="m-chips">
        {DATE_CHIPS.map(chip => (
          <button
            key={chip.key}
            className={`m-chip ${dateFilter === chip.key ? 'm-chip-active' : ''}`}
            onClick={() => setDateFilter(chip.key)}
          >
            {chip.label}
            {chip.key === 'overdue' && overdue > 0 && (
              <span style={{
                marginLeft: 4, padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700,
                background: 'rgba(239,68,68,0.2)', color: '#ef4444',
              }}>
                {overdue}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status filter chips */}
      <div className="m-chips" style={{ marginTop: 2 }}>
        {STATUS_CHIPS.map(chip => (
          <button
            key={chip.key}
            className={`m-chip ${statusFilter === chip.key ? 'm-chip-active' : ''}`}
            onClick={() => setStatusFilter(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
          {filtered.length} задач
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSearch(p => !p)} style={{ background: 'transparent', border: 'none', color: showSearch ? 'var(--accent-primary)' : 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <Search size={16} />
          </button>
          <button onClick={fetchData} disabled={loading} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
          </button>
        </div>
      </div>

      {/* Task List */}
      {loading && tasks.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5].map(i => <div key={i} className="m-skeleton" style={{ height: 72, borderRadius: 14 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="m-empty">
          <div className="m-empty-icon">📋</div>
          <div>Задач немає</div>
        </div>
      ) : (
        filtered.map(task => {
          const isDone = task.status === 'done';
          const pri = PRIORITY_CFG[task.priority] || PRIORITY_CFG.normal;
          const due = getDueInfo(task.due_date);
          return (
            <div
              key={task.id}
              className="m-card"
              style={{
                padding: '10px 12px 10px 14px',
                cursor: 'pointer',
                borderLeft: `3px solid ${pri.color}`,
                opacity: isDone ? 0.65 : 1,
                transition: 'opacity 0.2s ease, transform 0.15s ease',
              }}
            >
              <div className="m-card-row" style={{ gap: 10 }}>
                {/* Checkbox */}
                <button
                  onClick={e => { e.stopPropagation(); handleToggle(task.id, task.status); }}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                    border: isDone ? 'none' : `2px solid ${pri.color}`,
                    background: isDone ? '#22c55e' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isDone && <Check size={12} color="#fff" />}
                </button>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => setViewTask(task)}>
                  <div className="m-card-title" style={{
                    textDecoration: isDone ? 'line-through' : 'none',
                    color: isDone ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    fontSize: 14,
                  }}>
                    {task.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {/* Due date chip */}
                    {due.text && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                        background: due.bg, color: due.color,
                      }}>
                        <Clock size={9} /> {due.text}
                      </span>
                    )}
                    {/* Project dot + name */}
                    {task.project_name && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-tertiary)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: task.project_color || '#6c7086' }} />
                        {task.project_name}
                      </span>
                    )}
                    {/* Assignee avatar */}
                    {task.assignee_name && (
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%', background: '#4f6ef7',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 7, fontWeight: 700, color: '#fff', flexShrink: 0,
                      }}>
                        {initials(task.assignee_name)}
                      </span>
                    )}
                    {/* Tags */}
                    {task.tags && task.tags.length > 0 && task.tags.map(tag => (
                      <span key={tag.id} style={{
                        padding: '1px 7px', borderRadius: 8, fontSize: 9, fontWeight: 600,
                        background: `${tag.color}20`, color: tag.color,
                      }}>
                        {tag.name}
                      </span>
                    ))}
                    {/* Subtask progress */}
                    {task.subtask_count != null && task.subtask_count > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-tertiary)' }}>
                        <CheckSquare size={9} />
                        {task.subtask_done_count || 0}/{task.subtask_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Task Detail Bottom Sheet */}
      {viewTask && (
        <TaskSheet
          task={viewTask}
          projects={projects}
          tags={tags}
          users={users}
          properties={properties}
          onClose={() => setViewTask(null)}
          onUpdated={() => { setViewTask(null); fetchData(); }}
          onDeleted={() => { setViewTask(null); fetchData(); }}
          onSaved={() => fetchData()}
        />
      )}
    </div>
  );
}
