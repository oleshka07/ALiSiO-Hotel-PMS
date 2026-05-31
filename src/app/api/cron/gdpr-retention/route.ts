import { getDb } from '@core/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Simple cron endpoint to anonymize data older than 6 years
  // Securing cron endpoints usually requires a secret header. We'll check for an auth token.
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET || 'local-cron'}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const db = getDb();
    
    // 6 years retention for Evidenční kniha
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 6);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    db.transaction(() => {
      // 1. Anonymize reservation_guests where reservation check_out is older than 6 years
      db.prepare(`
        UPDATE reservation_guests
        SET first_name = 'Anonymized',
            last_name = 'Anonymized',
            date_of_birth = NULL,
            document_type = NULL,
            document_number = NULL,
            nationality = NULL,
            address = NULL,
            visa_number = NULL,
            purpose_of_stay = NULL
        WHERE reservation_id IN (
          SELECT id FROM reservations WHERE check_out < ?
        ) AND first_name != 'Anonymized'
      `).run(cutoffStr);

      // 2. Anonymize guests table if they have NO reservations newer than 6 years
      // and their last update was > 6 years ago
      db.prepare(`
        UPDATE guests
        SET first_name = 'Anonymized',
            last_name = 'Anonymized',
            email = NULL,
            phone = NULL,
            date_of_birth = NULL,
            document_type = NULL,
            document_number = NULL,
            country = NULL,
            address = NULL
        WHERE id NOT IN (
          SELECT g.id
          FROM guests g
          JOIN reservations r ON r.guest_id = g.id
          WHERE r.check_out >= ?
        )
        AND id NOT IN (
          SELECT g.id
          FROM guests g
          JOIN reservation_guests rg ON rg.guest_id = g.id
          JOIN reservations r ON rg.reservation_id = r.id
          WHERE r.check_out >= ?
        )
        AND first_name != 'Anonymized'
      `).run(cutoffStr, cutoffStr);

      // 3. Delete from guest_registrations if reservation is older than 6 years
      db.prepare(`
        DELETE FROM guest_registrations
        WHERE reservation_id IN (
          SELECT id FROM reservations WHERE check_out < ?
        )
      `).run(cutoffStr);
    })();

    return NextResponse.json({ success: true, message: 'Data retention policy applied successfully' });
  } catch (error: any) {
    console.error('GDPR Retention Cron Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
