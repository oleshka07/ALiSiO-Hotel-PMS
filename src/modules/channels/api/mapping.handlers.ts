/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as connectionsRepo from '../data/connections.repo';
import { publicMessage } from '@core/security/public-error';

export async function listMappings(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connection_id') || undefined;
    return NextResponse.json(connectionsRepo.listMappings(connectionId));
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function upsertMapping(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { connection_id, unit_type_id, external_room_type_id, external_rate_plan_id } = body;

    if (!connection_id || !unit_type_id) {
      return NextResponse.json(
        { error: 'connection_id and unit_type_id are required' },
        { status: 400 },
      );
    }

    const result = connectionsRepo.upsertMapping({ connection_id, unit_type_id, external_room_type_id, external_rate_plan_id });
    return NextResponse.json({ id: result.id, status: result.created ? 'created' : 'updated' }, result.created ? { status: 201 } : undefined);
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function deleteMapping(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    connectionsRepo.deleteMapping(id);
    return NextResponse.json({ status: 'deleted' });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
