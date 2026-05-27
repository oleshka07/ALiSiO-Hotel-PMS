import { NextRequest, NextResponse } from 'next/server';
import * as tagsRepo from '../data/tags.repo';

type IdParams = { params: Promise<{ id: string }> };

export async function listTags(): Promise<NextResponse> {
  try {
    const rows = tagsRepo.listTags();
    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/tasks/tags error:', error);
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
  }
}

export async function createTag(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const created = tagsRepo.createTag(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('POST /api/tasks/tags error:', error);
    return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 });
  }
}

export async function getTag(_request: NextRequest, context: IdParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const result = tagsRepo.getTagById(id);
    if (!result) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/tasks/tags/:id error:', error);
    return NextResponse.json({ error: 'Failed to fetch tag' }, { status: 500 });
  }
}

export async function updateTag(request: NextRequest, context: IdParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const updated = tagsRepo.updateTag(id, body);
    if (!updated) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/tasks/tags/:id error:', error);
    return NextResponse.json({ error: 'Failed to update tag' }, { status: 500 });
  }
}

export async function deleteTag(_request: NextRequest, context: IdParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    tagsRepo.deleteTag(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/tasks/tags/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
  }
}
