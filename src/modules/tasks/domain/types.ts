// ─── Task Module — Domain Types ────────────────────────────

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Task {
  id: string;
  organization_id: string;
  project_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  due_time: string | null;
  assignee_id: string | null;
  created_by: string | null;
  property_id: string | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  assignee_name?: string;
  creator_name?: string;
  project_name?: string;
  project_color?: string;
  property_name?: string;
  tags?: TaskTag[];
  subtask_count?: number;
  subtask_done_count?: number;
}

export interface TaskProject {
  id: string;
  organization_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  property_id: string | null;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
  // Joined
  property_name?: string;
  task_count?: number;
  children?: TaskProject[];
}

export interface TaskTag {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  created_at: string;
}

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; icon: string; color: string }> = {
  todo: { label: 'Нове', icon: '○', color: '#6c7086' },
  in_progress: { label: 'В роботі', icon: '◐', color: '#3b82f6' },
  done: { label: 'Готово', icon: '●', color: '#22c55e' },
  cancelled: { label: 'Скасовано', icon: '✕', color: '#ef4444' },
};

export const TASK_PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: string }> = {
  low: { label: 'Низький', color: '#6c7086', icon: '↓' },
  normal: { label: 'Нормальний', color: '#3b82f6', icon: '→' },
  high: { label: 'Високий', color: '#f59e0b', icon: '↑' },
  urgent: { label: 'Терміновий', color: '#ef4444', icon: '⚡' },
};
