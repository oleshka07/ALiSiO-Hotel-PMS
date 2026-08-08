/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as credentialsRepo from '../data/credentials.repo';
import { publicMessage } from '@core/security/public-error';

export async function listCredentials(): Promise<NextResponse> {
  try {
    return NextResponse.json(credentialsRepo.listCredentials());
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function upsertCredentials(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { channel, environment, client_id, client_secret } = body;

    if (!channel || !environment || !client_id || !client_secret) {
      return NextResponse.json(
        { error: 'channel, environment, client_id, and client_secret are required' },
        { status: 400 },
      );
    }

    const result = credentialsRepo.upsertCredentials({ channel, environment, client_id, client_secret });
    return NextResponse.json({ id: result.id, status: result.created ? 'created' : 'updated' });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
