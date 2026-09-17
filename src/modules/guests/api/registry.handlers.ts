/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as registryRepo from '../data/registry.repo';
import { buildUnl, encodeCp1250, type UnlGuest } from '../domain/ubyport';
import { publicMessage } from '@core/security/public-error';

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
    return NextResponse.json({ error: publicMessage(error, 'Failed to fetch registry') }, { status: 500 });
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
    return NextResponse.json({ error: publicMessage(error, 'Failed to update registry entry') }, { status: 500 });
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
    return NextResponse.json({ error: publicMessage(error, 'Failed to export registry') }, { status: 500 });
  }
}

// ─── PATCH /api/guest-registry ───────────────────────────────────────────────
//
// Marking a whole Ubyport batch at once. Per-guest marking stays on
// /[id]; a batch is confirmed as a batch or not at all.

export async function bulkUpdateRegistry(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    if (body.action !== 'mark_police_bulk') {
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : [];
    if (!ids.length) return NextResponse.json({ error: 'No ids given' }, { status: 400 });

    const ref = String(body.ref || '').slice(0, 100);
    if (!ref) return NextResponse.json({ error: 'Reference is required' }, { status: 400 });

    const marked = registryRepo.markPoliceReportedBulk(ids, ref);
    return NextResponse.json({ success: true, marked });
  } catch (error: any) {
    console.error('PATCH /api/guest-registry error:', error?.message || error);
    return NextResponse.json({ error: publicMessage(error, 'Failed to mark batch') }, { status: 500 });
  }
}

// ─── GET /api/guest-registry?format=unl ──────────────────────────────────────
//
// Ubyport batch file — Příloha č. 3 Provozního řádu, záznam A + záznamy U.
//
// `dry=1` returns what would be exported (counts, the ids, and every record the
// police would reject) without producing a file. Without `skipInvalid=1` a
// batch that contains any rejectable record is refused outright: a file that
// quietly omits guests is what let the July–September gap go unnoticed.

function rangeFrom(searchParams: URLSearchParams): { from: string; to: string; label: string } {
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from && to) return { from, to, label: `${from}_${to}` };

  const now = new Date();
  const month = searchParams.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, label: month };
}

export async function exportRegistryUnl(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const { from, to, label } = rangeFrom(searchParams);
    const dry = searchParams.get('dry') === '1';
    const skipInvalid = searchParams.get('skipInvalid') === '1';

    const provider = registryRepo.getUbyportProvider();
    const missing: string[] = [];
    if (!/^[A-Za-z0-9]{12,14}$/.test(provider.idub)) missing.push('IDUB (12–14 znaků)');
    if (!/^[A-Za-z0-9]{5}$/.test(provider.zkratka)) missing.push('zkratka ubytovatele (5 znaků)');
    if (!provider.ubytovatel) missing.push('název ubytovacího zařízení');
    if (!/^\d{2}$/.test(provider.ucelPobytu)) missing.push('účel pobytu (dvouciferný kód z číselníku)');
    if (missing.length) {
      return NextResponse.json(
        {
          error: 'Nastavení Ubyportu není úplné',
          detail: `Doplňte v Nastavení → Ubyport: ${missing.join(', ')}`,
          missing,
        },
        { status: 422 },
      );
    }

    // Czechs are not reported to the foreign police, and a guest already
    // confirmed in Ubyport must not be sent twice.
    const entries = registryRepo.getRegistryEntries({
      month: label,
      from,
      to,
      foreignersOnly: true,
      unregisteredOnly: searchParams.get('includeReported') !== '1',
      propertyId: searchParams.get('propertyId') || undefined,
    });

    const result = buildUnl(entries as unknown as UnlGuest[], provider);
    const exportedIds = entries
      .filter((e: any) => !result.problems.some((p) => p.id === e.id))
      .map((e: any) => e.id);

    if (dry) {
      return NextResponse.json({
        from,
        to,
        candidates: entries.length,
        records: result.records,
        ids: exportedIds,
        problems: result.problems,
        warnings: result.warnings,
      });
    }

    if (result.problems.length && !skipInvalid) {
      return NextResponse.json(
        {
          error: `${result.problems.length} záznamů by policie odmítla`,
          candidates: entries.length,
          records: result.records,
          problems: result.problems,
          warnings: result.warnings,
        },
        { status: 422 },
      );
    }

    if (!result.records) {
      return NextResponse.json({ error: 'Žádné záznamy k odeslání', from, to }, { status: 422 });
    }

    // §3.1 — CP1250, never UTF-8.
    const body = encodeCp1250(result.content);

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="ubyport-${label}.unl"`,
        'X-Unl-Records': String(result.records),
        'X-Unl-Skipped': String(result.problems.length),
        'X-Unl-Ids': exportedIds.join(','),
      },
    });
  } catch (error: any) {
    console.error('GET /api/guest-registry?format=unl error:', error?.message || error);
    return NextResponse.json({ error: publicMessage(error, 'Failed to export UNL') }, { status: 500 });
  }
}

// ─── /api/ubyport-settings ───────────────────────────────────────────────────
//
// Záznam typu A (§3.2) is the property, not the guest: IDUB and the five-letter
// zkratka come from the Služba cizinecké policie registration, the rest is the
// address of the site. Kept in `settings` so the export never hard-codes them.

export async function getUbyportSettings(): Promise<NextResponse> {
  try {
    return NextResponse.json(registryRepo.getUbyportProvider());
  } catch (error: any) {
    console.error('GET /api/ubyport-settings error:', error?.message || error);
    return NextResponse.json({ error: publicMessage(error, 'Failed to read settings') }, { status: 500 });
  }
}

export async function saveUbyportSettings(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    registryRepo.saveUbyportProvider(body);
    return NextResponse.json({ success: true, settings: registryRepo.getUbyportProvider() });
  } catch (error: any) {
    console.error('PUT /api/ubyport-settings error:', error?.message || error);
    return NextResponse.json({ error: publicMessage(error, 'Failed to save settings') }, { status: 500 });
  }
}
