/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as guestsRepo from '../data/guests.repo';
// TODO: replace with eventBus.emit('crm.guest_updated') when crm module is migrated
import { syncGuestToLead } from '@/lib/sync/guest-lead-sync';
import { publicMessage } from '@core/security/public-error';

export async function getGuest(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const guest = guestsRepo.getGuestWithReservations(id);
    if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    return NextResponse.json(guest);
  } catch (error: any) {
    console.error('GET /api/guests/[id] error:', error?.message || error);
    return NextResponse.json({ error: publicMessage(error, 'Failed to fetch guest') }, { status: 500 });
  }
}

export async function updateGuest(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = guestsRepo.updateGuest(id, body);
    if (!updated) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    try { syncGuestToLead(id); } catch { /* non-fatal */ }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/guests/[id] error:', error?.message || error);
    return NextResponse.json({ error: publicMessage(error, 'Failed to update guest') }, { status: 500 });
  }
}

export async function deleteGuest(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const result = guestsRepo.deleteGuest(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/guests/[id] error:', error?.message || error);
    return NextResponse.json({ error: publicMessage(error, 'Failed to delete guest') }, { status: 500 });
  }
}
