/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import path from 'path';
import fs from 'fs';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'tasks');

// GET /api/tasks/[id]/attachments — list attachments for a task
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = getDb();
    const attachments = db.prepare(`
      SELECT a.*, u.full_name as creator_name
      FROM task_attachments a
      LEFT JOIN app_users u ON a.created_by = u.id
      WHERE a.task_id = ?
      ORDER BY a.created_at DESC
    `).all(id);
    return NextResponse.json(attachments);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// POST /api/tasks/[id]/attachments — upload attachment
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await context.params;
    const user = getSessionUser(getSessionIdFromCookies(request.headers.get('cookie')));
    const db = getDb();

    // Verify task exists
    const task = db.prepare('SELECT id, organization_id FROM tasks WHERE id = ?').get(taskId) as any;
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Ensure upload directory exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type — images + common docs
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
      'image/heic', 'image/heif',
      'application/pdf',
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        error: `Непідтримуваний тип файлу "${file.type}". Дозволено: jpg, png, webp, gif, svg, heic, pdf`
      }, { status: 400 });
    }

    // Max size 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Файл завеликий. Максимум 10MB' }, { status: 400 });
    }

    // Generate unique filename
    const ext = path.extname(file.name) || '.jpg';
    const baseName = path.basename(file.name, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);
    const timestamp = Date.now();
    const filename = `${baseName}_${timestamp}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Save to DB
    const url = `/api/uploads/tasks/${filename}`;
    const result = db.prepare(`
      INSERT INTO task_attachments (task_id, organization_id, filename, url, file_size, content_type, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(taskId, task.organization_id, file.name, url, file.size, file.type, user?.id ?? null);

    const attachment = db.prepare('SELECT * FROM task_attachments WHERE rowid = ?').get(result.lastInsertRowid);

    return NextResponse.json(attachment, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/tasks/[id]/attachments error:', error?.message);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id]/attachments — delete attachment (expects { attachment_id } in body)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await context.params;
    const { attachment_id } = await request.json();

    if (!attachment_id) {
      return NextResponse.json({ error: 'attachment_id required' }, { status: 400 });
    }

    const db = getDb();
    const attachment = db.prepare('SELECT * FROM task_attachments WHERE id = ? AND task_id = ?').get(attachment_id, taskId) as any;

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Delete file from disk
    const filename = attachment.url.split('/').pop();
    if (filename) {
      const filePath = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete from DB
    db.prepare('DELETE FROM task_attachments WHERE id = ?').run(attachment_id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
