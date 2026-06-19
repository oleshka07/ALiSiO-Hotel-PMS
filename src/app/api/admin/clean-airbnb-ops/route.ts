import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    
    // Find all operations that look like the Airbnb/Booking wizard import ones
    // and delete them. The user says:
    // "Airbnb: Viktor Lupsa 2026-05-08–2026-05-10 – Slow Down at the Mirror Tiny House"
    // "У нас не мають потрапляти дані з таких виписок. так як гроші нам фактично заходять з банкінгу"
    
    // Let's count them first
    const selectStmt = db.prepare(`
      SELECT id, comment, source, amount 
      FROM fin_operations 
      WHERE source = 'wizard_import' 
        AND (comment LIKE 'Airbnb: %' OR comment LIKE 'Booking.com: %' OR comment LIKE 'VRBO: %')
    `);
    
    const ops = selectStmt.all();
    
    if (request.nextUrl.searchParams.get('execute') === 'true') {
      const deleteStmt = db.prepare(`
        DELETE FROM fin_operations 
        WHERE source = 'wizard_import' 
          AND (comment LIKE 'Airbnb: %' OR comment LIKE 'Booking.com: %' OR comment LIKE 'VRBO: %')
      `);
      const info = deleteStmt.run();
      
      return NextResponse.json({
        success: true,
        message: `Deleted ${info.changes} operations.`,
        deleted_operations: ops
      });
    }

    return NextResponse.json({
      success: true,
      message: `Found ${ops.length} operations. To actually delete them, add ?execute=true to the URL.`,
      operations_to_delete: ops
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
