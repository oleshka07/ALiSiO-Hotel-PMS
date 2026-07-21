// ─── Public API of the payments module ───────────────────────────────────────
// This is the ONLY file other modules may import from.
// Import via: import { ... } from '@payments'

// Universal session factory (new). Callers build a PaymentIntent and pass it here.
export { createPaymentSession, getEnvStore } from '../api/create-payment-session';
export { createReservationPaymentLink } from './payment-link.handlers';

// Webhook handlers — route /api/webhooks/teya and /api/webhooks/teya-bot point here.
export { teyaWebhook } from './webhook-teya.handlers';
export { teyaBotWebhook } from './webhook-teya-bot.handlers';

// Site-specific Teya credentials resolution (booking_sites.payment_config).
// Returns null when no per-site config is set — callers fall back to global ENV.
export { resolveSiteCredentials, isGlobalTeyaConfigured } from '../data/site-credentials.repo';

// Resolve per-site Teya credentials from a reservation's source field.
// Used by guest-page payment handlers so payments match the store used at checkout.
export { resolveCredentialsForReservation } from '../data/resolve-reservation-credentials';

// Low-level Teya primitives — still exported so the webhook handlers and
// existing call-sites keep working during migration. New code should prefer
// createPaymentSession over calling createCheckoutSession directly.
export {
  createCheckoutSession,
  verifyWebhookSignature,
  refundPayment,
  sendReceipt,
  getTeyaAccessToken,
  getTeyaAccessTokenWithCreds,
} from '../domain/teya-client';

export type {
  CheckoutSessionOptions,
  CheckoutSessionResult,
  TeyaLineItem,
} from '../domain/teya-client';

export type {
  PaymentIntent,
  PaymentIntentKind,
  PaymentLineItem,
  PaymentSession,
  PaymentStatus,
  PaymentProvider,
  TeyaCredentials,
  ResolvedSiteCredentials,
} from '../domain/types';

export type {
  PaymentSessionCreatedEvent,
  PaymentCompletedEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
} from '../events/published';
