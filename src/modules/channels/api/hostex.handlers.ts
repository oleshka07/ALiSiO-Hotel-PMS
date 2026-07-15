/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { syncReservations, syncSingleReservation, getSyncStatus, seedPropertyMap } from '@/lib/hostex-sync';
import { getReservations, getProperties } from '@/lib/hostex';

// ─── /api/hostex/sync ─────────────────────────────────────────────────────────

export async function hostexSync(): Promise<NextResponse> {
  try {
    const seedResult = await seedPropertyMap();
    const result = await syncReservations();
    return NextResponse.json({ success: true, ...result, unmappedProperties: seedResult?.unmapped || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function hostexSyncStatus(): Promise<NextResponse> {
  try {
    return NextResponse.json(getSyncStatus());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── /api/hostex/reservations ─────────────────────────────────────────────────

export async function hostexReservations(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const per_page = parseInt(url.searchParams.get('per_page') || '20');
    const status = url.searchParams.get('status') || undefined;
    const property_id = url.searchParams.get('property_id') ? parseInt(url.searchParams.get('property_id')!) : undefined;
    const result = await getReservations({ page, per_page, status, property_id });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── /api/hostex/properties ───────────────────────────────────────────────────

export async function hostexProperties(): Promise<NextResponse> {
  try {
    const properties = await getProperties();
    const db = getDb();
    let mappings: any[] = [];
    try { mappings = db.prepare('SELECT * FROM hostex_property_map').all(); } catch { /* table may not exist yet */ }
    const mappingMap = new Map(mappings.map((m: any) => [m.hostex_property_id, m]));
    const result = properties.map(p => ({ ...p, mapping: mappingMap.get(p.id) || null, is_mapped: mappingMap.has(p.id) }));
    return NextResponse.json({ properties: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── /api/hostex/bulk-sync ────────────────────────────────────────────────────

export async function hostexBulkSync(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const codesParam = searchParams.get('codes');

  try {
    if (codesParam) {
      const codes = codesParam.split(',').map(c => c.trim()).filter(Boolean);
      console.log(`[Bulk Sync] Force-syncing ${codes.length} specific codes:`, codes);

      const results: { code: string; status: string; created: number; updated: number; error?: string }[] = [];
      for (const code of codes) {
        try {
          const r = await syncSingleReservation(code);
          results.push({ code, status: r.errors.length ? 'error' : 'ok', created: r.created, updated: r.updated, error: r.errors[0] });
        } catch (e: any) {
          results.push({ code, status: 'error', created: 0, updated: 0, error: e.message });
        }
        await new Promise(r => setTimeout(r, 200));
      }

      return NextResponse.json({
        mode: 'targeted',
        total: codes.length,
        created: results.reduce((s, r) => s + r.created, 0),
        updated: results.reduce((s, r) => s + r.updated, 0),
        errors: results.filter(r => r.status === 'error').length,
        results,
      });
    }

    console.log('[Bulk Sync] Running full per-property sync...');
    const result = await syncReservations();
    return NextResponse.json({ mode: 'full', synced: result.synced, created: result.created, updated: result.updated, skipped: result.skipped, errors: result.errors.length, errorDetails: result.errors, eurCzkRate: result.eurCzkRate });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
