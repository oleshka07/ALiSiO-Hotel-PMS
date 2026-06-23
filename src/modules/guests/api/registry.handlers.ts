/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as registryRepo from '../data/registry.repo';

// ─── GET /api/guest-registry ─────────────────────────────────────────────────

export async function getRegistry(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const month = searchParams.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const foreignersOnly = searchParams.get('foreignersOnly') === 'true';
    const unregisteredOnly = searchParams.get('unregisteredOnly') === 'true';
    const search = searchParams.get('search') || undefined;
    const propertyId = searchParams.get('propertyId') || undefined;

    const entries = registryRepo.getRegistryEntries({ month, foreignersOnly, unregisteredOnly, search, propertyId });
    const summary = registryRepo.getRegistrySummary({ month, propertyId });

    return NextResponse.json({ entries, summary });
  } catch (error: any) {
    console.error('GET /api/guest-registry error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch registry' }, { status: 500 });
  }
}

// ─── PATCH /api/guest-registry/[id] ──────────────────────────────────────────

export async function updateRegistryEntry(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'mark_police': {
        const ref = body.ref || '';
        registryRepo.markPoliceReported(id, ref);
        break;
      }
      case 'unmark_police': {
        registryRepo.unmarkPoliceReported(id);
        break;
      }
      case 'update_fee': {
        const { feeAmount, feeExempt, feeExemptReason } = body;
        registryRepo.updateFee(id, { feeAmount, feeExempt, feeExemptReason });
        break;
      }
      case 'hide': {
        registryRepo.hideRegistryEntry(id);
        break;
      }
      case 'unhide': {
        registryRepo.unhideRegistryEntry(id);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/guest-registry/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to update registry entry' }, { status: 500 });
  }
}

// ─── GET /api/guest-registry?format=csv ──────────────────────────────────────

export async function exportRegistry(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const month = searchParams.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const foreignersOnly = searchParams.get('foreignersOnly') === 'true';
    const unregisteredOnly = searchParams.get('unregisteredOnly') === 'true';
    const search = searchParams.get('search') || undefined;
    const propertyId = searchParams.get('propertyId') || undefined;

    const entries = registryRepo.getRegistryEntries({ month, foreignersOnly, unregisteredOnly, search, propertyId });

    const headers = [
      'Jméno', 'Příjmení', 'Datum narození', 'Státní příslušnost',
      'Typ dokladu', 'Číslo dokladu', 'Adresa', 'Účel pobytu',
      'Check-in', 'Check-out', 'Noci', 'Jednotka',
      'Poplatek', 'Osvobozeno', 'Důvod osvobození',
      'Nahlášeno policii', 'Ref. policie',
    ];

    const escCsv = (val: any): string => {
      if (val == null) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = entries.map((e: any) => [
      e.first_name, e.last_name, e.date_of_birth, e.nationality,
      e.document_type, e.document_number, e.address, e.purpose_of_stay,
      e.check_in, e.check_out, e.nights, e.unit_name,
      e.fee_amount, e.fee_exempt ? 'Ano' : 'Ne', e.fee_exempt_reason,
      e.police_reported ? 'Ano' : 'Ne', e.police_report_ref,
    ].map(escCsv).join(','));

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="evidencni-kniha-${month}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('GET /api/guest-registry?format=csv error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to export registry' }, { status: 500 });
  }
}
