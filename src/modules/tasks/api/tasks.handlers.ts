import { NextRequest, NextResponse } from 'next/server';
import * as tasksRepo from '../data/tasks.repo';

type IdParams = { params: Promise<{ id: string }> };

export async function listTasks(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;
    const filters: tasksRepo.ListTasksFilters = {};

    if (searchParams.get('project_id')) filters.project_id = searchParams.get('project_id')!;
    if (searchParams.get('status')) filters.status = searchParams.get('status')!;
    if (searchParams.get('assignee_id')) filters.assignee_id = searchParams.get('assignee_id')!;
    if (searchParams.get('priority')) filters.priority = searchParams.get('priority')!;
    if (searchParams.get('property_id')) filters.property_id = searchParams.get('property_id')!;
    if (searchParams.get('search')) filters.search = searchParams.get('search')!;
    if (searchParams.get('due_date_from')) filters.due_date_from = searchParams.get('due_date_from')!;
    if (searchParams.get('due_date_to')) filters.due_date_to = searchParams.get('due_date_to')!;
    if (searchParams.has('parent_id')) {
      const parentId = searchParams.get('parent_id');
      filters.parent_id = parentId === '' ? null : parentId!;
    }

    const rows = tasksRepo.listTasks(filters);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function createTask(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { title } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const created = tasksRepo.createTask(body);

    // Set tags if provided
    if (body.tag_ids && Array.isArray(body.tag_ids)) {
      tasksRepo.setTaskTags(created.id, body.tag_ids);
    }

    const result = tasksRepo.getTaskById(created.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

export async function getTask(_request: NextRequest, context: IdParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const result = tasksRepo.getTaskById(id);
    if (!result) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/tasks/:id error:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

export async function updateTask(request: NextRequest, context: IdParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await request.json();

    // Handle tags separately
    if (body.tag_ids && Array.isArray(body.tag_ids)) {
      tasksRepo.setTaskTags(id, body.tag_ids);
      delete body.tag_ids;
    }

    const updated = tasksRepo.updateTask(id, body);
    if (!updated) {
      // Tags may have been updated even if no other fields changed
      const task = tasksRepo.getTaskById(id);
      if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      return NextResponse.json(task);
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/tasks/:id error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function deleteTask(_request: NextRequest, context: IdParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    tasksRepo.deleteTask(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/tasks/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}

export async function reorderTasks(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { updates } = body;

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json({ error: 'updates array is required' }, { status: 400 });
    }

    tasksRepo.reorderTasks(updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/tasks/reorder error:', error);
    return NextResponse.json({ error: 'Failed to reorder tasks' }, { status: 500 });
  }
}
