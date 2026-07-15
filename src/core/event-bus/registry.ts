/**
 * Central registry of all domain events in the system.
 * Add new event types here as modules emit them.
 *
 * Convention: '<module>.<past-tense-verb>'
 */
export type AppEvents = {
  // Bookings
  'booking.created': { bookingId: string; guestId: string; unitId: string; total: number; currency?: string; source?: string; email?: string };
  'booking.cancelled': { bookingId: string; reason: string };
  'booking.checked_in': { bookingId: string; guestId: string };
  'booking.checked_out': { bookingId: string; guestId: string };
  'booking.updated': { bookingId: string; changes: Record<string, unknown> };
  'booking.payment_status_changed': { bookingId: string; oldStatus: string; newStatus: string };

  // Guests
  'guest.created': { guestId: string; email: string | null };
  'guest.updated': { guestId: string };

  // Payments
  'payment.received': { paymentId: string; bookingId: string; amount: number; currency: string };
  'payment.refunded': { paymentId: string; bookingId: string; amount: number };

  // Payments (session-level, emitted by the payments module)
  'payment.session_created': {
    sessionId: string;
    provider: string;
    intentKind: string;
    amount: number;
    currency: string;
  };
  'payment.completed': {
    sessionId: string;
    provider: string;
    intentKind: string;
    paymentId: string;
    amount: number;
    currency: string;
  };
  'payment.failed': {
    sessionId: string;
    provider: string;
    intentKind: string;
    reason?: string;
  };

  // Channels
  'channel.reservation_synced': { reservationCode: string; source: string; bookingId: string };
  'channel.sync_failed': { source: string; error: string };

  // CRM
  'crm.lead_created': { leadId: string; source: string };
  'crm.message_received': { conversationId: string; channel: string };
};

export type EventName = keyof AppEvents;
export type EventPayload<T extends EventName> = AppEvents[T];
