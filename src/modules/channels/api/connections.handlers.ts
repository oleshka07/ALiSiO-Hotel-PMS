/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as connectionsRepo from '../data/connections.repo';
import { publicMessage } from '@core/security/public-error';

export async function listConnections(): Promise<NextResponse> {
  try {
    return NextResponse.json(connectionsRepo.listConnections());
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function createConnection(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { channel, external_property_id, connection_types, pricing_model } = body;

    if (!channel) {
      return NextResponse.json({ error: 'Channel is required' }, { status: 400 });
    }

    const id = connectionsRepo.createConnection({ channel, external_property_id, connection_types, pricing_model });
    return NextResponse.json({ id, status: 'created' }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
