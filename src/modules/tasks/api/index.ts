// ─── Public API of the tasks module ──────────────────────────────────────
export { listTasks, createTask, getTask, updateTask, deleteTask, reorderTasks } from './tasks.handlers';
export { listProjects, createProject, getProject, updateProject, deleteProject } from './projects.handlers';
export { listTags, createTag, getTag, updateTag, deleteTag } from './tags.handlers';
export type { Task, TaskProject, TaskTag, TaskStatus, TaskPriority } from '../domain/types';
export { TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG } from '../domain/types';
