/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function listBusinessUnits(): Promise<NextResponse> {
  try {
    const db = getDb();
    const units = db.prepare(`SELECT * FROM business_units WHERE is_active = 1 ORDER BY sort_order ASC`).all();
    return NextResponse.json(units);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
