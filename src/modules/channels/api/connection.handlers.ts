/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as connectionsRepo from '../data/connections.repo';
import { publicMessage } from '@core/security/public-error';

export async function getConnection(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const conn = connectionsRepo.getConnection(id);
    if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    return NextResponse.json(conn);
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function updateConnection(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = connectionsRepo.updateConnection(id, body);
    if (!updated) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    return NextResponse.json({ status: 'updated' });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function deleteConnection(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    connectionsRepo.deleteConnection(id);
    return NextResponse.json({ status: 'deleted' });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
