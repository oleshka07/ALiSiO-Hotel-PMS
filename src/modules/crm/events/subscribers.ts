import { eventBus } from '@core/event-bus';
import { getDb } from '@core/db';
import { onPaymentReceived } from '@/lib/crm/stage-transitions';

export function registerCrmSubscribers() {
  eventBus.on('booking.created', async (payload) => {
    try {
      const db = getDb();
      const leadId = `l_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
      const guest = db.prepare('SELECT first_name, last_name, email, phone FROM guests WHERE id = ?').get(payload.guestId) as any;
      
      db.prepare(`
        INSERT INTO crm_leads (id, organization_id, guest_id, reservation_id, first_name, last_name, email, phone, stage, source, estimated_value, currency, check_in_date, check_out_date, adults, children, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        leadId, 
        org?.id || null, 
        payload.guestId, 
        payload.bookingId, 
        guest?.first_name || 'Guest',
        guest?.last_name || '',
        guest?.email || null,
        guest?.phone || null,
        payload.source || 'widget',
        payload.total || 0,
        payload.currency || 'CZK',
        payload.checkIn || null,
        payload.checkOut || null,
        payload.adults || 2,
        payload.children || 0,
      );
      
      console.log(`[CRM Subscriber] Lead ${leadId} created from booking ${payload.bookingId}`);
    } catch (e: any) {
      console.error('[CRM Subscriber] Error processing booking.created:', e.message);
    }
  });

  eventBus.on('payment.completed', async (payload) => {
    try {
      // Only process booking payments for CRM stage updates
      if (payload.intentKind !== 'booking_full' && payload.intentKind !== 'booking_deposit') {
        return;
      }

      const db = getDb();
      const leadByPayment = db.prepare(`
        SELECT l.id, l.stage, l.estimated_value, r.total_price 
        FROM crm_leads l
        JOIN reservations r ON r.id = l.reservation_id
        WHERE l.reservation_id IN (
          SELECT so.reservation_id FROM service_orders so WHERE so.payment_id = ?
          UNION SELECT bso.reservation_id FROM booking_service_orders bso WHERE bso.payment_id = ?
          UNION SELECT id FROM reservations WHERE payment_id = ?
        ) LIMIT 1
      `).get(payload.paymentId, payload.paymentId, payload.paymentId) as any;

      if (leadByPayment) {
        const totalPrice = leadByPayment.total_price || leadByPayment.estimated_value || 0;
        const isFullPayment = !!(payload.amount && totalPrice > 0 && payload.amount >= totalPrice * 0.9);
        onPaymentReceived(leadByPayment.id, leadByPayment.stage, isFullPayment);
        console.log(`[CRM Subscriber] Updated stage for lead ${leadByPayment.id} on payment completion`);
      }
    } catch (e: any) {
      console.error('[CRM Subscriber] Error processing payment.completed:', e.message);
    }
  });
}
