/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as guestsRepo from '../data/guests.repo';

export async function listGuests(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const country = searchParams.get('country') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const result = guestsRepo.listGuests({ search: search || undefined, country: country || undefined }, page, limit);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('GET /api/guests error:', error);
    return NextResponse.json({ error: 'Failed to fetch guests' }, { status: 500 });
  }
}

export async function createGuest(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { firstName, lastName } = body;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const guestId = guestsRepo.createGuest(body);
    return NextResponse.json({ id: guestId }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/guests error:', error);
    return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 });
  }
}
