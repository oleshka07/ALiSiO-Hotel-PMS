/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';
import { NextRequest, NextResponse } from 'next/server';

export async function exportGuestData(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    
    // Fetch main guest profile
    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(id) as any;
    if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });

    // Fetch reservations where they were the primary booker
    const bookings = db.prepare('SELECT * FROM reservations WHERE guest_id = ?').all(id) as any[];

    // Fetch guest registrations (Evidenční kniha entries)
    const registrations = db.prepare('SELECT * FROM reservation_guests WHERE guest_id = ?').all(id) as any[];

    // GDPR consent logs
    const consentLogs = db.prepare('SELECT * FROM guest_registrations WHERE guest_id = ?').all(id) as any[];

    const exportData = {
      generatedAt: new Date().toISOString(),
      company: 'Kemp Carlsbad s.r.o.',
      guestProfile: guest,
      bookings,
      registrations,
      consentLogs,
    };

    return NextResponse.json(exportData);
  } catch (error: any) {
    console.error('GDPR Export Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function eraseGuestData(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    // The 6-year rule: We must retain Evidenční kniha data for 6 years after checkout.
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 6);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    db.transaction(() => {
      // 1. Delete or anonymize profile data (email, phone can be deleted immediately)
      db.prepare(`
        UPDATE guests
        SET email = NULL,
            phone = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(id);

      // 2. Anonymize name/doc ONLY IF they have no stays in the last 6 years
      const recentStays = db.prepare(`
        SELECT 1 FROM reservation_guests rg
        JOIN reservations r ON r.id = rg.reservation_id
        WHERE rg.guest_id = ? AND r.check_out >= ?
        LIMIT 1
      `).get(id, cutoffStr);

      if (!recentStays) {
        db.prepare(`
          UPDATE guests
          SET first_name = 'Anonymized',
              last_name = 'Anonymized',
              date_of_birth = NULL,
              document_type = NULL,
              document_number = NULL,
              country = NULL,
              address = NULL
          WHERE id = ?
        `).run(id);

        // Also anonymize old registration data just in case
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
          WHERE guest_id = ?
        `).run(id);
      }
    })();

    return NextResponse.json({ success: true, message: 'Erasure request processed (data retained if required by law)' });
  } catch (error: any) {
    console.error('GDPR Erasure Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
