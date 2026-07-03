import { eventBus } from '@core/event-bus';
import { getDb } from '@core/db';
// Need to use the internal data layer here since we are inside the bookings module
import { sendBookingConfirmationEmail } from '../data/send-confirmation-email';

export function registerBookingsSubscribers() {
  eventBus.on('payment.completed', async (payload) => {
    try {
      // We only send booking confirmations for full or deposit payments related to bookings
      if (payload.intentKind !== 'booking_full' && payload.intentKind !== 'booking_deposit') {
        return;
      }

      const db = getDb();
      
      const row = db.prepare(`
        SELECT id FROM reservations WHERE payment_id = ?
        UNION
        SELECT reservation_id FROM booking_service_orders WHERE payment_id = ? AND reservation_id IS NOT NULL
        UNION
        SELECT reservation_id FROM service_orders WHERE payment_id = ? AND reservation_id IS NOT NULL
        LIMIT 1
      `).get(payload.paymentId, payload.paymentId, payload.paymentId) as { id: string } | undefined;

      if (row?.id) {
        // We must await it in serverless environments (Vercel) so the lambda doesn't freeze
        try {
          await sendBookingConfirmationEmail(row.id);
        } catch (e: any) {
          console.error(`[Bookings Subscriber] Failed to send email for res ${row.id}:`, e.message);
        }
      } else {
        console.warn(`[Bookings Subscriber] Could not find reservation for payment ${payload.paymentId}`);
      }
    } catch (e: any) {
      console.error('[Bookings Subscriber] Error processing payment.completed:', e.message);
    }
  });

  // Edit Telegram notification when payment_status changes
  eventBus.on('booking.payment_status_changed', async (payload) => {
    try {
      const { updateBookingPaymentNotification } = await import('@/modules/notifications/data/tg-message-updater');
      await updateBookingPaymentNotification(payload.bookingId, payload.newStatus);
    } catch (e: any) {
      console.error('[Bookings Subscriber] TG payment edit error:', e.message);
    }
  });
}
