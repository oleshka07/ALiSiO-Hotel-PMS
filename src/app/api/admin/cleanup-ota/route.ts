import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    
    // We want to delete all operations generated from OTA statements (Airbnb, Booking.com)
    // Their source is either 'airbnb' or 'booking_com'.
    const result = db.prepare(`
      DELETE FROM fin_operations 
      WHERE source IN ('airbnb', 'booking_com')
    `).run();

    return NextResponse.json({
      success: true,
      message: 'OTA operations deleted successfully.',
      deleted_count: result.changes,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
