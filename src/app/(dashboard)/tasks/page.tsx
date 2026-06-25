"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDevice } from "@/lib/useDevice";
import MobileTasks from "@/components/mobile/pages/MobileTasks";
import Header from "@/components/layout/Header";
import { useMobileMenu } from "@/lib/MobileMenuContext";
import {
  Plus,
  Search,
  X,
  RefreshCw,
  Loader2,
  LayoutGrid,
  List,
  Table2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
  Tag,
  User,
  Building2,
  FolderOpen,
  Inbox,
  AlertTriangle,
  Filter,
  Hash,
  Flag,
  CheckSquare,
  Paperclip,
  Image,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
} from "lucide-react";
import "./tasks.css";

/* ================================================================
   Types
   ================================================================ */
interface TaskTag {
  id: string;
  name: string;
  color: string;
}

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
  property_id: string | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee_name?: string;
  creator_name?: string;
  project_name?: string;
  project_color?: string;
  property_name?: string;
  tags?: TaskTag[];
  subtask_count?: number;
  subtask_done_count?: number;
}

interface TaskProject {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  property_id: string | null;
  sort_order: number;
  is_archived: number;
  property_name?: string;
  task_count?: number;
  children?: TaskProject[];
}

interface AppUser {
  id: string;
  full_name: string;
  role: string;
}

interface Property {
  id: string;
  name: string;
  slug: string;
}

/* ================================================================
   Constants
   ================================================================ */
const STATUS_CONFIG: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  todo: { label: "Нове", icon: "○", color: "#6c7086" },
  in_progress: { label: "В роботі", icon: "◐", color: "#3b82f6" },
  done: { label: "Готово", icon: "●", color: "#22c55e" },
  cancelled: { label: "Скасовано", icon: "✕", color: "#ef4444" },
};

const PRIORITY_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  low: { label: "Низький", color: "#6c7086", icon: "↓" },
  normal: { label: "Нормальний", color: "#3b82f6", icon: "→" },
  high: { label: "Високий", color: "#f59e0b", icon: "↑" },
  urgent: { label: "Терміновий", color: "#ef4444", icon: "⚡" },
};

const PROJECT_COLORS = [
  "#4f6ef7",
  "#3b82f6",
  "#22c55e",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#14b8a6",
  "#6366f1",
  "#d946ef",
  "#0ea5e9",
];

/* ================================================================
   Helpers
   ================================================================ */
function getDueLabel(dueDate: string | null): { text: string; cls: string } {
  if (!dueDate) return { text: "", cls: "" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `Прострочено (${dueDate})`, cls: "overdue" };
  if (diff === 0) return { text: "Сьогодні", cls: "today" };
  if (diff === 1) return { text: "Завтра", cls: "tomorrow" };
  if (diff <= 7) return { text: `${dueDate}`, cls: "" };
  return { text: dueDate, cls: "" };
}

function buildProjectTree(projects: TaskProject[]): TaskProject[] {
  const map = new Map<string, TaskProject>();
  const roots: TaskProject[] = [];
  projects.forEach((p) => map.set(p.id, { ...p, children: [] }));
  projects.forEach((p) => {
    const node = map.get(p.id)!;
    if (p.parent_id && map.has(p.parent_id)) {
      map.get(p.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

/* ================================================================
   Quick Add Component
   ================================================================ */
function QuickAdd({
  projectId,
  onCreated,
}: {
  projectId: string | null;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          project_id: projectId,
          priority,
        }),
      });
      setTitle("");
      setPriority("normal");
      onCreated();
      inputRef.current?.focus();
    } catch {
      /* */
    }
    setSaving(false);
  };

  return (
    <div className="quick-add">
      <div className="quick-add-icon">
        <Plus size={18} />
      </div>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
        placeholder="Додати задачу..."
        disabled={saving}
      />
      <div className="quick-add-actions">
        <button
          className="tasks-filter-btn"
          style={{
            padding: "3px 8px",
            borderColor: PRIORITY_CONFIG[priority]?.color,
          }}
          onClick={() => {
            const keys = Object.keys(PRIORITY_CONFIG);
            const idx = keys.indexOf(priority);
            setPriority(keys[(idx + 1) % keys.length]);
          }}
          title="Пріоритет"
        >
          <Flag size={12} style={{ color: PRIORITY_CONFIG[priority]?.color }} />
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleSubmit}
          disabled={saving || !title.trim()}
        >
          {saving ? (
            <Loader2 size={14} className="animate-pulse" />
          ) : (
            <Plus size={14} />
          )}
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   Task Detail Drawer
   ================================================================ */
function TaskDrawer({
  task,
  projects,
  tags,
  users,
  properties,
  onClose,
  onUpdated,
  onDeleted,
}: {
  task: Task;
  projects: TaskProject[];
  tags: TaskTag[];
  users: AppUser[];
  properties: Property[];
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || "",
    status: task.status,
    priority: task.priority,
    due_date: task.due_date || "",
    due_time: task.due_time || "",
    project_id: task.project_id || "",
    assignee_id: task.assignee_id || "",
    property_id: task.property_id || "",
  });
  const [taskTags, setTaskTags] = useState<string[]>(
    task.tags?.map((t) => t.id) || [],
  );
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [attachments, setAttachments] = useState<
    {
      id: string;
      filename: string;
      url: string;
      file_size: number;
      content_type: string;
      created_at: string;
    }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch subtasks
  useEffect(() => {
    fetch(`/api/tasks?parent_id=${task.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) =>
        setSubtasks(Array.isArray(data) ? data : data.tasks || []),
      )
      .catch(() => {});
  }, [task.id]);

  // Fetch attachments
  useEffect(() => {
    fetch(`/api/tasks/${task.id}/attachments`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAttachments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [task.id]);

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append("file", files[i]);
      try {
        const res = await fetch(`/api/tasks/${task.id}/attachments`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const att = await res.json();
          setAttachments((prev) => [att, ...prev]);
        } else {
          const err = await res
            .json()
            .catch(() => ({ error: "Помилка завантаження" }));
          alert(err.error || "Помилка завантаження файлу");
        }
      } catch {
        alert("Помилка з'єднання при завантаженні");
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/attachments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachment_id: attachmentId }),
      });
      if (res.ok) {
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      } else {
        alert("Не вдалося видалити файл");
      }
    } catch {
      alert("Помилка з'єднання");
    }
  };

  // Auto-resize title
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = "auto";
      titleRef.current.style.height = titleRef.current.scrollHeight + "px";
    }
  }, [form.title]);

  const handleSave = async () => {
    // Cancel any pending auto-save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tag_ids: taskTags }),
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Помилка збереження" }));
        console.error("Save failed:", err);
        alert(err.error || "Не вдалося зберегти задачу");
      } else {
        onUpdated();
      }
    } catch (e) {
      console.error("Save error:", e);
      alert("Помилка з'єднання при збереженні");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("Видалити задачу?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      onDeleted();
      onClose();
    } catch {
      /* */
    }
    setDeleting(false);
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newSubtask.trim(),
          parent_id: task.id,
          project_id: task.project_id,
        }),
      });
      setNewSubtask("");
      // Refresh subtasks
      const res = await fetch(`/api/tasks?parent_id=${task.id}`);
      if (res.ok) {
        const data = await res.json();
        setSubtasks(Array.isArray(data) ? data : data.tasks || []);
      }
      onUpdated();
    } catch {
      /* */
    }
  };

  const toggleSubtask = async (subtaskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "done" ? "todo" : "done";
    try {
      await fetch(`/api/tasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          completed_at: newStatus === "done" ? new Date().toISOString() : null,
        }),
      });
      setSubtasks((prev) =>
        prev.map((s) => (s.id === subtaskId ? { ...s, status: newStatus } : s)),
      );
      onUpdated();
    } catch {
      /* */
    }
  };

  // Debounce save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoSave = useCallback(
    (updates: Partial<typeof form>) => {
      const newForm = { ...form, ...updates };
      setForm(newForm);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...newForm, tag_ids: taskTags }),
          });
          onUpdated();
        } catch {
          /* */
        }
      }, 600);
    },
    [form, task.id, taskTags, onUpdated],
  );

  return (
    <>
      <div className="task-drawer-overlay" onClick={onClose} />
      <div className="task-drawer">
        <div className="task-drawer-header">
          <div style={{ flex: 1 }}>
            <div className="task-drawer-status-row">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  className={`btn btn-sm ${form.status === key ? "btn-primary" : "btn-secondary"}`}
                  style={{
                    fontSize: 11,
                    background: form.status === key ? cfg.color : undefined,
                    borderColor: form.status === key ? cfg.color : undefined,
                  }}
                  onClick={() => {
                    const updates = {
                      status: key,
                      completed_at:
                        key === "done" ? new Date().toISOString() : null,
                    } as Record<string, unknown>;
                    autoSave(updates as Partial<typeof form>);
                  }}
                >
                  {cfg.icon} {cfg.label}
                </button>
              ))}
            </div>
            <textarea
              ref={titleRef}
              className="task-drawer-title"
              value={form.title}
              onChange={(e) => autoSave({ title: e.target.value })}
              placeholder="Назва задачі..."
              rows={1}
            />
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            style={{ marginLeft: 12, flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="task-drawer-body">
          {/* Fields */}
          <div className="task-drawer-section">
            <div className="task-drawer-field">
              <div className="task-drawer-field-label">
                <Flag size={14} /> Пріоритет
              </div>
              <div className="task-drawer-field-value">
                <select
                  value={form.priority}
                  onChange={(e) => autoSave({ priority: e.target.value })}
                >
                  {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.icon} {cfg.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="task-drawer-field">
              <div className="task-drawer-field-label">
                <Calendar size={14} /> Дедлайн
              </div>
              <div
                className="task-drawer-field-value"
                style={{ display: "flex", gap: 8 }}
              >
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => autoSave({ due_date: e.target.value })}
                  style={{ flex: 1 }}
                />
                <input
                  type="time"
                  value={form.due_time}
                  onChange={(e) => autoSave({ due_time: e.target.value })}
                  style={{ width: 100 }}
                />
              </div>
            </div>

            <div className="task-drawer-field">
              <div className="task-drawer-field-label">
                <User size={14} /> Відповідальний
              </div>
              <div className="task-drawer-field-value">
                <select
                  value={form.assignee_id}
                  onChange={(e) => autoSave({ assignee_id: e.target.value })}
                >
                  <option value="">Не призначено</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="task-drawer-field">
              <div className="task-drawer-field-label">
                <FolderOpen size={14} /> Проєкт
              </div>
              <div className="task-drawer-field-value">
                <select
                  value={form.project_id}
                  onChange={(e) => autoSave({ project_id: e.target.value })}
                >
                  <option value="">Inbox</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="task-drawer-field">
              <div className="task-drawer-field-label">
                <Building2 size={14} /> Об&apos;єкт
              </div>
              <div className="task-drawer-field-value">
                <select
                  value={form.property_id}
                  onChange={(e) => autoSave({ property_id: e.target.value })}
                >
                  <option value="">Не прив&apos;язано</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="task-drawer-section">
            <div className="task-drawer-section-title">
              <Tag size={12} /> Теги
            </div>
            <div className="tags-selector">
              {taskTags.map((tagId) => {
                const tag = tags.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <span
                    key={tag.id}
                    className="tags-selector-tag"
                    style={{ background: `${tag.color}20`, color: tag.color }}
                  >
                    {tag.name}
                    <span
                      className="tag-remove"
                      onClick={() => {
                        const newTags = taskTags.filter((t) => t !== tagId);
                        setTaskTags(newTags);
                        // Save immediately
                        fetch(`/api/tasks/${task.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ tag_ids: newTags }),
                        }).then(() => onUpdated());
                      }}
                    >
                      <X size={10} />
                    </span>
                  </span>
                );
              })}
              <div style={{ position: "relative" }}>
                <button
                  className="tags-add-btn"
                  onClick={() => setShowTagPicker(!showTagPicker)}
                >
                  <Plus size={10} /> Тег
                </button>
                {showTagPicker && (
                  <div
                    className="dropdown-menu"
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      zIndex: 10,
                      minWidth: 160,
                      maxHeight: 200,
                      overflowY: "auto",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-primary)",
                      borderRadius: "var(--radius-md)",
                      padding: 4,
                      marginTop: 4,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    }}
                  >
                    {tags
                      .filter((t) => !taskTags.includes(t.id))
                      .map((tag) => (
                        <button
                          key={tag.id}
                          className="dropdown-item"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            width: "100%",
                            padding: "6px 10px",
                            fontSize: 12,
                            border: "none",
                            background: "none",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                            borderRadius: 4,
                            fontFamily: "var(--font-sans)",
                          }}
                          onMouseOver={(e) =>
                            (e.currentTarget.style.background =
                              "var(--bg-card-hover)")
                          }
                          onMouseOut={(e) =>
                            (e.currentTarget.style.background = "none")
                          }
                          onClick={() => {
                            const newTags = [...taskTags, tag.id];
                            setTaskTags(newTags);
                            setShowTagPicker(false);
                            fetch(`/api/tasks/${task.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ tag_ids: newTags }),
                            }).then(() => onUpdated());
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: tag.color,
                            }}
                          />
                          {tag.name}
                        </button>
                      ))}
                    {tags.filter((t) => !taskTags.includes(t.id)).length ===
                      0 &&
                      !newTagName.trim() && (
                        <div
                          style={{
                            padding: 8,
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                            textAlign: "center",
                          }}
                        >
                          Введіть назву нового тегу
                        </div>
                      )}
                    {/* Inline tag create */}
                    <div
                      style={{
                        borderTop: "1px solid var(--border-primary)",
                        padding: "6px 4px 4px",
                        marginTop: 4,
                      }}
                    >
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          className="form-input"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newTagName.trim()) {
                              e.preventDefault();
                              const TAG_COLORS = [
                                "#ef4444",
                                "#f59e0b",
                                "#22c55e",
                                "#3b82f6",
                                "#8b5cf6",
                                "#ec4899",
                                "#14b8a6",
                                "#f97316",
                              ];
                              const color =
                                TAG_COLORS[
                                  Math.floor(Math.random() * TAG_COLORS.length)
                                ];
                              fetch("/api/tasks/tags", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  name: newTagName.trim(),
                                  color,
                                }),
                              })
                                .then((r) => (r.ok ? r.json() : null))
                                .then((created) => {
                                  if (created) {
                                    const newTags = [...taskTags, created.id];
                                    setTaskTags(newTags);
                                    setNewTagName("");
                                    fetch(`/api/tasks/${task.id}`, {
                                      method: "PATCH",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        tag_ids: newTags,
                                      }),
                                    }).then(() => onUpdated());
                                  }
                                });
                            }
                          }}
                          placeholder="Новий тег... Enter"
                          style={{ flex: 1, fontSize: 11, padding: "4px 8px" }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="task-drawer-section">
            <div className="task-drawer-section-title">
              <Hash size={12} /> Опис
            </div>
            <textarea
              className="task-drawer-description"
              value={form.description}
              onChange={(e) => autoSave({ description: e.target.value })}
              placeholder="Додати опис..."
            />
          </div>

          {/* Attachments */}
          <div className="task-drawer-section">
            <div className="task-drawer-section-title">
              <Paperclip size={12} /> Фото та файли
              {attachments.length > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    fontWeight: 400,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  {attachments.length}
                </span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              style={{ display: "none" }}
              onChange={handleUploadFile}
            />
            {attachments.length > 0 && (
              <div className="task-attachments-grid">
                {attachments.map((att) => {
                  const isImage = att.content_type?.startsWith("image/");
                  return (
                    <div key={att.id} className="task-attachment-item">
                      {isImage ? (
                        <img
                          src={att.url}
                          alt={att.filename}
                          className="task-attachment-img"
                          onClick={() => setPreviewImage(att.url)}
                        />
                      ) : (
                        <div
                          className="task-attachment-file"
                          onClick={() => window.open(att.url, "_blank")}
                        >
                          <Paperclip size={20} />
                          <span>{att.filename}</span>
                        </div>
                      )}
                      <button
                        className="task-attachment-delete"
                        onClick={() => handleDeleteAttachment(att.id)}
                        title="Видалити"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              className="subtask-add"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ marginTop: 4 }}
            >
              {uploading ? (
                <Loader2 size={14} className="animate-pulse" />
              ) : (
                <Image size={14} />
              )}
              {uploading ? "Завантаження..." : "Додати фото / файл"}
            </button>
          </div>

          {/* Image Preview Lightbox */}
          {previewImage && (
            <div
              className="task-lightbox"
              onClick={() => setPreviewImage(null)}
            >
              <img src={previewImage} alt="Preview" />
              <button
                className="task-lightbox-close"
                onClick={() => setPreviewImage(null)}
              >
                <X size={20} />
              </button>
            </div>
          )}

          {/* Subtasks */}
          <div className="task-drawer-section">
            <div className="task-drawer-section-title">
              <CheckSquare size={12} /> Підзадачі
              {subtasks.length > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    fontWeight: 400,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  {subtasks.filter((s) => s.status === "done").length}/
                  {subtasks.length}
                </span>
              )}
            </div>
            {subtasks.length > 0 && (
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  background: "var(--bg-tertiary)",
                  marginBottom: 8,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 2,
                    background: "var(--accent-success)",
                    width: `${(subtasks.filter((s) => s.status === "done").length / subtasks.length) * 100}%`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            )}
            <div className="subtask-list">
              {subtasks.map((st) => (
                <div key={st.id} className="subtask-item">
                  <button
                    className={`subtask-checkbox ${st.status === "done" ? "checked" : ""}`}
                    onClick={() => toggleSubtask(st.id, st.status)}
                  >
                    {st.status === "done" && <Check size={10} color="white" />}
                  </button>
                  <span
                    className={`subtask-title ${st.status === "done" ? "completed" : ""}`}
                  >
                    {st.title}
                  </span>
                </div>
              ))}
              <div className="subtask-item" style={{ gap: 8 }}>
                <button className="subtask-checkbox" style={{ opacity: 0.4 }}>
                  <Plus size={10} />
                </button>
                <input
                  className="subtask-add-input"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddSubtask();
                  }}
                  placeholder="Додати підзадачу..."
                />
              </div>
            </div>
          </div>

          {/* Footer info */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: "1px solid var(--border-primary)",
              fontSize: 11,
              color: "var(--text-tertiary)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div>
              Створено:{" "}
              {task.created_at?.split("T")[0] || task.created_at?.split(" ")[0]}
            </div>
            {task.completed_at && (
              <div>
                Завершено:{" "}
                {task.completed_at?.split("T")[0] ||
                  task.completed_at?.split(" ")[0]}
              </div>
            )}
            {task.creator_name && <div>Автор: {task.creator_name}</div>}
          </div>

          {/* Actions */}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 size={14} className="animate-pulse" />
              ) : (
                <Check size={14} />
              )}
              Зберегти
            </button>
            <button
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 size={14} className="animate-pulse" />
              ) : (
                <X size={14} />
              )}
              Видалити
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================================================================
   Create Project Modal
   ================================================================ */
function CreateProjectModal({
  open,
  onClose,
  onCreated,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  projects: TaskProject[];
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [icon, setIcon] = useState("📁");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tasks/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          color,
          icon,
          parent_id: parentId || null,
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
        setName("");
        setColor(PROJECT_COLORS[0]);
        setParentId("");
      }
    } catch {
      /* */
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Новий проєкт</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Назва *</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Назва проєкту..."
              autoFocus
            />
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Іконка</label>
            <input
              className="form-input"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              style={{ width: 60 }}
            />
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Колір</label>
            <div className="project-color-picker">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`project-color-swatch ${color === c ? "selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Батьківський проєкт</label>
            <select
              className="form-select"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">Без батьківського</option>
              {projects
                .filter((p) => !p.parent_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Скасувати
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <Loader2 size={14} className="animate-pulse" />
            ) : (
              <Plus size={14} />
            )}
            Створити
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Create Tag Modal
   ================================================================ */
function CreateTagModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6c7086");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tasks/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      if (res.ok) {
        onCreated();
        onClose();
        setName("");
      }
    } catch {
      /* */
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Новий тег</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Назва *</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Назва тегу..."
              autoFocus
            />
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Колір</label>
            <div className="project-color-picker">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`project-color-swatch ${color === c ? "selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Скасувати
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <Loader2 size={14} className="animate-pulse" />
            ) : (
              <Plus size={14} />
            )}
            Створити
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Main Tasks Page
   ================================================================ */
export default function TasksPage() {
  const { isMobile } = useDevice();
  if (isMobile) return <MobileTasks />;
  return <TasksDesktop />;
}

function TasksDesktop() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "kanban" | "table">("table");
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<string | null>(null); // null = all, '' = inbox
  const [selectedFilter, setSelectedFilter] = useState<
    "all" | "today" | "upcoming" | "overdue" | "my"
  >("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const onMenuClick = useMobileMenu();

  // ── Table filters ──
  const [filterStatus, setFilterStatus] = useState<string>("active"); // 'all' | 'active' | specific status
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  // ── Table sorting ──
  const [sortColumn, setSortColumn] = useState<string>("sort_order");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortColumn !== col)
      return <ArrowUpDown size={12} style={{ opacity: 0.3 }} />;
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  // Fetch data
  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedProject !== null) params.set("project_id", selectedProject);
      if (search) params.set("search", search);
      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : data.tasks || []);
      }
    } catch {
      /* */
    }
  }, [selectedProject, search]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      }
    } catch {
      /* */
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks/tags");
      if (res.ok) {
        const data = await res.json();
        setTags(Array.isArray(data) ? data : []);
      }
    } catch {
      /* */
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.users || []);
      }
    } catch {
      /* */
    }
  }, []);

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch("/api/business-units");
      if (res.ok) {
        const data = await res.json();
        setProperties(Array.isArray(data) ? data : []);
      }
    } catch {
      /* */
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchTasks(),
      fetchProjects(),
      fetchTags(),
      fetchUsers(),
      fetchProperties(),
    ]);
    setLoading(false);
  }, [fetchTasks, fetchProjects, fetchTags, fetchUsers, fetchProperties]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    // Only top-level tasks (not subtasks)
    if (t.parent_id) return false;
    // Search
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    // Quick filters
    if (selectedFilter === "today") {
      const today = new Date().toISOString().split("T")[0];
      return t.due_date === today;
    }
    if (selectedFilter === "upcoming") {
      if (!t.due_date) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(t.due_date + "T00:00:00");
      const diff = (due.getTime() - today.getTime()) / 86400000;
      return diff >= 0 && diff <= 7;
    }
    if (selectedFilter === "overdue") {
      if (!t.due_date) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return (
        new Date(t.due_date + "T00:00:00") < today &&
        t.status !== "done" &&
        t.status !== "cancelled"
      );
    }
    // Table-specific filters
    if (
      filterStatus === "active" &&
      (t.status === "done" || t.status === "cancelled")
    )
      return false;
    if (
      filterStatus !== "all" &&
      filterStatus !== "active" &&
      t.status !== filterStatus
    )
      return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterAssignee !== "all") {
      if (filterAssignee === "unassigned") {
        if (t.assignee_id) return false;
      } else if (t.assignee_id !== filterAssignee) return false;
    }
    return true;
  });

  // Sort tasks for table view
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (view !== "table") {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      return a.sort_order - b.sort_order;
    }
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortColumn) {
      case "title":
        return dir * a.title.localeCompare(b.title);
      case "status": {
        const order = ["todo", "in_progress", "done", "cancelled"];
        return dir * (order.indexOf(a.status) - order.indexOf(b.status));
      }
      case "priority": {
        const order = ["urgent", "high", "normal", "low"];
        return dir * (order.indexOf(a.priority) - order.indexOf(b.priority));
      }
      case "assignee":
        return (
          dir *
          (a.assignee_name || "яяя").localeCompare(b.assignee_name || "яяя")
        );
      case "project":
        return (
          dir *
          (a.project_name || "\u044f\u044f\u044f").localeCompare(
            b.project_name || "\u044f\u044f\u044f",
          )
        );
      case "property":
        return (
          dir *
          (a.property_name || "\u044f\u044f\u044f").localeCompare(
            b.property_name || "\u044f\u044f\u044f",
          )
        );
      case "due_date": {
        const ad = a.due_date || "9999-99-99";
        const bd = b.due_date || "9999-99-99";
        return dir * ad.localeCompare(bd);
      }
      default: {
        if (a.status === "done" && b.status !== "done") return 1;
        if (a.status !== "done" && b.status === "done") return -1;
        return a.sort_order - b.sort_order;
      }
    }
  });

  // Group by project for list view
  const tasksByProject = new Map<string, Task[]>();
  filteredTasks.forEach((t) => {
    const key = t.project_id || "__inbox__";
    if (!tasksByProject.has(key)) tasksByProject.set(key, []);
    tasksByProject.get(key)!.push(t);
  });

  // Stats
  const totalTasks = tasks.filter((t) => !t.parent_id).length;
  const doneTasks = tasks.filter(
    (t) => !t.parent_id && t.status === "done",
  ).length;
  const overdueTasks = tasks.filter((t) => {
    if (
      !t.due_date ||
      t.parent_id ||
      t.status === "done" ||
      t.status === "cancelled"
    )
      return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(t.due_date + "T00:00:00") < today;
  }).length;
  const todayTasks = tasks.filter((t) => {
    if (t.parent_id) return false;
    return t.due_date === new Date().toISOString().split("T")[0];
  }).length;

  const projectTree = buildProjectTree(projects);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "done" ? "todo" : "done";
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          completed_at: newStatus === "done" ? new Date().toISOString() : null,
        }),
      });
      fetchTasks();
    } catch {
      /* */
    }
  };

  /* ── Inline field update (for table view) ── */
  const handleInlineUpdate = async (
    taskId: string,
    field: string,
    value: string | null,
  ) => {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const updated: Record<string, unknown> = { ...t, [field]: value };
        if (field === "status") {
          updated.completed_at =
            value === "done" ? new Date().toISOString() : null;
        }
        if (field === "assignee_id") {
          updated.assignee_name =
            users.find((u) => u.id === value)?.full_name || null;
        }
        if (field === "project_id") {
          const proj = projects.find((p) => p.id === value);
          updated.project_name = proj?.name || null;
          updated.project_color = proj?.color || null;
        }
        return updated as unknown as Task;
      }),
    );
    try {
      const body: Record<string, unknown> = { [field]: value };
      if (field === "status") {
        body.completed_at = value === "done" ? new Date().toISOString() : null;
      }
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      fetchTasks();
    }
  };

  /* ── Kanban Drag & Drop ── */
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
    // Make drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  };

  const handleDragOver = (e: React.DragEvent, statusKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== statusKey) setDragOverColumn(statusKey);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only reset if leaving the column entirely (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) return;
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              completed_at:
                newStatus === "done" ? new Date().toISOString() : null,
            }
          : t,
      ),
    );

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          completed_at: newStatus === "done" ? new Date().toISOString() : null,
        }),
      });
      fetchTasks();
    } catch {
      fetchTasks(); // Revert on error
    }
    setDraggedTaskId(null);
  };

  /* ────────── Render Project Tree ────────── */
  const renderProjectItem = (project: TaskProject, depth = 0) => (
    <div key={project.id}>
      <button
        className={`tasks-sidebar-item ${selectedProject === project.id && selectedFilter === "all" ? "active" : ""}`}
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={() => {
          setSelectedProject(project.id);
          setSelectedFilter("all");
        }}
      >
        <span
          className="tasks-sidebar-item-color"
          style={{ background: project.color }}
        />
        <span style={{ flex: 1 }}>
          {project.icon} {project.name}
        </span>
        {(project.task_count ?? 0) > 0 && (
          <span className="tasks-sidebar-item-count">{project.task_count}</span>
        )}
      </button>
      {project.children?.map((child) => renderProjectItem(child, depth + 1))}
    </div>
  );

  return (
    <>
      <Header title="Задачі" onMenuClick={onMenuClick} />
      <div
        className="app-content"
        style={{ paddingLeft: 0, paddingRight: 0, paddingBottom: 0 }}
      >
        <div className="tasks-layout">
          {/* ═══════ SIDEBAR ═══════ */}
          <div className="tasks-sidebar">
            {/* Quick filters */}
            <div className="tasks-sidebar-section">
              <div className="tasks-sidebar-section-title">Фільтри</div>
              <button
                className={`tasks-sidebar-item ${selectedProject === null && selectedFilter === "all" ? "active" : ""}`}
                onClick={() => {
                  setSelectedProject(null);
                  setSelectedFilter("all");
                }}
              >
                <span className="tasks-sidebar-item-icon">
                  <Inbox size={16} />
                </span>
                <span>Усі задачі</span>
                <span className="tasks-sidebar-item-count">{totalTasks}</span>
              </button>
              <button
                className={`tasks-sidebar-item ${selectedFilter === "today" ? "active" : ""}`}
                onClick={() => {
                  setSelectedProject(null);
                  setSelectedFilter("today");
                }}
              >
                <span className="tasks-sidebar-item-icon">
                  <Calendar size={16} />
                </span>
                <span>Сьогодні</span>
                {todayTasks > 0 && (
                  <span className="tasks-sidebar-item-count">{todayTasks}</span>
                )}
              </button>
              <button
                className={`tasks-sidebar-item ${selectedFilter === "upcoming" ? "active" : ""}`}
                onClick={() => {
                  setSelectedProject(null);
                  setSelectedFilter("upcoming");
                }}
              >
                <span className="tasks-sidebar-item-icon">
                  <Clock size={16} />
                </span>
                <span>Наступні 7 днів</span>
              </button>
              {overdueTasks > 0 && (
                <button
                  className={`tasks-sidebar-item ${selectedFilter === "overdue" ? "active" : ""}`}
                  onClick={() => {
                    setSelectedProject(null);
                    setSelectedFilter("overdue");
                  }}
                  style={{ color: "#ef4444" }}
                >
                  <span className="tasks-sidebar-item-icon">
                    <AlertTriangle size={16} />
                  </span>
                  <span>Прострочені</span>
                  <span
                    className="tasks-sidebar-item-count"
                    style={{
                      background: "rgba(239,68,68,0.15)",
                      color: "#ef4444",
                    }}
                  >
                    {overdueTasks}
                  </span>
                </button>
              )}
            </div>

            {/* Projects */}
            <div className="tasks-sidebar-section">
              <div className="tasks-sidebar-section-title">Проєкти</div>
              <button
                className={`tasks-sidebar-item ${selectedProject === "" && selectedFilter === "all" ? "active" : ""}`}
                onClick={() => {
                  setSelectedProject("");
                  setSelectedFilter("all");
                }}
              >
                <span className="tasks-sidebar-item-icon">
                  <Inbox size={16} />
                </span>
                <span>Inbox</span>
                {(tasksByProject.get("__inbox__")?.length ?? 0) > 0 && (
                  <span className="tasks-sidebar-item-count">
                    {tasksByProject.get("__inbox__")?.length}
                  </span>
                )}
              </button>
              {projectTree.map((p) => renderProjectItem(p))}
              <button
                className="tasks-sidebar-add-btn"
                onClick={() => setShowCreateProject(true)}
              >
                <Plus size={14} /> Новий проєкт
              </button>
            </div>

            {/* Tags */}
            <div className="tasks-sidebar-section">
              <div className="tasks-sidebar-section-title">Теги</div>
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="tasks-sidebar-item"
                  style={{ cursor: "default" }}
                >
                  <span
                    className="tasks-sidebar-item-color"
                    style={{ background: tag.color }}
                  />
                  <span>{tag.name}</span>
                </div>
              ))}
              <button
                className="tasks-sidebar-add-btn"
                onClick={() => setShowCreateTag(true)}
              >
                <Plus size={14} /> Новий тег
              </button>
            </div>
          </div>

          {/* ═══════ MAIN CONTENT ═══════ */}
          <div className="tasks-content">
            {/* Stats */}
            <div className="tasks-stats">
              <div className="tasks-stat-card">
                <div className="tasks-stat-label">Всього</div>
                <div className="tasks-stat-value">{totalTasks}</div>
              </div>
              <div className="tasks-stat-card">
                <div className="tasks-stat-label">Виконано</div>
                <div className="tasks-stat-value" style={{ color: "#22c55e" }}>
                  {doneTasks}
                </div>
              </div>
              <div className="tasks-stat-card">
                <div className="tasks-stat-label">Сьогодні</div>
                <div className="tasks-stat-value" style={{ color: "#3b82f6" }}>
                  {todayTasks}
                </div>
              </div>
              <div className="tasks-stat-card">
                <div className="tasks-stat-label">Прострочено</div>
                <div
                  className="tasks-stat-value"
                  style={{
                    color:
                      overdueTasks > 0 ? "#ef4444" : "var(--text-tertiary)",
                  }}
                >
                  {overdueTasks}
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="tasks-toolbar">
              <div className="tasks-toolbar-left">
                <div className="tasks-view-toggle">
                  <button
                    className={view === "list" ? "active" : ""}
                    onClick={() => setView("list")}
                  >
                    <List size={14} /> Список
                  </button>
                  <button
                    className={view === "kanban" ? "active" : ""}
                    onClick={() => setView("kanban")}
                  >
                    <LayoutGrid size={14} /> Канбан
                  </button>
                  <button
                    className={view === "table" ? "active" : ""}
                    onClick={() => setView("table")}
                  >
                    <Table2 size={14} /> Таблиця
                  </button>
                </div>
                <div className="tasks-search">
                  <Search size={14} className="tasks-search-icon" />
                  <input
                    className="form-input"
                    placeholder="Пошук задач..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="tasks-toolbar-right">
                <button
                  className="btn btn-secondary btn-icon"
                  onClick={fetchAll}
                  title="Оновити"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            {/* Quick Add */}
            <QuickAdd
              projectId={
                selectedProject === null ? null : selectedProject || null
              }
              onCreated={() => {
                fetchTasks();
                fetchProjects();
              }}
            />

            {loading && (
              <div
                style={{
                  textAlign: "center",
                  padding: 48,
                  color: "var(--text-tertiary)",
                }}
              >
                <Loader2
                  size={24}
                  className="animate-pulse"
                  style={{ display: "inline-block" }}
                />
                <div style={{ marginTop: 8 }}>Завантаження задач...</div>
              </div>
            )}

            {/* ═══════ LIST VIEW ═══════ */}
            {!loading && view === "list" && (
              <>
                {filteredTasks.length === 0 && (
                  <div className="tasks-empty">
                    <div className="tasks-empty-icon">📋</div>
                    <div className="tasks-empty-title">Задач немає</div>
                    <div className="tasks-empty-desc">
                      Створіть нову задачу за допомогою поля вище
                    </div>
                  </div>
                )}

                {selectedProject !== null ? (
                  /* Single project view */
                  <div className="task-list-section">
                    {filteredTasks
                      .sort((a, b) => {
                        if (a.status === "done" && b.status !== "done")
                          return 1;
                        if (a.status !== "done" && b.status === "done")
                          return -1;
                        return a.sort_order - b.sort_order;
                      })
                      .map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          onToggle={() =>
                            handleToggleStatus(task.id, task.status)
                          }
                          onClick={() => setSelectedTask(task)}
                        />
                      ))}
                  </div>
                ) : (
                  /* All tasks grouped by project */
                  Array.from(tasksByProject.entries()).map(
                    ([projectId, projectTasks]) => {
                      const project = projects.find((p) => p.id === projectId);
                      const sectionTitle =
                        projectId === "__inbox__"
                          ? "Inbox"
                          : project?.name || "Без проєкту";
                      const sectionColor =
                        projectId === "__inbox__"
                          ? "#6c7086"
                          : project?.color || "#6c7086";
                      const isCollapsed = collapsedSections.has(projectId);

                      return (
                        <div key={projectId} className="task-list-section">
                          <div
                            className="task-list-section-header"
                            onClick={() => toggleSection(projectId)}
                          >
                            <ChevronDown
                              size={14}
                              className={`task-list-section-chevron ${isCollapsed ? "collapsed" : ""}`}
                            />
                            <span
                              className="tasks-sidebar-item-color"
                              style={{ background: sectionColor }}
                            />
                            <span className="task-list-section-title">
                              {sectionTitle}
                            </span>
                            <span className="task-list-section-count">
                              {projectTasks.length}
                            </span>
                          </div>
                          {!isCollapsed &&
                            projectTasks
                              .sort((a, b) => {
                                if (a.status === "done" && b.status !== "done")
                                  return 1;
                                if (a.status !== "done" && b.status === "done")
                                  return -1;
                                return a.sort_order - b.sort_order;
                              })
                              .map((task) => (
                                <TaskItem
                                  key={task.id}
                                  task={task}
                                  onToggle={() =>
                                    handleToggleStatus(task.id, task.status)
                                  }
                                  onClick={() => setSelectedTask(task)}
                                />
                              ))}
                        </div>
                      );
                    },
                  )
                )}
              </>
            )}

            {/* ═══════ KANBAN VIEW ═══════ */}
            {!loading && view === "kanban" && (
              <div className="tasks-kanban">
                {Object.entries(STATUS_CONFIG)
                  .filter(([key]) => key !== "cancelled")
                  .map(([statusKey, cfg]) => {
                    const columnTasks = filteredTasks.filter(
                      (t) => t.status === statusKey,
                    );
                    const isOver = dragOverColumn === statusKey;
                    return (
                      <div
                        key={statusKey}
                        className={`tasks-kanban-column ${isOver ? "kanban-drop-target" : ""}`}
                        onDragOver={(e) => handleDragOver(e, statusKey)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, statusKey)}
                      >
                        <div className="tasks-kanban-header">
                          <div className="tasks-kanban-title">
                            <span className="tasks-kanban-title-icon">
                              {cfg.icon}
                            </span>
                            {cfg.label}
                          </div>
                          <span
                            className="tasks-kanban-count"
                            style={{
                              background: `${cfg.color}20`,
                              color: cfg.color,
                            }}
                          >
                            {columnTasks.length}
                          </span>
                        </div>
                        <div className="tasks-kanban-body">
                          {columnTasks.length === 0 && (
                            <div
                              className={`kanban-empty-drop ${isOver ? "active" : ""}`}
                              style={{
                                padding: 20,
                                textAlign: "center",
                                color: "var(--text-tertiary)",
                                fontSize: 12,
                              }}
                            >
                              {isOver ? "Відпустити тут" : "Немає задач"}
                            </div>
                          )}
                          {columnTasks.map((task) => (
                            <div
                              key={task.id}
                              className={`tasks-kanban-card ${draggedTaskId === task.id ? "dragging" : ""}`}
                              style={
                                {
                                  "--priority-color":
                                    PRIORITY_CONFIG[task.priority]?.color,
                                } as React.CSSProperties
                              }
                              onClick={() => setSelectedTask(task)}
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onDragEnd={handleDragEnd}
                            >
                              <div className="tasks-kanban-card-title">
                                {task.title}
                              </div>
                              <div className="tasks-kanban-card-meta">
                                {task.due_date &&
                                  (() => {
                                    const due = getDueLabel(task.due_date);
                                    return (
                                      <span
                                        className={`task-item-due ${due.cls}`}
                                      >
                                        <Calendar size={10} /> {due.text}
                                      </span>
                                    );
                                  })()}
                                {task.priority !== "normal" && (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color:
                                        PRIORITY_CONFIG[task.priority]?.color,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 2,
                                    }}
                                  >
                                    <Flag size={10} />{" "}
                                    {PRIORITY_CONFIG[task.priority]?.label}
                                  </span>
                                )}
                              </div>
                              {task.tags && task.tags.length > 0 && (
                                <div className="tasks-kanban-card-tags">
                                  {task.tags.map((tag) => (
                                    <span
                                      key={tag.id}
                                      className="task-tag"
                                      style={{
                                        background: `${tag.color}20`,
                                        color: tag.color,
                                      }}
                                    >
                                      {tag.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {(task.assignee_name ||
                                task.project_name ||
                                (task.subtask_count &&
                                  task.subtask_count > 0)) && (
                                <div className="tasks-kanban-card-footer">
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                    }}
                                  >
                                    {task.project_name && (
                                      <span className="task-item-project">
                                        <span
                                          className="task-item-project-dot"
                                          style={{
                                            background:
                                              task.project_color || "#6c7086",
                                          }}
                                        />
                                        {task.project_name}
                                      </span>
                                    )}
                                    {task.subtask_count != null &&
                                      task.subtask_count > 0 && (
                                        <span className="task-item-subtasks">
                                          <CheckSquare size={10} />
                                          {task.subtask_done_count || 0}/
                                          {task.subtask_count}
                                        </span>
                                      )}
                                  </div>
                                  {task.assignee_name && (
                                    <div
                                      className="task-item-assignee"
                                      style={{
                                        background: "#4f6ef7",
                                        fontSize: 8,
                                      }}
                                    >
                                      {task.assignee_name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")
                                        .substring(0, 2)
                                        .toUpperCase()}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                          <button
                            className="tasks-kanban-add"
                            onClick={() => {
                              // Quick create with this status
                              const title = prompt("Назва задачі:");
                              if (title) {
                                fetch("/api/tasks", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    title,
                                    status: statusKey,
                                    project_id: selectedProject || null,
                                  }),
                                }).then(() => {
                                  fetchTasks();
                                  fetchProjects();
                                });
                              }
                            }}
                          >
                            <Plus size={14} /> Додати
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* ═══════ TABLE VIEW ═══════ */}
            {!loading && view === "table" && (
              <>
                {/* Filter bar */}
                <div className="tasks-table-filters">
                  <div className="tasks-table-filter-group">
                    <label className="tasks-table-filter-label">
                      <Filter size={12} /> Статус
                    </label>
                    <select
                      className="tasks-table-filter-select"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="active">Активні</option>
                      <option value="all">Всі</option>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.icon} {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tasks-table-filter-group">
                    <label className="tasks-table-filter-label">
                      <Flag size={12} /> Пріоритет
                    </label>
                    <select
                      className="tasks-table-filter-select"
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value)}
                    >
                      <option value="all">Всі</option>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.icon} {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tasks-table-filter-group">
                    <label className="tasks-table-filter-label">
                      <User size={12} /> Виконавець
                    </label>
                    <select
                      className="tasks-table-filter-select"
                      value={filterAssignee}
                      onChange={(e) => setFilterAssignee(e.target.value)}
                    >
                      <option value="all">Всі</option>
                      <option value="unassigned">Без виконавця</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tasks-table-filter-count">
                    {sortedTasks.length} з{" "}
                    {tasks.filter((t) => !t.parent_id).length} задач
                  </div>
                </div>

                <div className="tasks-table-wrap">
                  <table className="tasks-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}></th>
                        <th
                          className="tasks-table-th-sort"
                          onClick={() => toggleSort("title")}
                        >
                          Назва <SortIcon col="title" />
                        </th>
                        <th
                          className="tasks-table-th-sort"
                          style={{ width: 130 }}
                          onClick={() => toggleSort("status")}
                        >
                          Статус <SortIcon col="status" />
                        </th>
                        <th
                          className="tasks-table-th-sort"
                          style={{ width: 120 }}
                          onClick={() => toggleSort("priority")}
                        >
                          Пріоритет <SortIcon col="priority" />
                        </th>
                        <th
                          className="tasks-table-th-sort"
                          style={{ width: 150 }}
                          onClick={() => toggleSort("assignee")}
                        >
                          Виконавець <SortIcon col="assignee" />
                        </th>
                        <th
                          className="tasks-table-th-sort"
                          style={{ width: 150 }}
                          onClick={() => toggleSort("project")}
                        >
                          Проєкт <SortIcon col="project" />
                        </th>
                        <th
                          className="tasks-table-th-sort"
                          style={{ width: 140 }}
                          onClick={() => toggleSort("property")}
                        >
                          Об&apos;єкт <SortIcon col="property" />
                        </th>
                        <th
                          className="tasks-table-th-sort"
                          style={{ width: 140 }}
                          onClick={() => toggleSort("due_date")}
                        >
                          Дедлайн <SortIcon col="due_date" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTasks.length === 0 && (
                        <tr>
                          <td
                            colSpan={8}
                            style={{
                              textAlign: "center",
                              padding: 32,
                              color: "var(--text-tertiary)",
                            }}
                          >
                            Задач немає
                          </td>
                        </tr>
                      )}
                      {sortedTasks.map((task) => {
                        const isDone = task.status === "done";
                        const dueInfo = getDueLabel(task.due_date);
                        return (
                          <tr
                            key={task.id}
                            className={`tasks-table-row ${isDone ? "row-done" : ""} ${dueInfo.cls === "overdue" ? "row-overdue" : ""}`}
                          >
                            {/* Checkbox */}
                            <td className="tasks-table-td-check">
                              <button
                                className={`task-checkbox ${isDone ? "checked" : ""} priority-${task.priority}`}
                                onClick={() =>
                                  handleToggleStatus(task.id, task.status)
                                }
                              >
                                {isDone && <Check size={11} color="white" />}
                              </button>
                            </td>
                            {/* Title — click opens drawer */}
                            <td className="tasks-table-td-title">
                              <span
                                className={`tasks-table-title-link ${isDone ? "completed" : ""}`}
                                onClick={() => setSelectedTask(task)}
                              >
                                {task.title}
                              </span>
                              {task.tags && task.tags.length > 0 && (
                                <span className="tasks-table-tags">
                                  {task.tags.map((tag) => (
                                    <span
                                      key={tag.id}
                                      className="task-tag"
                                      style={{
                                        background: `${tag.color}20`,
                                        color: tag.color,
                                      }}
                                    >
                                      {tag.name}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </td>
                            {/* Status inline */}
                            <td>
                              <select
                                className="tasks-table-select"
                                value={task.status}
                                onChange={(e) =>
                                  handleInlineUpdate(
                                    task.id,
                                    "status",
                                    e.target.value,
                                  )
                                }
                                style={{
                                  color: STATUS_CONFIG[task.status]?.color,
                                }}
                              >
                                {Object.entries(STATUS_CONFIG).map(
                                  ([key, cfg]) => (
                                    <option key={key} value={key}>
                                      {cfg.icon} {cfg.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </td>
                            {/* Priority inline */}
                            <td>
                              <select
                                className="tasks-table-select"
                                value={task.priority}
                                onChange={(e) =>
                                  handleInlineUpdate(
                                    task.id,
                                    "priority",
                                    e.target.value,
                                  )
                                }
                                style={{
                                  color: PRIORITY_CONFIG[task.priority]?.color,
                                }}
                              >
                                {Object.entries(PRIORITY_CONFIG).map(
                                  ([key, cfg]) => (
                                    <option key={key} value={key}>
                                      {cfg.icon} {cfg.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </td>
                            {/* Assignee inline */}
                            <td>
                              <select
                                className="tasks-table-select"
                                value={task.assignee_id || ""}
                                onChange={(e) =>
                                  handleInlineUpdate(
                                    task.id,
                                    "assignee_id",
                                    e.target.value || null,
                                  )
                                }
                              >
                                <option value="">—</option>
                                {users.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.full_name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            {/* Project inline */}
                            <td>
                              <select
                                className="tasks-table-select"
                                value={task.project_id || ""}
                                onChange={(e) =>
                                  handleInlineUpdate(
                                    task.id,
                                    "project_id",
                                    e.target.value || null,
                                  )
                                }
                              >
                                <option value="">—</option>
                                {projects.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            {/* Object (Business Unit) inline */}
                            <td>
                              <select
                                className="tasks-table-select"
                                value={task.property_id || ""}
                                onChange={(e) =>
                                  handleInlineUpdate(
                                    task.id,
                                    "property_id",
                                    e.target.value || null,
                                  )
                                }
                              >
                                <option value="">—</option>
                                {properties.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            {/* Due date inline */}
                            <td
                              className={
                                dueInfo.cls === "overdue"
                                  ? "td-overdue"
                                  : dueInfo.cls === "today"
                                    ? "td-today"
                                    : ""
                              }
                            >
                              <input
                                type="date"
                                className="tasks-table-input"
                                value={task.due_date || ""}
                                onChange={(e) =>
                                  handleInlineUpdate(
                                    task.id,
                                    "due_date",
                                    e.target.value || null,
                                  )
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Task Detail Drawer */}
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          projects={projects}
          tags={tags}
          users={users}
          properties={properties}
          onClose={() => setSelectedTask(null)}
          onUpdated={() => {
            fetchTasks();
            fetchProjects();
          }}
          onDeleted={() => {
            fetchTasks();
            fetchProjects();
            setSelectedTask(null);
          }}
        />
      )}

      {/* Modals */}
      <CreateProjectModal
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onCreated={fetchProjects}
        projects={projects}
      />
      <CreateTagModal
        open={showCreateTag}
        onClose={() => setShowCreateTag(false)}
        onCreated={fetchTags}
      />
    </>
  );
}

/* ================================================================
   Task Item Component (for list view)
   ================================================================ */
function TaskItem({
  task,
  onToggle,
  onClick,
}: {
  task: Task;
  onToggle: () => void;
  onClick: () => void;
}) {
  const due = getDueLabel(task.due_date);
  const isDone = task.status === "done";

  return (
    <div className="task-item" onClick={onClick}>
      <button
        className={`task-checkbox ${isDone ? "checked" : ""} priority-${task.priority}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {isDone && <Check size={11} color="white" />}
      </button>
      <div className="task-item-body">
        <div className={`task-item-title ${isDone ? "completed" : ""}`}>
          {task.title}
        </div>
        <div className="task-item-meta">
          {due.text && (
            <span className={`task-item-due ${due.cls}`}>
              <Calendar size={10} /> {due.text}
            </span>
          )}
          {task.project_name && (
            <span className="task-item-project">
              <span
                className="task-item-project-dot"
                style={{ background: task.project_color || "#6c7086" }}
              />
              {task.project_name}
            </span>
          )}
          {task.tags &&
            task.tags.length > 0 &&
            task.tags.map((tag) => (
              <span
                key={tag.id}
                className="task-tag"
                style={{ background: `${tag.color}20`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          {task.subtask_count != null && task.subtask_count > 0 && (
            <span className="task-item-subtasks">
              <CheckSquare size={10} />
              {task.subtask_done_count || 0}/{task.subtask_count}
            </span>
          )}
        </div>
      </div>
      <div className="task-item-right">
        {task.assignee_name && (
          <div
            className="task-item-assignee"
            style={{ background: "#4f6ef7" }}
            title={task.assignee_name}
          >
            {task.assignee_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)
              .toUpperCase()}
          </div>
        )}
        {task.priority !== "normal" && (
          <span
            className={`priority-indicator ${task.priority}`}
            title={PRIORITY_CONFIG[task.priority]?.label}
          />
        )}
      </div>
    </div>
  );
}
