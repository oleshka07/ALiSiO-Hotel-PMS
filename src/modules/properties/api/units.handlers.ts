import { NextRequest, NextResponse } from 'next/server';
import * as unitsRepo from '../data/units.repo';

export async function listUnits(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const rows = unitsRepo.listUnits({
      category: searchParams.get('category') || undefined,
      unitType: searchParams.get('unitType') || undefined,
      includePool: searchParams.get('include_pool') === '1',
    });
    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/units error:', error);
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 });
  }
}

export async function createUnit(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    if (body.bulk) {
      const { property_id, category_id, building_id, unit_type_id, prefix, from, to, beds, zone } = body;

      if (!property_id || !category_id || !unit_type_id || !prefix || from === undefined || to === undefined) {
        return NextResponse.json({ error: 'For bulk: property_id, category_id, unit_type_id, prefix, from, to required' }, { status: 400 });
      }

      if (from > to || to - from > 200) {
        return NextResponse.json({ error: 'Invalid range (max 200 units at once)' }, { status: 400 });
      }

      const created = unitsRepo.bulkCreateUnits({ property_id, category_id, building_id, unit_type_id, prefix, from, to, beds, zone });
      return NextResponse.json({ created: created.length, items: created }, { status: 201 });
    }

    const { unit_type_id, property_id, category_id, building_id, name, code, floor, zone, beds, notes, sort_order } = body;

    if (!unit_type_id || !property_id || !category_id || !name || !code) {
      return NextResponse.json({ error: 'unit_type_id, property_id, category_id, name, and code are required' }, { status: 400 });
    }

    const unit = unitsRepo.createUnit({ unit_type_id, property_id, category_id, building_id, name, code, floor, zone, beds, notes, sort_order });
    return NextResponse.json(unit, { status: 201 });
  } catch (error: unknown) {
    console.error('POST /api/units error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create unit';
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Unit with this code already exists in this property' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type IdParams = { params: Promise<{ id: string }> };

export async function updateUnit(request: NextRequest, context: IdParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const updated = unitsRepo.updateUnit(id, body);
    if (!updated) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/units/:id error:', error);
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 });
  }
}

export async function deleteUnit(_request: NextRequest, context: IdParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const result = unitsRepo.deleteUnit(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/units/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete unit' }, { status: 500 });
  }
}
